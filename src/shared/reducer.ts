import {
  BOARD_FIELDS,
  CARD_FIELDS,
  cardField,
  CHECK_FIELDS,
  checkField,
  LIST_FIELDS,
  MEETING_FIELDS,
  meetingField,
  OUTCOME_FIELDS,
  outcomeField,
  POLICY_FIELDS,
  policyField,
  record,
  same,
  TOPIC_FIELDS,
} from './activity';
import type { Board, Card, List, Meeting, MeetingTopic, Op } from './types';

// Pure, deterministic board reducer. The app applies operations optimistically and
// the sync server applies the same operations in its own order, so both must agree.

/** Newest meeting first, and a stable order for two on the same day. */
const byNewest = (a: Meeting, b: Meeting) =>
  a.date === b.date ? b.createdAt - a.createdAt : (a.date < b.date ? 1 : -1);

function clampIndex(index: number, length: number): number {
  const i = Number.isFinite(index) ? Math.round(index) : length;
  return Math.max(0, Math.min(length, i));
}

function insertAt<T>(items: T[], index: number, item: T): T[] {
  const i = clampIndex(index, items.length);
  return [...items.slice(0, i), item, ...items.slice(i)];
}

/**
 * The fields of a patch an operation may change, without undefined values: a patch never erases
 * fields by accident, and never reaches anything else (the cards, the activity).
 */
function pick<T extends object, K extends keyof T>(patch: Partial<T> | undefined, keys: readonly K[]): Partial<T> {
  const out: Partial<T> = {};
  if (!patch || typeof patch !== 'object') return out;
  for (const key of keys) {
    if (patch[key] !== undefined) out[key] = patch[key];
  }
  return out;
}

function updateList(board: Board, listId: string, fn: (list: List) => List): Board {
  const index = board.lists.findIndex((l) => l.id === listId);
  if (index < 0) return board;
  const next = fn(board.lists[index]);
  if (next === board.lists[index]) return board;
  const lists = board.lists.slice();
  lists[index] = next;
  return { ...board, lists };
}

function updateCard(board: Board, cardId: string, fn: (card: Card) => Card): Board {
  const card = board.cards[cardId];
  if (!card) return board;
  const next = fn(card);
  if (next === card) return board;
  return { ...board, cards: { ...board.cards, [cardId]: next } };
}

function updateMeeting(board: Board, meetingId: string, fn: (meeting: Meeting) => Meeting): Board {
  const meetings = board.meetings ?? [];
  const index = meetings.findIndex((m) => m.id === meetingId);
  if (index < 0) return board;
  const next = fn(meetings[index]);
  if (next === meetings[index]) return board;
  const copy = meetings.slice();
  copy[index] = next;
  return { ...board, meetings: copy };
}

function updateTopic(
  board: Board,
  meetingId: string,
  topicId: string,
  fn: (topic: MeetingTopic) => MeetingTopic,
): Board {
  return updateMeeting(board, meetingId, (meeting) => {
    const index = meeting.topics.findIndex((t) => t.id === topicId);
    if (index < 0) return meeting;
    const next = fn(meeting.topics[index]);
    if (next === meeting.topics[index]) return meeting;
    const topics = meeting.topics.slice();
    topics[index] = next;
    return { ...meeting, topics };
  });
}

