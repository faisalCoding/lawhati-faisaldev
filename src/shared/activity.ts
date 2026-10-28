import { isCardDone } from './cards';
import type {
  ActivityEntry,
  ActivityWhat,
  Board,
  Card,
  ChecklistItem,
  List,
  Meeting,
  Outcome,
  Op,
  OpInput,
  Policy,
  UndoStep,
} from './types';

// The board's activity: who changed what, and how to undo it. The reducer notes every change as it
// applies it, on the sync server and on each device alike, so the whole team sees the same history.
// Each entry keeps the operations that put things back; undoing an entry sends them as a new group,
// which is an entry of its own (and undoing that one is a redo).

/** The most entries a board keeps; the oldest go first. */
export const MAX_ACTIVITY = 100;
/** Cards one entry may keep a copy of to bring back (a whole list's, a selection's). */
const MAX_UNDO_CARDS = 500;
/**
 * Cards the whole log may keep copies of. Past it, the oldest entries lose their undo (they stay in
 * the log), so the board stays small enough to send and to save on a phone.
 */
const MAX_HELD_CARDS = 600;

export const BOARD_FIELDS = ['title', 'color', 'icon', 'buttons'] as const;
export const LIST_FIELDS = ['title', 'wipLimit'] as const;
export const CARD_FIELDS = ['title', 'description', 'due', 'dueDone', 'cover', 'link', 'assignees'] as const;
export const CHECK_FIELDS = ['text', 'done', 'assignee', 'due'] as const;
export const MEETING_FIELDS = ['title', 'date', 'place', 'columnId', 'held'] as const;
export const TOPIC_FIELDS = ['title', 'notes'] as const;
export const OUTCOME_FIELDS = [
  'kind',
  'text',
  'topicId',
  'assignee',
  'due',
  'cardId',
  'itemId',
  'policyId',
  'done',
] as const;
export const POLICY_TOPIC_FIELDS = ['title', 'columnId'] as const;
export const POLICY_FIELDS = ['text', 'topicId', 'subtopicId', 'effectiveFrom', 'meetingId'] as const;

type BoardField = (typeof BOARD_FIELDS)[number];
type CardField = (typeof CARD_FIELDS)[number];
type CheckField = (typeof CHECK_FIELDS)[number];
type MeetingField = (typeof MEETING_FIELDS)[number];
type OutcomeField = (typeof OUTCOME_FIELDS)[number];
type PolicyField = (typeof POLICY_FIELDS)[number];

/** Whether two values are the same, a missing value counting as null. */
export const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A meeting's field as every version reads it: `place` is optional and counts as empty. */
export function meetingField(meeting: Meeting, key: MeetingField): unknown {
  switch (key) {
    case 'place':
      return meeting.place ?? '';
    case 'columnId':
      return meeting.columnId ?? null;
    case 'held':
      // Absent is not false: it means «read it from the date». Undo must put the absence back,
      // not write a false that would freeze a past meeting as not held.
      return meeting.held ?? null;
    default:
      return meeting[key];
  }
}

/** An outcome's field as every version reads it: the task-only fields count as empty otherwise. */
export function outcomeField(outcome: Outcome, key: OutcomeField): unknown {
  switch (key) {
    case 'topicId':
      return outcome.topicId ?? null;
    case 'assignee':
      return outcome.assignee ?? null;
    case 'due':
      return outcome.due ?? null;
    case 'cardId':
      return outcome.cardId ?? null;
    case 'itemId':
      return outcome.itemId ?? null;
    case 'policyId':
      return outcome.policyId ?? null;
    case 'done':
      return outcome.done ?? false;
    default:
      return outcome[key];
  }
}

/** A policy's field as every version reads it: an unfiled rule and one with no meeting read null. */
export function policyField(policy: Policy, key: PolicyField): unknown {
  switch (key) {
    case 'topicId':
      return policy.topicId ?? null;
    case 'subtopicId':
      return policy.subtopicId ?? null;
    case 'effectiveFrom':
      return policy.effectiveFrom ?? null;
    case 'meetingId':
      return policy.meetingId ?? null;
    default:
      return policy[key];
  }
}

/** A card's field as every version reads it: fields older cards lack have their default. */
export function cardField(card: Card, key: CardField): unknown {
  switch (key) {
    case 'dueDone':
      return card.dueDone ?? false;
    case 'link':
      return card.link ?? null;
    case 'assignees':
      return card.assignees ?? [];
    default:
      return card[key];
  }
}

export function checkField(item: ChecklistItem, key: CheckField): unknown {
  return key === 'assignee' ? (item.assignee ?? null) : item[key];
}

function boardField(board: Board, key: BoardField): unknown {
  return key === 'buttons' ? (board.buttons ?? []) : board[key];
}

const listOf = (board: Board, cardId: string): List | undefined => board.lists.find((l) => l.cardIds.includes(cardId));

/** The fields a patch really changed: their values before (to put back) and after (to expect then). */
function changes<K extends string>(
  keys: readonly K[],
  patch: object,
  before: (key: K) => unknown,
  after: (key: K) => unknown,
): { patch: Record<string, unknown>; expect: Record<string, unknown> } | null {
  const back: Record<string, unknown> = {};
  const expect: Record<string, unknown> = {};
  for (const key of keys) {
    if ((patch as Record<string, unknown>)[key] === undefined) continue;
    const was = before(key);
    const now = after(key);
    if (same(was, now)) continue;
    back[key] = was;
    expect[key] = now;
  }
  return Object.keys(back).length ? { patch: back, expect } : null;
}

