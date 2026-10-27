import { todayISO } from './dates';
import { isCardDone } from '../shared/cards';
import type { Board, Meeting, Outcome } from '../shared/types';

// What a meeting left open, and is therefore owed an answer at the next one.
//
// The fourth meeting here opened by repeating the third's assignments under «الاجتماع الماضي»,
// which is the habit this serves: what did we say we would do, and did we?

/**
 * Whether a decision still wants something done about it.
 *
 * Only two kinds ever do. A task is owed until it is ticked off or its card is done. A policy is
 * owed until it is actually written into the standing rules — a rule agreed and never written down
 * is the failure this whole section exists to catch.
 *
 * A note and an announcement ask nothing of anyone. Neither does a responsibility: it is held from
 * now on and is never finished, so listing it every week would be noise that buries the rest.
 */
export function isOpen(outcome: Outcome, board: Board): boolean {
  if (outcome.done) return false;
  if (outcome.kind === 'task') {
    const card = outcome.cardId ? board.cards[outcome.cardId] : undefined;
    return !card || !isCardDone(card);
  }
  if (outcome.kind === 'policy') return !outcome.policyId;
  return false;
}

/**
 * Whether the meeting actually took place.
 *
 * The flag when it has been set, otherwise the date: a meeting whose day has passed is taken to
 * have happened. That is right for everything already written down and wrong only for one that
 * was postponed — which is exactly what the flag is for.
 */
export function isHeld(meeting: Meeting, today = todayISO()): boolean {
  return meeting.held ?? meeting.date <= today;
}

/**
 * Whether a decision has been turned into something that gets followed — not whether it is done.
 *
 * These are two different questions and the board answers both. `isOpen` asks «has it happened
 * yet»; this asks «has anyone written it down where it will be tracked». A task with a card and a
 * date is filed and still open, and that is the normal state of a meeting a week old.
 *
 * A task is filed when it has become a card, or a task inside one, and carries a date. A policy is
 * filed when it is actually in the standing rules, and dated. The other kinds ask nothing of
 * anyone and so are never counted — a bar that can never reach the end teaches people to ignore it.
 */
export function needsFiling(outcome: Outcome): boolean {
  return outcome.kind === 'task' || outcome.kind === 'policy';
}

export function isFiled(outcome: Outcome, board: Board): boolean {
  if (!needsFiling(outcome)) return true;
  if (!outcome.due) return false;
  if (outcome.kind === 'policy') return (board.policies ?? []).some((p) => p.id === outcome.policyId);

  const card = outcome.cardId ? board.cards[outcome.cardId] : undefined;
  if (!card) return false;
  // Either it is the card, or it is one task inside it — both put it somewhere that is followed.
  return !outcome.itemId || card.checklist.some((i) => i.id === outcome.itemId);
}

/** How much of a meeting's output has been filed. `total` 0 means it asked nothing of anyone. */
export function filingProgress(board: Board, meeting: Meeting): { filed: number; total: number } {
  const wanted = (meeting.outcomes ?? []).filter(needsFiling);
  return { filed: wanted.filter((o) => isFiled(o, board)).length, total: wanted.length };
}

export interface OpenFromMeeting {
  meeting: Meeting;
  items: Outcome[];
}

/**
 * Everything still open from the meetings before this one, newest meeting first.
 *
 * Not the previous meeting alone: something agreed three meetings ago and still not done is more
 * worth seeing, not less, and only the board can notice it.
 */
export function openBefore(board: Board, meetingId: string): OpenFromMeeting[] {
  const meetings = board.meetings ?? [];
  const index = meetings.findIndex((m) => m.id === meetingId);
  if (index < 0) return [];

  // Meetings are newest first, so everything after this one in the list is older than it.
  return meetings
    .slice(index + 1)
    .map((meeting) => ({ meeting, items: (meeting.outcomes ?? []).filter((o) => isOpen(o, board)) }))
    .filter((group) => group.items.length > 0);
}
