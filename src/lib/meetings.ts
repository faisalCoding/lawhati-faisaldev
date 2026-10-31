import { formatLongDate, todayISO } from './dates';
import { ordinal } from './text';
import type { Board, BoardColumn, Meeting, Outcome, Policy } from '../shared/types';

// What a meeting decided and never moved on, and is therefore owed an answer at the next one.
//
// The fourth meeting here opened by repeating the third's assignments under «الاجتماع الماضي»,
// which is the habit this serves: what did we decide, and did it go anywhere?

/**
 * Whether the meeting actually took place.
 *
 * The flag when it has been set, otherwise the date: a meeting whose day has passed is taken to
 * have happened. That is right for everything already written down and wrong only for one that
 * was postponed — which is exactly what the flag is for.
 */
/**
 * What a record column holds.
 *
 * Nothing was migrated when columns arrived, so an entity with no column of its own reads as
 * belonging to the first column of its kind. The rule lives here, in one place, because the board
 * canvas has to agree with the column about what is in it down to the order.
 */
export function inColumn<T extends { columnId?: string | null }>(
  all: readonly T[],
  column: BoardColumn,
  columns: readonly BoardColumn[],
): T[] {
  const isFirst = columns.find((c) => c.kind === column.kind)?.id === column.id;
  return all.filter((x) => (x.columnId ?? null) === column.id || (isFirst && !x.columnId));
}

/**
 * The rules still in force under a subject, or under one of its sub-headings.
 *
 * A repealed rule keeps its record and leaves the document: what a policy used to say is history,
 * and history is read in the rule's own log, not mistaken for the rule.
 */
export function livingClauses(board: Board, topicId: string, subtopicId?: string | null): Policy[] {
  return (board.policies ?? []).filter(
    (p) =>
      !p.repealedAt &&
      (p.topicId ?? null) === topicId &&
      (subtopicId === undefined || (p.subtopicId ?? null) === subtopicId),
  );
}

export function isHeld(meeting: Meeting, today = todayISO()): boolean {
  return meeting.held ?? meeting.date <= today;
}

/**
 * Whether a decision has left the meeting for the place it belongs.
 *
 * This is the only question the minutes ask about a decision. Whether the work is finished is the
 * card's business, and the board already answers it there; asking it twice, in two places, with
 * two nearly identical words, taught nobody anything.
 *
 * A task has moved when it has become a card, or a task inside one, and carries a date. A policy
 * has moved when it is actually among the standing rules, and dated. Either is settled outright
 * by being ticked — some decisions need no home: «عزام يراجع مع البراء» was said and done.
 *
 * The other kinds ask nothing of anyone and are never counted. A bar that cannot reach the end
 * teaches people to ignore it.
 */
export function needsMoving(outcome: Outcome): boolean {
  return outcome.kind === 'task' || outcome.kind === 'policy';
}

export function hasMoved(outcome: Outcome, board: Board): boolean {
  if (!needsMoving(outcome)) return true;
  if (outcome.done) return true;
  if (!outcome.due) return false;
  if (outcome.kind === 'policy') return (board.policies ?? []).some((p) => p.id === outcome.policyId);

  const card = outcome.cardId ? board.cards[outcome.cardId] : undefined;
  if (!card) return false;
  // Either it is the card, or it is one task inside it — both put it somewhere that is followed.
  return !outcome.itemId || card.checklist.some((i) => i.id === outcome.itemId);
}

/** How much of a meeting's output has moved on. `total` 0 means it asked nothing of anyone. */
export function movedProgress(board: Board, meeting: Meeting): { moved: number; total: number } {
  const wanted = (meeting.outcomes ?? []).filter(needsMoving);
  return { moved: wanted.filter((o) => hasMoved(o, board)).length, total: wanted.length };
}

export interface StuckInMeeting {
  meeting: Meeting;
  items: Outcome[];
}

/**
 * Everything still sitting in the meetings before this one, newest meeting first.
 *
 * Not the previous meeting alone: something agreed three meetings ago that never left it is more
 * worth seeing, not less, and only the board can notice it.
 */