/** What an operation did, in the names things had then. Null for what is not worth a line. */
function whatOf(before: Board, after: Board, op: Op): ActivityWhat | null {
  switch (op.type) {
    case 'board/update': {
      const changed = (key: BoardField) =>
        op.patch[key] !== undefined && !same(boardField(before, key), boardField(after, key));
      if (changed('title')) return { type: 'board/title', title: after.title };
      if (changed('buttons')) return { type: 'board/buttons' };
      if (changed('color') || changed('icon')) return { type: 'board/look' };
      return null;
    }
    case 'powerUp/set':
      return { type: 'powerUp', key: op.key, on: op.enabled };
    case 'label/rename': {
      const label = after.labels.find((l) => l.id === op.labelId);
      return label ? { type: 'label/rename', name: label.name, color: label.color } : null;
    }
    case 'meeting/add':
      return { type: 'meeting/add', meeting: op.meeting.title };
    case 'meeting/update': {
      const was = (before.meetings ?? []).find((m) => m.id === op.meetingId);
      const now = (after.meetings ?? []).find((m) => m.id === op.meetingId);
      if (!was || !now) return null;
      if (was.title !== now.title) return { type: 'meeting/title', meeting: now.title, from: was.title };
      if (was.date !== now.date) return { type: 'meeting/when', meeting: now.title, date: now.date };
      if ((was.place ?? '') !== (now.place ?? '')) return { type: 'meeting/where', meeting: now.title };
      if ((was.held ?? null) !== (now.held ?? null)) {
        return { type: 'meeting/held', meeting: now.title, held: now.held === true };
      }
      if ((was.columnId ?? null) !== (now.columnId ?? null)) {
        const column = (after.columns ?? []).find((c) => c.id === now.columnId);
        return { type: 'meeting/file', meeting: now.title, column: column?.title ?? null };
      }
      return null;
    }
    case 'meeting/remove': {
      const meeting = (before.meetings ?? []).find((m) => m.id === op.meetingId);
      return meeting ? { type: 'meeting/remove', meeting: meeting.title, topics: meeting.topics.length } : null;
    }
    case 'meeting/attend': {
      const meeting = (after.meetings ?? []).find((m) => m.id === op.meetingId);
      return meeting ? { type: 'meeting/attend', meeting: meeting.title, who: op.person.name, on: op.on } : null;
    }
    case 'topic/add': {
      const meeting = (after.meetings ?? []).find((m) => m.id === op.meetingId);
      return meeting ? { type: 'topic/add', meeting: meeting.title, topic: op.topic.title } : null;
    }
    case 'topic/update': {
      const meeting = (after.meetings ?? []).find((m) => m.id === op.meetingId);
      const was = (before.meetings ?? []).find((m) => m.id === op.meetingId)?.topics.find((t) => t.id === op.topicId);
      const now = meeting?.topics.find((t) => t.id === op.topicId);
      if (!meeting || !was || !now) return null;
      if (was.title !== now.title) return { type: 'topic/title', meeting: meeting.title, topic: now.title, from: was.title };
      if (was.notes !== now.notes) return { type: 'topic/notes', meeting: meeting.title, topic: now.title };
      return null;
    }
    case 'topic/move': {
      const meeting = (after.meetings ?? []).find((m) => m.id === op.meetingId);
      const topic = meeting?.topics.find((t) => t.id === op.topicId);
      return meeting && topic ? { type: 'topic/move', meeting: meeting.title, topic: topic.title } : null;
    }
    case 'topic/remove': {
      const meeting = (before.meetings ?? []).find((m) => m.id === op.meetingId);
      const topic = meeting?.topics.find((t) => t.id === op.topicId);
      return meeting && topic ? { type: 'topic/remove', meeting: meeting.title, topic: topic.title } : null;
    }
    case 'outcome/add': {
      const meeting = (after.meetings ?? []).find((m) => m.id === op.meetingId);
      return meeting
        ? { type: 'outcome/add', meeting: meeting.title, kind: op.outcome.kind, text: op.outcome.text }
        : null;
    }
    case 'outcome/update': {
      const meeting = (after.meetings ?? []).find((m) => m.id === op.meetingId);
      const was = (before.meetings ?? [])
        .find((m) => m.id === op.meetingId)
        ?.outcomes?.find((o) => o.id === op.outcomeId);
      const now = meeting?.outcomes?.find((o) => o.id === op.outcomeId);
      if (!meeting || !was || !now) return null;
      // A card made from an outcome is the one change worth naming on its own: it is how a
      // recommendation becomes work on the board.
      if ((was.cardId ?? null) !== (now.cardId ?? null) && now.cardId) {
        // A card of its own, or a task inside one — the line says which.
        const inside = now.itemId ? (after.cards[now.cardId]?.title ?? null) : null;
        return { type: 'outcome/card', meeting: meeting.title, text: now.text, inside };
      }
      if ((was.policyId ?? null) !== (now.policyId ?? null) && now.policyId) {
        // Whether it wrote a new rule or amended one already there — a reader wants to know which.
        // Read from the rule's absence at the moment the link is made, which is why the link is
        // dispatched before the rule is written (see `policyFromOutcome`): afterwards every rule
        // exists and the two cases are indistinguishable from here.
        const existed = (before.policies ?? []).some((x) => x.id === now.policyId);
        return { type: 'outcome/policy', meeting: meeting.title, text: now.text, added: !existed };
      }
      if ((was.done ?? false) !== (now.done ?? false)) {
        return { type: 'outcome/done', meeting: meeting.title, text: now.text, done: now.done ?? false };
      }
      if (was.kind !== now.kind) return { type: 'outcome/kind', meeting: meeting.title, text: now.text, kind: now.kind };
      if ((was.topicId ?? null) !== (now.topicId ?? null)) {
        const topic = meeting.topics.find((t) => t.id === now.topicId);
        return { type: 'outcome/topic', meeting: meeting.title, text: now.text, topic: topic?.title ?? null };
      }
      if (was.text !== now.text) return { type: 'outcome/text', meeting: meeting.title, text: now.text };
      if ((was.assignee?.id ?? null) !== (now.assignee?.id ?? null)) {
        return { type: 'outcome/assign', meeting: meeting.title, text: now.text, to: now.assignee?.name ?? null };
      }
      if ((was.due ?? null) !== (now.due ?? null)) {
        return { type: 'outcome/due', meeting: meeting.title, text: now.text, due: now.due ?? null };
      }
      return null;
    }
    case 'outcome/remove': {
      const meeting = (before.meetings ?? []).find((m) => m.id === op.meetingId);
      const outcome = meeting?.outcomes?.find((o) => o.id === op.outcomeId);
      return meeting && outcome ? { type: 'outcome/remove', meeting: meeting.title, text: outcome.text } : null;
    }
    case 'agenda/add':
      return { type: 'agenda/add', subject: op.subject.title };
    case 'agenda/update': {
      const was = (before.agenda ?? []).find((a) => a.id === op.subjectId);
      const now = (after.agenda ?? []).find((a) => a.id === op.subjectId);
      return was && now && was.title !== now.title
        ? { type: 'agenda/title', subject: now.title, from: was.title }
        : null;
    }
    case 'agenda/move': {
      const subject = (after.agenda ?? []).find((a) => a.id === op.subjectId);
      return subject ? { type: 'agenda/move', subject: subject.title } : null;
    }
    case 'agenda/remove': {
      const subject = (before.agenda ?? []).find((a) => a.id === op.subjectId);
      return subject ? { type: 'agenda/remove', subject: subject.title } : null;
    }
    case 'column/add':
      return { type: 'column/add', column: op.column.title, kind: op.column.kind };
    case 'column/update': {
      const was = (before.columns ?? []).find((c) => c.id === op.columnId);
      const now = (after.columns ?? []).find((c) => c.id === op.columnId);
      return was && now && was.title !== now.title ? { type: 'column/title', column: now.title, from: was.title } : null;
    }
    case 'column/move': {
      const column = (after.columns ?? []).find((c) => c.id === op.columnId);
      return column ? { type: 'column/move', column: column.title } : null;
    }
    case 'column/remove': {
      const column = (before.columns ?? []).find((c) => c.id === op.columnId);
      if (!column) return null;
      const held =
        column.kind === 'meetings'
          ? (before.meetings ?? []).filter((m) => (m.columnId ?? null) === op.columnId).length
          : (before.policyTopics ?? []).filter((t) => (t.columnId ?? null) === op.columnId).length;
      const moved = (after.columns ?? []).find((c) => c.id === op.moveTo);
      return { type: 'column/remove', column: column.title, cards: held, movedTo: moved?.title ?? null };
    }
    case 'policy/add': {
      const topic = (after.policyTopics ?? []).find((t) => t.id === op.policy.topicId);
      return { type: 'policy/add', policy: op.policy.text, column: topic?.title ?? null };
    }
    case 'policy/update': {
      const was = (before.policies ?? []).find((x) => x.id === op.policyId);
      const now = (after.policies ?? []).find((x) => x.id === op.policyId);
      if (!was || !now) return null;
      if (was.text !== now.text) return { type: 'policy/text', policy: now.text, from: was.text };
      if ((was.topicId ?? null) !== (now.topicId ?? null) || (was.subtopicId ?? null) !== (now.subtopicId ?? null)) {
        const topic = (after.policyTopics ?? []).find((t) => t.id === now.topicId);
        const subtopic = topic?.subtopics.find((x) => x.id === now.subtopicId);
        return { type: 'policy/file', policy: now.text, topic: topic?.title ?? null, subtopic: subtopic?.title ?? null };
      }
      if ((was.effectiveFrom ?? null) !== (now.effectiveFrom ?? null)) {
        return { type: 'policy/effective', policy: now.text, from: now.effectiveFrom ?? null };
      }
      return null;
    }
    case 'policy/move': {
      const policy = (after.policies ?? []).find((x) => x.id === op.policyId);
      return policy ? { type: 'policy/move', policy: policy.text } : null;
    }
    case 'policy/repeal': {
      const policy = (after.policies ?? []).find((x) => x.id === op.policyId);
      return policy ? { type: 'policy/repeal', policy: policy.text } : null;
    }
    case 'policy/restore': {
      const policy = (after.policies ?? []).find((x) => x.id === op.policyId);
      return policy ? { type: 'policy/restore', policy: policy.text } : null;
    }
    case 'policy/remove': {
      const policy = (before.policies ?? []).find((x) => x.id === op.policyId);
      return policy ? { type: 'policy/remove', policy: policy.text } : null;
    }
    case 'member/seen': {
      const was = (before.members ?? []).some((m) => m.id === op.member.id);
      return { type: 'member/seen', name: op.member.name, renamed: was };
    }
    case 'list/add':
      return { type: 'list/add', list: op.list.title };
    case 'list/update': {
      const was = before.lists.find((l) => l.id === op.listId);
      const now = after.lists.find((l) => l.id === op.listId);
      if (!was || !now) return null;
      if (was.title !== now.title) return { type: 'list/title', list: now.title, from: was.title };
      if (was.wipLimit !== now.wipLimit) return { type: 'list/wip', list: now.title, limit: now.wipLimit };
      return null;
    }
    case 'list/move': {
      const list = after.lists.find((l) => l.id === op.listId);
      return list ? { type: 'list/move', list: list.title } : null;
    }
    case 'list/remove': {
      const list = before.lists.find((l) => l.id === op.listId);
      return list ? { type: 'list/remove', list: list.title, cards: list.cardIds.length } : null;
    }
    case 'card/add':
      return { type: 'card/add', card: op.card.title, list: listOf(after, op.card.id)?.title ?? '' };
    case 'card/remove': {
      const card = before.cards[op.cardId];
      return card ? { type: 'card/remove', card: card.title } : null;
    }
    case 'card/move': {
      const card = after.cards[op.cardId];
      const to = listOf(after, op.cardId);
      return card && to
        ? { type: 'card/move', card: card.title, from: listOf(before, op.cardId)?.title ?? '', to: to.title }
        : null;
    }
    case 'card/update': {
      const was = before.cards[op.cardId];
      const now = after.cards[op.cardId];
      if (!was || !now) return null;
      const changed = (key: CardField) =>
        op.patch[key] !== undefined && !same(cardField(was, key), cardField(now, key));
      const card = now.title;
      if (changed('dueDone')) return { type: 'card/done', card, done: isCardDone(now) };
      if (changed('assignees')) {
        const had = was.assignees ?? [];
        const has = now.assignees ?? [];
        return {
          type: 'card/assign',
          card,
          added: has.filter((a) => !had.some((b) => b.id === a.id)).map((a) => a.name),
          removed: had.filter((a) => !has.some((b) => b.id === a.id)).map((a) => a.name),
        };
      }
      if (changed('due')) return { type: 'card/due', card, due: now.due };
      if (changed('title')) return { type: 'card/title', card, from: was.title };
      if (changed('description')) return { type: 'card/description', card };
      if (changed('cover')) return { type: 'card/cover', card, on: !!now.cover };
      // Refreshing a linked board's name or code is the app's own bookkeeping, not news.
      if (changed('link') && (was.link?.boardId ?? null) !== (now.link?.boardId ?? null)) {
        return { type: 'card/link', card, board: now.link?.title ?? null };
      }
      return null;
    }
    case 'card/setLabel': {
      const card = after.cards[op.cardId];
      const label = after.labels.find((l) => l.id === op.labelId);
      return card
        ? { type: 'card/label', card: card.title, label: label?.name ?? '', color: label?.color ?? '', on: op.on }
        : null;
    }
    case 'check/add': {
      const card = after.cards[op.cardId];
      return card ? { type: 'task/add', card: card.title, task: op.item.text } : null;
    }
    case 'check/update': {
      const card = after.cards[op.cardId];
      const was = before.cards[op.cardId]?.checklist.find((i) => i.id === op.itemId);
      const now = card?.checklist.find((i) => i.id === op.itemId);
      if (!card || !was || !now) return null;
      if (was.done !== now.done) return { type: 'task/done', card: card.title, task: now.text, done: now.done };
      if (!same(was.due, now.due)) {
        return { type: 'task/due', card: card.title, task: now.text, due: now.due ?? null };
      }
      if (!same(was.assignee, now.assignee)) {
        return { type: 'task/assign', card: card.title, task: now.text, to: now.assignee?.name ?? null };
      }
      if (was.text !== now.text) return { type: 'task/edit', card: card.title, task: now.text, from: was.text };
      return null;
    }
    case 'check/remove': {
      const card = before.cards[op.cardId];
      const item = card?.checklist.find((i) => i.id === op.itemId);
      return card && item ? { type: 'task/remove', card: card.title, task: item.text } : null;
    }
    default:
      return null;
  }
}