function reduce(board: Board, op: Op): Board {
  switch (op.type) {
    case 'board/update': {
      const patch = pick(op.patch, BOARD_FIELDS);
      const keys = Object.keys(patch) as (keyof typeof patch)[];
      if (keys.every((key) => same(patch[key], key === 'buttons' ? (board.buttons ?? []) : board[key]))) return board;
      return { ...board, ...patch };
    }

    case 'powerUp/set':
      if (board.powerUps[op.key] === op.enabled) return board;
      return { ...board, powerUps: { ...board.powerUps, [op.key]: op.enabled } };

    case 'label/rename':
      if (!board.labels.some((l) => l.id === op.labelId && l.name !== op.name)) return board;
      return {
        ...board,
        labels: board.labels.map((l) => (l.id === op.labelId ? { ...l, name: op.name } : l)),
      };

    case 'member/seen': {
      // A row with no id or no name is worse than no row: it cannot be assigned to and cannot be
      // told from another. The server rewrites this op from the identity it verified, and an
      // unidentified device leaves nothing behind.
      if (!op.member?.id || !op.member.name) return board;
      const members = board.members ?? [];
      const seen = members.find((m) => m.id === op.member.id);
      // Already there under the same name: nothing to say. Every device sends this on open, so
      // the common case must be a no-op or the activity would fill with arrivals.
      if (seen && seen.name === op.member.name) return board;
      if (!seen) return { ...board, members: [...members, op.member] };
      // People rename themselves; the roster follows, keeping when the board first saw them.
      return { ...board, members: members.map((m) => (m.id === op.member.id ? { ...m, name: op.member.name } : m)) };
    }

    case 'list/add':
      if (board.lists.some((l) => l.id === op.list.id)) return board;
      return { ...board, lists: [...board.lists, { ...op.list, cardIds: [] }] };

    case 'list/update':
      return updateList(board, op.listId, (l) => {
        const patch = pick(op.patch, LIST_FIELDS);
        const keys = Object.keys(patch) as (keyof typeof patch)[];
        return keys.every((key) => same(patch[key], l[key])) ? l : { ...l, ...patch };
      });

    case 'list/move': {
      const from = board.lists.findIndex((l) => l.id === op.listId);
      if (from < 0) return board;
      const rest = board.lists.filter((l) => l.id !== op.listId);
      const to = clampIndex(op.toIndex, rest.length);
      if (to === from) return board;
      return { ...board, lists: insertAt(rest, to, board.lists[from]) };
    }

    case 'list/remove': {
      const list = board.lists.find((l) => l.id === op.listId);
      if (!list) return board;
      const cards = { ...board.cards };
      for (const id of list.cardIds) delete cards[id];
      return { ...board, lists: board.lists.filter((l) => l.id !== op.listId), cards };
    }

    case 'card/add': {
      if (board.cards[op.card.id]) return board;
      if (!board.lists.some((l) => l.id === op.listId)) return board;
      const withCard = { ...board, cards: { ...board.cards, [op.card.id]: op.card } };
      return updateList(withCard, op.listId, (l) => ({ ...l, cardIds: [...l.cardIds, op.card.id] }));
    }

    case 'card/update':
      return updateCard(board, op.cardId, (c) => {
        const patch = pick(op.patch, CARD_FIELDS);
        const keys = Object.keys(patch) as (keyof typeof patch)[];
        return keys.every((key) => same(patch[key], cardField(c, key))) ? c : { ...c, ...patch };
      });

    case 'card/move': {
      if (!board.cards[op.cardId]) return board;
      const target = board.lists.find((l) => l.id === op.toListId);
      if (!target) return board;
      const current = target.cardIds.indexOf(op.cardId);
      if (current >= 0 && current === clampIndex(op.toIndex, target.cardIds.length - 1)) return board;
      const lists = board.lists.map((l) => {
        const cardIds = l.cardIds.includes(op.cardId) ? l.cardIds.filter((id) => id !== op.cardId) : l.cardIds;
        if (l.id === op.toListId) return { ...l, cardIds: insertAt(cardIds, op.toIndex, op.cardId) };
        return cardIds === l.cardIds ? l : { ...l, cardIds };
      });
      return { ...board, lists };
    }

    case 'card/remove': {
      if (!board.cards[op.cardId]) return board;
      const cards = { ...board.cards };
      delete cards[op.cardId];
      const lists = board.lists.map((l) =>
        l.cardIds.includes(op.cardId) ? { ...l, cardIds: l.cardIds.filter((id) => id !== op.cardId) } : l,
      );
      return { ...board, lists, cards };
    }

    case 'card/setLabel':
      return updateCard(board, op.cardId, (c) => {
        const has = c.labelIds.includes(op.labelId);
        if (has === op.on) return c;
        return {
          ...c,
          labelIds: op.on ? [...c.labelIds, op.labelId] : c.labelIds.filter((id) => id !== op.labelId),
        };
      });

    case 'check/add':
      return updateCard(board, op.cardId, (c) => {
        if (c.checklist.some((i) => i.id === op.item.id)) return c;
        const checklist = op.index === undefined ? [...c.checklist, op.item] : insertAt(c.checklist, op.index, op.item);
        return { ...c, checklist };
      });

    case 'check/update':
      return updateCard(board, op.cardId, (c) => {
        const patch = pick(op.patch, CHECK_FIELDS);
        const keys = Object.keys(patch) as (keyof typeof patch)[];
        const item = c.checklist.find((i) => i.id === op.itemId);
        if (!item || keys.every((key) => same(patch[key], checkField(item, key)))) return c;
        return { ...c, checklist: c.checklist.map((i) => (i.id === op.itemId ? { ...i, ...patch } : i)) };
      });

    case 'check/remove':
      return updateCard(board, op.cardId, (c) =>
        c.checklist.some((i) => i.id === op.itemId)
          ? { ...c, checklist: c.checklist.filter((i) => i.id !== op.itemId) }
          : c,
      );

    case 'meeting/add': {
      const meetings = board.meetings ?? [];
      if (meetings.some((m) => m.id === op.meeting.id)) return board;
      // Newest first: a meeting is read right after it is held, and the list is browsed from today
      // backwards. The date decides, not the order they were typed in — minutes are often written
      // up late, and one entered today about last week belongs under last week.
      const next = [...meetings, op.meeting].sort(byNewest);
      return { ...board, meetings: next };
    }

    case 'meeting/update':
      return updateMeeting(board, op.meetingId, (meeting) => {
        const patch = pick(op.patch, MEETING_FIELDS);
        const keys = Object.keys(patch) as (keyof typeof patch)[];
        if (keys.every((key) => same(patch[key], meetingField(meeting, key)))) return meeting;
        return { ...meeting, ...patch };
      });

    case 'meeting/remove': {
      const meetings = board.meetings ?? [];
      if (!meetings.some((m) => m.id === op.meetingId)) return board;
      return { ...board, meetings: meetings.filter((m) => m.id !== op.meetingId) };
    }

    case 'meeting/attend':
      return updateMeeting(board, op.meetingId, (meeting) => {
        const there = meeting.attendees.some((a) => a.id === op.person.id);
        if (there === op.on) return meeting;
        return {
          ...meeting,
          attendees: op.on
            ? [...meeting.attendees, op.person]
            : meeting.attendees.filter((a) => a.id !== op.person.id),
        };
      });

    case 'topic/add':
      return updateMeeting(board, op.meetingId, (meeting) =>
        meeting.topics.some((t) => t.id === op.topic.id)
          ? meeting
          : { ...meeting, topics: insertAt(meeting.topics, op.index ?? meeting.topics.length, op.topic) },
      );

    case 'topic/update':
      return updateTopic(board, op.meetingId, op.topicId, (topic) => {
        const patch = pick(op.patch, TOPIC_FIELDS);
        const keys = Object.keys(patch) as (keyof typeof patch)[];
        if (keys.every((key) => same(patch[key], topic[key]))) return topic;
        return { ...topic, ...patch };
      });

    case 'topic/move':
      return updateMeeting(board, op.meetingId, (meeting) => {
        const from = meeting.topics.findIndex((t) => t.id === op.topicId);
        if (from < 0) return meeting;
        const to = clampIndex(op.toIndex, meeting.topics.length - 1);
        if (from === to) return meeting;
        const topics = meeting.topics.slice();
        const [moved] = topics.splice(from, 1);
        topics.splice(to, 0, moved);
        return { ...meeting, topics };
      });

    case 'topic/remove':
      return updateMeeting(board, op.meetingId, (meeting) => {
        if (!meeting.topics.some((t) => t.id === op.topicId)) return meeting;
        // Decisions that came out of it are not lost with it: they fall back to the meeting as a
        // whole. A dangling topicId would hide them from every grouping that reads it.
        const outcomes = meeting.outcomes?.map((o) => (o.topicId === op.topicId ? { ...o, topicId: null } : o));
        return {
          ...meeting,
          topics: meeting.topics.filter((t) => t.id !== op.topicId),
          ...(outcomes ? { outcomes } : {}),
        };
      });

    case 'outcome/add':
      return updateMeeting(board, op.meetingId, (meeting) => {
        const outcomes = meeting.outcomes ?? [];
        if (outcomes.some((o) => o.id === op.outcome.id)) return meeting;
        return { ...meeting, outcomes: insertAt(outcomes, op.index ?? outcomes.length, op.outcome) };
      });

    case 'outcome/update':
      return updateMeeting(board, op.meetingId, (meeting) => {
        const outcomes = meeting.outcomes ?? [];
        const index = outcomes.findIndex((o) => o.id === op.outcomeId);
        if (index < 0) return meeting;
        const patch = pick(op.patch, OUTCOME_FIELDS);
        const keys = Object.keys(patch) as (keyof typeof patch)[];
        if (keys.every((key) => same(patch[key], outcomeField(outcomes[index], key)))) return meeting;
        const next = outcomes.slice();
        next[index] = { ...next[index], ...patch };
        return { ...meeting, outcomes: next };
      });

    case 'agenda/add': {
      const agenda = board.agenda ?? [];
      if (agenda.some((a) => a.id === op.subject.id)) return board;
      return { ...board, agenda: insertAt(agenda, op.index ?? agenda.length, op.subject) };
    }

    case 'agenda/update': {
      const agenda = board.agenda ?? [];
      const index = agenda.findIndex((a) => a.id === op.subjectId);
      if (index < 0 || op.patch.title === undefined || agenda[index].title === op.patch.title) return board;
      const next = agenda.slice();
      next[index] = { ...next[index], title: op.patch.title };
      return { ...board, agenda: next };
    }

    case 'agenda/move': {
      const agenda = board.agenda ?? [];
      const from = agenda.findIndex((a) => a.id === op.subjectId);
      if (from < 0) return board;
      const to = clampIndex(op.toIndex, agenda.length - 1);
      if (from === to) return board;
      const next = agenda.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...board, agenda: next };
    }

    case 'column/add': {
      const columns = board.columns ?? [];
      if (columns.some((c) => c.id === op.column.id)) return board;
      return { ...board, columns: insertAt(columns, op.index ?? columns.length, op.column) };
    }

    case 'column/update': {
      const columns = board.columns ?? [];
      const index = columns.findIndex((c) => c.id === op.columnId);
      if (index < 0 || op.patch.title === undefined || columns[index].title === op.patch.title) return board;
      const next = columns.slice();
      next[index] = { ...next[index], title: op.patch.title };
      return { ...board, columns: next };
    }

    case 'column/move': {
      const columns = board.columns ?? [];
      const from = columns.findIndex((c) => c.id === op.columnId);
      if (from < 0) return board;
      const to = clampIndex(op.toIndex, columns.length - 1);
      if (from === to) return board;
      const next = columns.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...board, columns: next };
    }

    case 'column/remove': {
      const columns = board.columns ?? [];
      const column = columns.find((c) => c.id === op.columnId);
      if (!column) return board;
      const rest = columns.filter((c) => c.id !== op.columnId);

      // Everything filed here either moves, or goes with the column. Which one was asked for
      // before the operation was ever made; the reducer only carries it out.
      const moveTo = op.moveTo && rest.some((c) => c.id === op.moveTo && c.kind === column.kind) ? op.moveTo : null;
      const mine = <T extends { columnId?: string | null }>(x: T) => (x.columnId ?? null) === op.columnId;

      const next: Board = { ...board, columns: rest };
      if (column.kind === 'meetings') {
        next.meetings = moveTo
          ? (board.meetings ?? []).map((m) => (mine(m) ? { ...m, columnId: moveTo } : m))
          : (board.meetings ?? []).filter((m) => !mine(m));
      } else {
        next.policies = moveTo
          ? (board.policies ?? []).map((x) => (mine(x) ? { ...x, columnId: moveTo } : x))
          : (board.policies ?? []).filter((x) => !mine(x));
      }
      return next;
    }

    case 'policy/add': {
      const policies = board.policies ?? [];
      if (policies.some((x) => x.id === op.policy.id)) return board;
      return { ...board, policies: insertAt(policies, op.index ?? policies.length, op.policy) };
    }

    case 'policy/update': {
      const policies = board.policies ?? [];
      const index = policies.findIndex((x) => x.id === op.policyId);
      if (index < 0) return board;
      const patch = pick(op.patch, POLICY_FIELDS);
      const keys = Object.keys(patch) as (keyof typeof patch)[];
      if (keys.every((key) => same(patch[key], policyField(policies[index], key)))) return board;
      const next = policies.slice();
      next[index] = { ...next[index], ...patch };
      return { ...board, policies: next };
    }

    case 'policy/move': {
      const policies = board.policies ?? [];
      const from = policies.findIndex((x) => x.id === op.policyId);
      if (from < 0) return board;
      const to = clampIndex(op.toIndex, policies.length - 1);
      if (from === to) return board;
      const next = policies.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...board, policies: next };
    }

    case 'policy/remove': {
      const policies = board.policies ?? [];
      if (!policies.some((x) => x.id === op.policyId)) return board;
      return { ...board, policies: policies.filter((x) => x.id !== op.policyId) };
    }

    case 'agenda/remove': {
      const agenda = board.agenda ?? [];
      if (!agenda.some((a) => a.id === op.subjectId)) return board;
      // Meetings that went through it keep their topic and its minutes, under the title they had.
      // Only the thread back to the standing subject is cut, because it no longer leads anywhere.
      const meetings = board.meetings?.map((m) => {
        const topics = m.topics.map((t) => (t.subjectId === op.subjectId ? { ...t, subjectId: null } : t));
        return topics.some((t, i) => t !== m.topics[i]) ? { ...m, topics } : m;
      });
      return {
        ...board,
        agenda: agenda.filter((a) => a.id !== op.subjectId),
        ...(meetings ? { meetings } : {}),
      };
    }

    case 'outcome/remove':
      return updateMeeting(board, op.meetingId, (meeting) => {
        const outcomes = meeting.outcomes ?? [];
        if (!outcomes.some((o) => o.id === op.outcomeId)) return meeting;
        return { ...meeting, outcomes: outcomes.filter((o) => o.id !== op.outcomeId) };
      });

    default:
      return board;
  }
}

/** Applies one operation, and notes it in the board's activity (see `activity.ts`). */
export function applyOp(board: Board, op: Op): Board {
  const next = reduce(board, op);
  if (next === board) return board;
  return { ...record(board, next, op), updatedAt: Math.max(board.updatedAt, op.at || 0) };
}

export function applyOps(board: Board, ops: readonly Op[]): Board {
  return ops.reduce(applyOp, board);
}