export function stuckBefore(board: Board, meetingId: string): StuckInMeeting[] {
  const meetings = board.meetings ?? [];
  const index = meetings.findIndex((m) => m.id === meetingId);
  if (index < 0) return [];

  // Meetings are newest first, so everything after this one in the list is older than it.
  return meetings
    .slice(index + 1)
    .map((meeting) => ({ meeting, items: (meeting.outcomes ?? []).filter((o) => !hasMoved(o, board)) }))
    .filter((group) => group.items.length > 0);
}

/**
 * The meeting as text to paste where people already talk: when and where, who came, what was
 * discussed and decided — then the two things everyone goes back for afterwards, who owes what by
 * when, and which rules the meeting added.
 *
 * Plain text, no markup. It lands in a chat, an email, a notes app, and `*bold*` reads as stars in
 * all but the first. A section with nothing in it is left out rather than printed empty, so a
 * short meeting makes a short message.
 *
 * `policies` names the rules a decision struck out: «حذف السياسة» says nothing on its own, and the
 * reader wants to know which rule stopped.
 */
export function meetingSummary(meeting: Meeting, policies: readonly Policy[] = []): string {
  const outcomes = meeting.outcomes ?? [];
  const topicIds = new Set(meeting.topics.map((t) => t.id));
  // A decision whose topic was deleted falls back to the meeting as a whole, as on the screen.
  const general = outcomes.filter((o) => !o.topicId || !topicIds.has(o.topicId));
  const numbered = (list: Outcome[]) => list.map((o, i) => `${i + 1}. ${o.text}`);

  const head = [`محضر اجتماع: ${meeting.title}`, `التاريخ: ${formatLongDate(meeting.date)}`];
  if (meeting.place?.trim()) head.push(`المكان: ${meeting.place.trim()}`);
  if (meeting.attendees.length > 0) head.push(`الحضور: ${meeting.attendees.map((a) => a.name).join('، ')}`);

  const sections: string[][] = [head];

  if (meeting.topics.length > 0) {
    // A blank line between topics, so each one reads as its own paragraph with what it decided.
    const topics = meeting.topics.map((topic, i) =>
      [`${ordinal(i + 1)}: ${topic.title}`, ...numbered(outcomes.filter((o) => o.topicId === topic.id))].join('\n'),
    );
    sections.push(['المحاور', topics.join('\n\n')]);
  }
  if (general.length > 0) sections.push(['توصيات عامّة', ...numbered(general)]);

  // Who holds what: a task by a date, a standing responsibility with none. Both answer «who?».
  const owed = outcomes.filter((o) => o.kind === 'task' || o.kind === 'assignment');
  if (owed.length > 0) {
    const both = owed.some((o) => o.kind === 'assignment') && owed.some((o) => o.kind === 'task');
    const title = both ? 'المهام والمسؤوليات' : owed[0].kind === 'task' ? 'المهام' : 'المسؤوليات';
    sections.push([
      title,
      ...owed.map((o) =>
        // Nobody holding it is worth saying out loud: it is the line someone has to pick up.
        ['- ' + o.text, o.assignee?.name ?? 'بلا مسؤول', o.due ? formatLongDate(o.due) : null]
          .filter(Boolean)
          .join(' — '),
      ),
    ]);
  }

  const rules = outcomes.filter((o) => o.kind === 'policy');
  const added = rules.filter((o) => !o.repeals);
  const struck = rules.filter((o) => o.repeals);
  if (added.length > 0) sections.push(['السياسات المضافة', ...added.map((o) => `- ${o.text}`)]);
  if (struck.length > 0) {
    const ruleText = (o: Outcome) => policies.find((x) => x.id === o.policyId)?.text ?? o.text;
    sections.push(['السياسات المحذوفة', ...struck.map((o) => `- ${ruleText(o)}`)]);
  }

  return sections.map((lines) => lines.join('\n')).join('\n\n');
}
