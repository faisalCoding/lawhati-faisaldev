import { hasMoved } from './meetings';
import type { AgendaSubject, Board, Meeting, MeetingTopic, Outcome, Policy } from '../shared/types';

// Everything one standing subject has ever gathered: every time it was discussed, what was said,
// what was decided, and which standing rules came out of it.
//
// This is the thing a chat group cannot do. The decisions about «الرحلة» are spread over six
// months of messages there; here they are one page, because each meeting's topic keeps a thread
// back to the subject it came from.

export interface SubjectVisit {
  meeting: Meeting;
  topic: MeetingTopic;
  /** What came out of that topic, in the order it was written down. */
  outcomes: Outcome[];
}

export interface SubjectHistory {
  subject: AgendaSubject;
  /** Every meeting that went through it, newest first. */
  visits: SubjectVisit[];
  /** The standing rules it produced, in the board's own order. */
  policies: Policy[];
  counts: { visits: number; decisions: number; stuck: number };
}

/**
 * Gathers a subject's whole history, or null when the board has no such subject.
 *
 * Only decisions filed under the subject's own topic count. A decision left general belongs to the
 * meeting, not to one of its subjects, and claiming it here would make the page say more than the
 * minutes do.
 */
export function subjectHistory(board: Board, subjectId: string): SubjectHistory | null {
  const subject = (board.agenda ?? []).find((a) => a.id === subjectId);
  if (!subject) return null;

  const visits: SubjectVisit[] = [];
  for (const meeting of board.meetings ?? []) {
    const topic = meeting.topics.find((t) => t.subjectId === subjectId);
    if (!topic) continue;
    visits.push({
      meeting,
      topic,
      outcomes: (meeting.outcomes ?? []).filter((o) => o.topicId === topic.id),
    });
  }

  // Reached through the decisions, not by asking a policy which subject it belongs to: a rule
  // knows the meeting that set it, and the thread to the subject runs through the decision.
  const fromHere = new Set(visits.flatMap((v) => v.outcomes.map((o) => o.policyId).filter(Boolean)));
  const policies = (board.policies ?? []).filter((p) => fromHere.has(p.id));

  const decisions = visits.reduce((sum, v) => sum + v.outcomes.length, 0);
  const stuck = visits.reduce((sum, v) => sum + v.outcomes.filter((o) => !hasMoved(o, board)).length, 0);

  return { subject, visits, policies, counts: { visits: visits.length, decisions, stuck } };
}