/** The operations that undo `op`, in the order to send them. */
/** A meeting from a board, or undefined. */
const meetingIn = (board: Board, id: string) => (board.meetings ?? []).find((m) => m.id === id);

export function undoOf(before: Board, after: Board, op: Op): UndoStep[] {
  switch (op.type) {
    // Arriving on a board is not something anyone did on purpose, so it is not something to put
    // back. Every device sends it on open; undoing it would be undone again a moment later.
    case 'member/seen':
      return [];

    case 'meeting/add':
      return [{ op: { type: 'meeting/remove', meetingId: op.meeting.id } }];
    case 'meeting/update': {
      const was = meetingIn(before, op.meetingId);
      const now = meetingIn(after, op.meetingId);
      const c =
        was && now
          ? changes(
              MEETING_FIELDS,
              op.patch,
              (k) => meetingField(was, k),
              (k) => meetingField(now, k),
            )
          : null;
      return c ? [{ op: { type: 'meeting/update', meetingId: op.meetingId, patch: c.patch }, expect: c.expect }] : [];
    }
    case 'meeting/remove': {
      // The whole meeting goes into the step, agenda and decisions with it: nothing else holds them.
      const meeting = meetingIn(before, op.meetingId);
      return meeting ? [{ op: { type: 'meeting/add', meeting } }] : [];
    }
    case 'meeting/attend':
      return [{ op: { type: 'meeting/attend', meetingId: op.meetingId, person: op.person, on: !op.on } }];

    case 'topic/add':
      return [{ op: { type: 'topic/remove', meetingId: op.meetingId, topicId: op.topic.id } }];
    case 'topic/update': {
      const was = meetingIn(before, op.meetingId)?.topics.find((t) => t.id === op.topicId);
      const now = meetingIn(after, op.meetingId)?.topics.find((t) => t.id === op.topicId);
      const c =
        was && now
          ? changes(
              TOPIC_FIELDS,
              op.patch,
              (k) => was[k],
              (k) => now[k],
            )
          : null;
      return c
        ? [{ op: { type: 'topic/update', meetingId: op.meetingId, topicId: op.topicId, patch: c.patch }, expect: c.expect }]
        : [];
    }
    case 'topic/move': {
      const from = meetingIn(before, op.meetingId)?.topics.findIndex((t) => t.id === op.topicId) ?? -1;
      return from < 0 ? [] : [{ op: { type: 'topic/move', meetingId: op.meetingId, topicId: op.topicId, toIndex: from } }];
    }
    case 'topic/remove': {
      const meeting = meetingIn(before, op.meetingId);
      const index = meeting?.topics.findIndex((t) => t.id === op.topicId) ?? -1;
      const topic = index >= 0 ? meeting!.topics[index] : null;
      return topic ? [{ op: { type: 'topic/add', meetingId: op.meetingId, topic, index } }] : [];
    }

    case 'outcome/add':
      return [{ op: { type: 'outcome/remove', meetingId: op.meetingId, outcomeId: op.outcome.id } }];
    case 'outcome/update': {
      const was = meetingIn(before, op.meetingId)?.outcomes?.find((o) => o.id === op.outcomeId);
      const now = meetingIn(after, op.meetingId)?.outcomes?.find((o) => o.id === op.outcomeId);
      const c =
        was && now
          ? changes(
              OUTCOME_FIELDS,
              op.patch,
              (k) => outcomeField(was, k),
              (k) => outcomeField(now, k),
            )
          : null;
      return c
        ? [
            {
              op: { type: 'outcome/update', meetingId: op.meetingId, outcomeId: op.outcomeId, patch: c.patch },
              expect: c.expect,
            },
          ]
        : [];
    }
    case 'outcome/remove': {
      const outcomes = meetingIn(before, op.meetingId)?.outcomes ?? [];
      const index = outcomes.findIndex((o) => o.id === op.outcomeId);
      return index >= 0
        ? [{ op: { type: 'outcome/add', meetingId: op.meetingId, outcome: outcomes[index], index } }]
        : [];
    }

    case 'agenda/add':
      return [{ op: { type: 'agenda/remove', subjectId: op.subject.id } }];
    case 'agenda/update': {
      const was = (before.agenda ?? []).find((a) => a.id === op.subjectId);
      return was && op.patch.title !== undefined && was.title !== op.patch.title
        ? [{ op: { type: 'agenda/update', subjectId: op.subjectId, patch: { title: was.title } }, expect: { title: op.patch.title } }]
        : [];
    }
    case 'agenda/move': {
      const from = (before.agenda ?? []).findIndex((a) => a.id === op.subjectId);
      return from < 0 ? [] : [{ op: { type: 'agenda/move', subjectId: op.subjectId, toIndex: from } }];
    }
    case 'column/add':
      return [{ op: { type: 'column/remove', columnId: op.column.id } }];
    case 'column/update': {
      const was = (before.columns ?? []).find((c) => c.id === op.columnId);
      return was && op.patch.title !== undefined && was.title !== op.patch.title
        ? [{ op: { type: 'column/update', columnId: op.columnId, patch: { title: was.title } }, expect: { title: op.patch.title } }]
        : [];
    }
    case 'column/move': {
      const from = (before.columns ?? []).findIndex((c) => c.id === op.columnId);
      return from < 0 ? [] : [{ op: { type: 'column/move', columnId: op.columnId, toIndex: from } }];
    }
    case 'column/remove': {
      const columns = before.columns ?? [];
      const index = columns.findIndex((c) => c.id === op.columnId);
      const column = columns[index];
      if (!column) return [];
      const mine = (id: string | null | undefined) => (id ?? null) === op.columnId;
      // The column comes back in its place, then everything that was in it — put back where it
      // was whether it had been moved aside or destroyed with it.
      const steps: UndoStep[] = [
        { op: { type: 'column/add', column, index } },
        { op: { type: 'column/move', columnId: column.id, toIndex: index } },
      ];
      if (column.kind === 'meetings') {
        for (const m of before.meetings ?? []) {
          if (!mine(m.columnId)) continue;
          steps.push(
            op.moveTo
              ? { op: { type: 'meeting/update', meetingId: m.id, patch: { columnId: column.id } } }
              : { op: { type: 'meeting/add', meeting: m } },
          );
        }
      } else {
        // With its index: a topic's place in the board is its order, and the add without one
        // appends. Meetings need no index — they sort themselves by date on the way back in.
        (before.policyTopics ?? []).forEach((t, i) => {
          if (!mine(t.columnId)) return;
          steps.push(
            op.moveTo
              ? { op: { type: 'topic/updatePolicy', topicId: t.id, patch: { columnId: column.id } } }
              : { op: { type: 'topic/addPolicy', topic: t, index: i } },
          );
          // Its rules went with it; they come back after it does.
          if (op.moveTo) return;
          (before.policies ?? []).forEach((x, j) => {
            if ((x.topicId ?? null) === t.id) steps.push({ op: { type: 'policy/add', policy: x, index: j } });
          });
        });
      }
      return steps;
    }

    case 'topic/addPolicy':
      return [{ op: { type: 'topic/removePolicy', topicId: op.topic.id } }];
    case 'topic/updatePolicy': {
      const was = (before.policyTopics ?? []).find((t) => t.id === op.topicId);
      const now = (after.policyTopics ?? []).find((t) => t.id === op.topicId);
      const c =
        was && now
          ? changes(
              POLICY_TOPIC_FIELDS,
              op.patch,
              (k) => (k === 'columnId' ? (was.columnId ?? null) : was[k]),
              (k) => (k === 'columnId' ? (now.columnId ?? null) : now[k]),
            )
          : null;
      return c ? [{ op: { type: 'topic/updatePolicy', topicId: op.topicId, patch: c.patch }, expect: c.expect }] : [];
    }
    case 'topic/movePolicy': {
      const from = (before.policyTopics ?? []).findIndex((t) => t.id === op.topicId);
      return from < 0 ? [] : [{ op: { type: 'topic/movePolicy', topicId: op.topicId, toIndex: from } }];
    }
    case 'topic/removePolicy': {
      const topics = before.policyTopics ?? [];
      const index = topics.findIndex((t) => t.id === op.topicId);
      const topic = topics[index];
      if (!topic) return [];
      const steps: UndoStep[] = [{ op: { type: 'topic/addPolicy', topic, index } }];
      (before.policies ?? []).forEach((p, i) => {
        if ((p.topicId ?? null) !== op.topicId) return;
        steps.push(
          op.moveTo
            ? { op: { type: 'policy/update', policyId: p.id, patch: { topicId: op.topicId, subtopicId: p.subtopicId ?? null } } }
            : { op: { type: 'policy/add', policy: p, index: i } },
        );
      });
      return steps;
    }

    case 'subtopic/add':
      return [{ op: { type: 'subtopic/remove', topicId: op.topicId, subtopicId: op.subtopic.id } }];
    case 'subtopic/update': {
      const was = (before.policyTopics ?? []).find((t) => t.id === op.topicId)?.subtopics.find((x) => x.id === op.subtopicId);
      return was && op.patch.title !== undefined && was.title !== op.patch.title
        ? [
            {
              op: { type: 'subtopic/update', topicId: op.topicId, subtopicId: op.subtopicId, patch: { title: was.title } },
              expect: { title: op.patch.title },
            },
          ]
        : [];
    }
    case 'subtopic/move': {
      const from =
        (before.policyTopics ?? []).find((t) => t.id === op.topicId)?.subtopics.findIndex((x) => x.id === op.subtopicId) ??
        -1;
      return from < 0 ? [] : [{ op: { type: 'subtopic/move', topicId: op.topicId, subtopicId: op.subtopicId, toIndex: from } }];
    }
    case 'subtopic/remove': {
      const topic = (before.policyTopics ?? []).find((t) => t.id === op.topicId);
      const index = topic?.subtopics.findIndex((x) => x.id === op.subtopicId) ?? -1;
      if (!topic || index < 0) return [];
      // The heading comes back, and every rule that was under it goes back under it.
      return [
        { op: { type: 'subtopic/add', topicId: op.topicId, subtopic: topic.subtopics[index], index } },
        ...(before.policies ?? [])
          .filter((p) => p.subtopicId === op.subtopicId)
          .map((p): UndoStep => ({ op: { type: 'policy/update', policyId: p.id, patch: { subtopicId: op.subtopicId } } })),
      ];
    }

    case 'policy/add':
      return [{ op: { type: 'policy/remove', policyId: op.policy.id } }];
    case 'policy/update': {
      const was = (before.policies ?? []).find((x) => x.id === op.policyId);
      const now = (after.policies ?? []).find((x) => x.id === op.policyId);
      const c =
        was && now
          ? changes(
              POLICY_FIELDS,
              op.patch,
              (k) => policyField(was, k),
              (k) => policyField(now, k),
            )
          : null;
      return c ? [{ op: { type: 'policy/update', policyId: op.policyId, patch: c.patch }, expect: c.expect }] : [];
    }
    case 'policy/move': {
      const from = (before.policies ?? []).findIndex((x) => x.id === op.policyId);
      return from < 0 ? [] : [{ op: { type: 'policy/move', policyId: op.policyId, toIndex: from } }];
    }
    case 'policy/repeal':
      return [{ op: { type: 'policy/restore', policyId: op.policyId } }];
    case 'policy/restore': {
      // Back to the date it stopped applying, not the date of the undo.
      const was = (before.policies ?? []).find((x) => x.id === op.policyId);
      return [{ op: { type: 'policy/repeal', policyId: op.policyId, since: was?.repealedAt ?? undefined } }];
    }
    case 'policy/remove': {
      const policies = before.policies ?? [];
      const index = policies.findIndex((x) => x.id === op.policyId);
      return index >= 0 ? [{ op: { type: 'policy/add', policy: policies[index], index } }] : [];
    }

    case 'agenda/remove': {
      const agenda = before.agenda ?? [];
      const index = agenda.findIndex((a) => a.id === op.subjectId);
      // Only the subject comes back. The threads from past topics to it were cut and are not
      // restored: an undo that reached into every meeting would be a bigger act than the delete.
      return index >= 0 ? [{ op: { type: 'agenda/add', subject: agenda[index], index } }] : [];
    }

    case 'board/update': {
      const c = changes(
        BOARD_FIELDS,
        op.patch,
        (k) => boardField(before, k),
        (k) => boardField(after, k),
      );
      return c ? [{ op: { type: 'board/update', patch: c.patch }, expect: c.expect }] : [];
    }
    case 'powerUp/set':
      return [{ op: { type: 'powerUp/set', key: op.key, enabled: !op.enabled } }];
    case 'label/rename': {
      const label = before.labels.find((l) => l.id === op.labelId);
      return label
        ? [{ op: { type: 'label/rename', labelId: label.id, name: label.name }, expect: { name: op.name } }]
        : [];
    }
    case 'list/add':
      return [{ op: { type: 'list/remove', listId: op.list.id } }];
    case 'list/update': {
      const was = before.lists.find((l) => l.id === op.listId);
      const now = after.lists.find((l) => l.id === op.listId);
      const c =
        was && now
          ? changes(
              LIST_FIELDS,
              op.patch,
              (k) => was[k],
              (k) => now[k],
            )
          : null;
      return c ? [{ op: { type: 'list/update', listId: op.listId, patch: c.patch }, expect: c.expect }] : [];
    }
    case 'list/move': {
      const from = before.lists.findIndex((l) => l.id === op.listId);
      return from < 0 ? [] : [{ op: { type: 'list/move', listId: op.listId, toIndex: from } }];
    }
    case 'list/remove': {
      const index = before.lists.findIndex((l) => l.id === op.listId);
      const list = before.lists[index];
      if (!list) return [];
      // The list comes back empty, in its place, then its cards in their order.
      return [
        { op: { type: 'list/add', list: { ...list, cardIds: [] } } },
        { op: { type: 'list/move', listId: list.id, toIndex: index } },
        ...list.cardIds
          .filter((id) => before.cards[id])
          .map((id): UndoStep => ({ op: { type: 'card/add', listId: list.id, card: before.cards[id] } })),
      ];
    }
    case 'card/add':
      return [{ op: { type: 'card/remove', cardId: op.card.id } }];
    case 'card/remove': {
      const card = before.cards[op.cardId];
      const list = listOf(before, op.cardId);
      if (!card || !list) return [];
      // Cards are added at the bottom of a list; the move puts it back in its place.
      return [
        { op: { type: 'card/add', listId: list.id, card } },
        { op: { type: 'card/move', cardId: card.id, toListId: list.id, toIndex: list.cardIds.indexOf(card.id) } },
      ];
    }
    case 'card/update': {
      const was = before.cards[op.cardId];
      const now = after.cards[op.cardId];
      const c =
        was && now
          ? changes(
              CARD_FIELDS,
              op.patch,
              (k) => cardField(was, k),
              (k) => cardField(now, k),
            )
          : null;
      return c ? [{ op: { type: 'card/update', cardId: op.cardId, patch: c.patch }, expect: c.expect }] : [];
    }
    case 'card/move': {
      const from = listOf(before, op.cardId);
      const to = listOf(after, op.cardId);
      if (!from || !to) return [];
      return [
        {
          op: { type: 'card/move', cardId: op.cardId, toListId: from.id, toIndex: from.cardIds.indexOf(op.cardId) },
          // Moved again since to another list: that move stays.
          expect: { list: to.id },
        },
      ];
    }
    case 'card/setLabel':
      return [{ op: { type: 'card/setLabel', cardId: op.cardId, labelId: op.labelId, on: !op.on } }];
    case 'check/add':
      return [{ op: { type: 'check/remove', cardId: op.cardId, itemId: op.item.id } }];
    case 'check/update': {
      const was = before.cards[op.cardId]?.checklist.find((i) => i.id === op.itemId);
      const now = after.cards[op.cardId]?.checklist.find((i) => i.id === op.itemId);
      const c =
        was && now
          ? changes(
              CHECK_FIELDS,
              op.patch,
              (k) => checkField(was, k),
              (k) => checkField(now, k),
            )
          : null;
      return c
        ? [{ op: { type: 'check/update', cardId: op.cardId, itemId: op.itemId, patch: c.patch }, expect: c.expect }]
        : [];
    }
    case 'check/remove': {
      const checklist = before.cards[op.cardId]?.checklist ?? [];
      const index = checklist.findIndex((i) => i.id === op.itemId);
      return index < 0 ? [] : [{ op: { type: 'check/add', cardId: op.cardId, item: checklist[index], index } }];
    }
    default:
      return [];
  }
}

