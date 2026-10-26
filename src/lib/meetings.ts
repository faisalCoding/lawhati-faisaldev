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