/** The cards an operation changed. */
function cardsOf(op: OpInput): string[] {
  switch (op.type) {
    case 'card/add':
      return [op.card.id];
    case 'card/remove':
    case 'card/update':
    case 'card/move':
    case 'card/setLabel':
    case 'check/add':
    case 'check/update':
    case 'check/remove':
      return [op.cardId];
    default:
      return [];
  }
}

const heldCards = (steps: UndoStep[]) => steps.filter((s) => s.op.type === 'card/add').length;

/** Adds one more operation of a group to its entry. */
function merge(entry: ActivityEntry, what: ActivityWhat, steps: UndoStep[], cards: string[]): ActivityEntry {
  const kinds = entry.kinds ?? [entry.what.type];
  // Putting a card just added in its place is part of adding it.
  const partOfAdding =
    what.type === 'card/move' && entry.what.type === 'card/add' && cards.every((id) => entry.cards.includes(id));
  const nextKinds = partOfAdding || kinds.includes(what.type) ? kinds : [...kinds, what.type];
  // Undone last change first.
  const undo = entry.undo ? [...steps, ...entry.undo] : null;
  const next: ActivityEntry = {
    ...entry,
    cards: [...entry.cards, ...cards.filter((id) => !entry.cards.includes(id))],
    n: (entry.n ?? 1) + 1,
    undo: undo && heldCards(undo) <= MAX_UNDO_CARDS ? undo : null,
  };
  if (nextKinds.length > 1) next.kinds = nextKinds;
  return next;
}

/** Notes an operation `op`, which turned `before` into `after`, in the board's activity. */
export function record(before: Board, after: Board, op: Op): Board {
  const what = whatOf(before, after, op);
  if (!what) return after;
  const log = after.activity ?? [];
  const steps = undoOf(before, after, op);
  const cards = cardsOf(op);

  // A group's entry is usually the last one, unless a teammate's change came in between.
  for (let index = log.length - 1; op.group && index >= 0; index--) {
    if (log[index].id !== op.group) continue;
    const next = log.slice();
    next[index] = merge(log[index], what, steps, cards);
    return { ...after, activity: trimHeld(next) };
  }

  const entry: ActivityEntry = {
    id: op.group ?? op.id,
    at: op.at,
    by: op.by ?? null,
    what,
    cards,
    undo: heldCards(steps) <= MAX_UNDO_CARDS ? steps : null,
  };
  if (op.button) entry.button = op.button;
  if (op.reverts) entry.reverts = op.reverts;
  let next = [...log, entry];
  if (op.reverts) next = next.map((e) => (e.id === op.reverts ? { ...e, revertedBy: entry.id } : e));
  if (next.length > MAX_ACTIVITY) next = next.slice(next.length - MAX_ACTIVITY);
  return { ...after, activity: trimHeld(next) };
}

/** Drops the undo of the oldest entries while the log keeps more card copies than it may. */
function trimHeld(log: ActivityEntry[]): ActivityEntry[] {
  let held = 0;
  for (const e of log) held += e.undo ? heldCards(e.undo) : 0;
  if (held <= MAX_HELD_CARDS) return log;
  const next = log.slice();
  for (let i = 0; i < next.length - 1 && held > MAX_HELD_CARDS; i++) {
    const cards = next[i].undo ? heldCards(next[i].undo!) : 0;
    if (!cards) continue;
    held -= cards;
    next[i] = { ...next[i], undo: null };
  }
  return next;
}

/**
 * What is left of an undo step for the board as it is now, or null when nothing is: a deleted card
 * that is back already, a field someone changed again since, a card that is gone.
 */
export function stillApplies(board: Board, step: UndoStep): OpInput | null {
  const { op, expect } = step;
  // The fields whose value is still what the change left.
  const kept = (patch: object, current: (key: string) => unknown): Record<string, unknown> | null => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!expect || !(key in expect) || same(current(key), expect[key])) out[key] = value;
    }
    return Object.keys(out).length ? out : null;
  };
  switch (op.type) {
    case 'board/update': {
      const patch = kept(op.patch, (k) => boardField(board, k as BoardField));
      return patch ? ({ ...op, patch } as OpInput) : null;
    }
    case 'powerUp/set':
      return board.powerUps[op.key] !== op.enabled ? op : null;
    case 'label/rename': {
      const label = board.labels.find((l) => l.id === op.labelId);
      return label && (!expect || same(label.name, expect.name)) ? op : null;
    }
    case 'list/add':
      return board.lists.some((l) => l.id === op.list.id) ? null : op;
    case 'list/update': {
      const list = board.lists.find((l) => l.id === op.listId);
      const patch = list ? kept(op.patch, (k) => list[k as (typeof LIST_FIELDS)[number]]) : null;
      return patch ? ({ ...op, patch } as OpInput) : null;
    }
    case 'list/move':
    case 'list/remove':
      return board.lists.some((l) => l.id === op.listId) ? op : null;
    case 'card/add': {
      if (board.cards[op.card.id]) return null;
      // Its list was deleted since: it comes back in the first one.
      const list = board.lists.find((l) => l.id === op.listId) ?? board.lists[0];
      return list ? { ...op, listId: list.id } : null;
    }
    case 'card/remove':
      return board.cards[op.cardId] ? op : null;
    case 'card/update': {
      const card = board.cards[op.cardId];
      const patch = card ? kept(op.patch, (k) => cardField(card, k as CardField)) : null;
      return patch ? ({ ...op, patch } as OpInput) : null;
    }
    case 'card/move':
      if (!board.cards[op.cardId] || !board.lists.some((l) => l.id === op.toListId)) return null;
      return expect && listOf(board, op.cardId)?.id !== expect.list ? null : op;
    case 'card/setLabel': {
      const card = board.cards[op.cardId];
      return card && card.labelIds.includes(op.labelId) !== op.on ? op : null;
    }
    case 'check/add': {
      const card = board.cards[op.cardId];
      return card && !card.checklist.some((i) => i.id === op.item.id) ? op : null;
    }
    case 'check/update': {
      const item = board.cards[op.cardId]?.checklist.find((i) => i.id === op.itemId);
      const patch = item ? kept(op.patch, (k) => checkField(item, k as CheckField)) : null;
      return patch ? ({ ...op, patch } as OpInput) : null;
    }
    case 'check/remove':
      return board.cards[op.cardId]?.checklist.some((i) => i.id === op.itemId) ? op : null;

    case 'meeting/add':
      return meetingIn(board, op.meeting.id) ? null : op;
    case 'meeting/remove':
      return meetingIn(board, op.meetingId) ? op : null;
    case 'meeting/update': {
      const meeting = meetingIn(board, op.meetingId);
      const patch = meeting ? kept(op.patch, (k) => meetingField(meeting, k as MeetingField)) : null;
      return patch ? ({ ...op, patch } as OpInput) : null;
    }
    case 'meeting/attend': {
      const meeting = meetingIn(board, op.meetingId);
      // Already the way the undo would leave it — someone changed it again since.
      return meeting && meeting.attendees.some((a) => a.id === op.person.id) !== op.on ? op : null;
    }
    case 'topic/add':
      return meetingIn(board, op.meetingId) && !meetingIn(board, op.meetingId)!.topics.some((t) => t.id === op.topic.id)
        ? op
        : null;
    case 'topic/move':
    case 'topic/remove':
      return meetingIn(board, op.meetingId)?.topics.some((t) => t.id === op.topicId) ? op : null;
    case 'topic/update': {
      const topic = meetingIn(board, op.meetingId)?.topics.find((t) => t.id === op.topicId);
      const patch = topic ? kept(op.patch, (k) => topic[k as (typeof TOPIC_FIELDS)[number]]) : null;
      return patch ? ({ ...op, patch } as OpInput) : null;
    }
    case 'outcome/add':
      return meetingIn(board, op.meetingId) &&
        !(meetingIn(board, op.meetingId)!.outcomes ?? []).some((o) => o.id === op.outcome.id)
        ? op
        : null;
    case 'outcome/remove':
      return (meetingIn(board, op.meetingId)?.outcomes ?? []).some((o) => o.id === op.outcomeId) ? op : null;
    case 'outcome/update': {
      const outcome = (meetingIn(board, op.meetingId)?.outcomes ?? []).find((o) => o.id === op.outcomeId);
      const patch = outcome ? kept(op.patch, (k) => outcomeField(outcome, k as OutcomeField)) : null;
      return patch ? ({ ...op, patch } as OpInput) : null;
    }

    case 'agenda/add':
      return (board.agenda ?? []).some((a) => a.id === op.subject.id) ? null : op;
    case 'agenda/move':
    case 'agenda/remove':
      return (board.agenda ?? []).some((a) => a.id === op.subjectId) ? op : null;
    case 'agenda/update': {
      const subject = (board.agenda ?? []).find((a) => a.id === op.subjectId);
      return subject && (!expect || same(subject.title, expect.title)) ? op : null;
    }

    case 'column/add':
      return (board.columns ?? []).some((c) => c.id === op.column.id) ? null : op;
    case 'column/move':
    case 'column/remove':
      return (board.columns ?? []).some((c) => c.id === op.columnId) ? op : null;
    case 'column/update': {
      const column = (board.columns ?? []).find((c) => c.id === op.columnId);
      return column && (!expect || same(column.title, expect.title)) ? op : null;
    }
    case 'topic/addPolicy':
      return (board.policyTopics ?? []).some((t) => t.id === op.topic.id) ? null : op;
    case 'topic/movePolicy':
    case 'topic/removePolicy':
      return (board.policyTopics ?? []).some((t) => t.id === op.topicId) ? op : null;
    case 'topic/updatePolicy': {
      const topic = (board.policyTopics ?? []).find((t) => t.id === op.topicId);
      const patch = topic
        ? kept(op.patch, (k) => (k === 'columnId' ? (topic.columnId ?? null) : topic[k as 'title']))
        : null;
      return patch ? ({ ...op, patch } as OpInput) : null;
    }
    case 'subtopic/add':
      return (board.policyTopics ?? []).find((t) => t.id === op.topicId) &&
        !(board.policyTopics ?? []).find((t) => t.id === op.topicId)!.subtopics.some((x) => x.id === op.subtopic.id)
        ? op
        : null;
    case 'subtopic/move':
    case 'subtopic/remove':
      return (board.policyTopics ?? []).find((t) => t.id === op.topicId)?.subtopics.some((x) => x.id === op.subtopicId)
        ? op
        : null;
    case 'subtopic/update': {
      const sub = (board.policyTopics ?? []).find((t) => t.id === op.topicId)?.subtopics.find((x) => x.id === op.subtopicId);
      return sub && (!expect || same(sub.title, expect.title)) ? op : null;
    }

    case 'policy/add':
      return (board.policies ?? []).some((x) => x.id === op.policy.id) ? null : op;
    case 'policy/move':
    case 'policy/remove':
      return (board.policies ?? []).some((x) => x.id === op.policyId) ? op : null;
    case 'policy/repeal':
    case 'policy/restore': {
      const policy = (board.policies ?? []).find((x) => x.id === op.policyId);
      if (!policy) return null;
      // Already the way the undo would leave it — someone changed it again since.
      return ((policy.repealedAt ?? null) !== null) === (op.type === 'policy/restore') ? op : null;
    }
    case 'policy/update': {
      const policy = (board.policies ?? []).find((x) => x.id === op.policyId);
      const patch = policy ? kept(op.patch, (k) => policyField(policy, k as PolicyField)) : null;
      return patch ? ({ ...op, patch } as OpInput) : null;
    }

    default:
      return null;
  }
}

/** How many undos deep an entry is: 0 for a change, 1 for its undo, 2 for a redo, and so on. */
export function revertDepth(
  log: readonly ActivityEntry[],
  entry: ActivityEntry,
): { depth: number; origin: ActivityEntry | null } {
  let depth = 0;
  let current: ActivityEntry | undefined = entry;
  while (current?.reverts && depth <= 50) {
    const target: string = current.reverts;
    current = log.find((e) => e.id === target);
    depth++;
  }
  return { depth, origin: current ?? null };
}

/** Whether an entry's change is undone now: undone by an entry that was not undone in turn (a redo). */
export function isUndone(log: readonly ActivityEntry[], entry: ActivityEntry, depth = 0): boolean {
  if (!entry.revertedBy || depth > 50) return false;
  const by = log.find((e) => e.id === entry.revertedBy);
  // Undone by an entry that has since dropped out of the log: that undo still stands.
  if (!by) return true;
  return !isUndone(log, by, depth + 1);
}
