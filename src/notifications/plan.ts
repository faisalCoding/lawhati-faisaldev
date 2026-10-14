// Works out which notifications should be waiting on the phone, from the boards and the user's
// choices. Pure (no native calls), so the scheduler can compare plans and skip needless work.

import { addDays, atHour, formatShortDate, parseISODate, toISODate } from '../lib/dates';
import { pluralCards } from '../lib/text';
import { isCardDone } from '../shared/cards';
import type { Board, Card, List } from '../shared/types';

export type ReminderTiming = 'dueDay' | 'dayBefore' | 'off';

export interface NotificationPrefs {
  /** When each card with a due date is announced. */
  reminders: ReminderTiming;
  /** One notification a day listing the cards due that day and the overdue ones. */
  digest: boolean;
  /** Hour of the day (0–23) for both. */
  hour: number;
  /** Notifications when teammates edit a watched card (sent by the sync server). */
  team: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = { reminders: 'dueDay', digest: false, hour: 9, team: true };

/** Reminders put off with "snooze": card key → when to remind again (epoch ms). */
export type Snoozes = Record<string, number>;

export type NotificationChannel = 'reminders' | 'digest';

export type NotificationData =
  | { kind: 'reminder'; boardId: string; cardId: string; url: string }
  | { kind: 'digest'; url: string }
  /** `code`: the board's share code, so a phone that has not joined it yet can join from the notification. */
  | { kind: 'team'; url: string; code?: string };

export interface PlannedNotification {
  /** Stable per card (or per day), so a new plan replaces the old one. */
  id: string;
  channel: NotificationChannel;
  /** When to show it (epoch ms). */
  at: number;
  title: string;
  body: string;
  data: NotificationData;
}

export const cardKey = (boardId: string, cardId: string) => `${boardId}:${cardId}`;

const DAY_MS = 86_400_000;
const REMINDER_DAYS = 60;
const DIGEST_DAYS = 14;
// iOS keeps at most 64 pending notifications per app.
const MAX_SCHEDULED = 60;

const DONE_WORDS = new Set([
  'مكتمل',
  'مكتملة',
  'منجز',
  'منجزة',
  'تم',
  'انتهى',
  'منتهي',
  'منتهية',
  'جاهز',
  'جاهزة',
  'أتقنتها',
  'done',
  'complete',
  'completed',
  'finished',
]);

/**
 * Kanban boards end with a "done" list («مكتمل»، «تم الشراء»…). A card moved there is finished even
 * if nobody ticked its due date, so it gets no reminders. Only the last list counts, and only when
 * its name says so: a silently skipped reminder would be worse than an extra one.
 */
export function isDoneList(board: Board, list: List): boolean {
  if (board.lists.length < 2 || board.lists[board.lists.length - 1].id !== list.id) return false;
  return list.title
    .toLowerCase()
    .split(/[\s.,!؟?:؛;()«»"'\-–—✓✔]+/)
    .some((word) => DONE_WORDS.has(word.replace(/^ال/, '')));
}

interface OpenCard {
  board: Board;
  card: Card;
  due: string;
}

/** Cards whose due date still matters: the Power-Up is on, and the card is not done. */
export function openDueCards(boards: Board[]): OpenCard[] {
  const out: OpenCard[] = [];
  for (const board of boards) {
    if (!board.powerUps.dueDates) continue;
    for (const list of board.lists) {
      if (isDoneList(board, list)) continue;
      for (const id of list.cardIds) {
        const card = board.cards[id];
        if (card?.due && !isCardDone(card)) out.push({ board, card, due: card.due });
      }
    }
  }
  return out;
}

/** How the due date reads on a given day. */
function dueText(due: string, onDay: string): string {
  const days = Math.round((parseISODate(due).getTime() - parseISODate(onDay).getTime()) / DAY_MS);
  if (days < 0) return 'متأخرة';
  if (days === 0) return 'موعدها اليوم';
  if (days === 1) return 'موعدها غدًا';
  return `موعدها ${formatShortDate(due)}`;
}

function reminder({ board, card }: OpenCard, at: number, text: string): PlannedNotification {
  return {
    id: `reminder:${cardKey(board.id, card.id)}`,
    channel: 'reminders',
    at,
    title: card.title,
    body: `${text} · ${board.title}`,
    data: { kind: 'reminder', boardId: board.id, cardId: card.id, url: `/board/${board.id}/card/${card.id}` },
  };
}

const short = (title: string) => (title.length > 40 ? `${title.slice(0, 38).trimEnd()}…` : title);

/** «أ»، «ب» وبطاقتان أخريان */
function titles(cards: OpenCard[]): string {
  const named = cards.slice(0, 2).map((c) => `«${short(c.card.title)}»`);
  const rest = cards.length - named.length;
  if (rest === 0) return named.join(' و');
  return `${named.join('، ')} ${rest === 2 ? 'وبطاقتان أخريان' : `و${pluralCards(rest)} أخرى`}`;
}

function digest(day: string, at: number, dueToday: OpenCard[], overdue: OpenCard[]): PlannedNotification {
  const lines: string[] = [];
  if (dueToday.length > 0) lines.push(`اليوم: ${titles(dueToday)}`);
  if (overdue.length > 0) lines.push(`متأخرة: ${titles(overdue)}`);
  // Open the board when everything is on one, otherwise the list of boards.
  const boardIds = new Set([...dueToday, ...overdue].map((c) => c.board.id));
  const url = boardIds.size === 1 ? `/board/${[...boardIds][0]}` : '/';
  return {
    id: `digest:${day}`,
    channel: 'digest',
    at,
    title: 'خطة اليوم',
    body: lines.join('\n'),
    data: { kind: 'digest', url },
  };
}

export function planNotifications(
  boards: Board[],
  prefs: NotificationPrefs,
  snoozes: Snoozes,
  now: Date,
): PlannedNotification[] {
  const nowMs = now.getTime();
  const cards = openDueCards(boards);
  const planned: PlannedNotification[] = [];

  // One reminder per card. With the digest on, it already lists the day's cards at the same
  // hour, so separate reminders on the due day would only repeat it.
  const perCard = prefs.reminders === 'dayBefore' || (prefs.reminders === 'dueDay' && !prefs.digest);
  const until = nowMs + REMINDER_DAYS * DAY_MS;
  for (const c of cards) {
    const snoozedUntil = snoozes[cardKey(c.board.id, c.card.id)];
    if (prefs.reminders !== 'off' && snoozedUntil > nowMs) {
      planned.push(reminder(c, snoozedUntil, dueText(c.due, toISODate(new Date(snoozedUntil)))));
      continue;
    }
    if (!perCard) continue;
    const day = prefs.reminders === 'dayBefore' ? addDays(c.due, -1) : c.due;
    const at = atHour(day, prefs.hour).getTime();
    if (at > nowMs && at <= until) planned.push(reminder(c, at, dueText(c.due, day)));
  }

  // The digest, for each coming day that has something due or overdue.
  if (prefs.digest) {
    const today = toISODate(now);
    for (let i = 0; i < DIGEST_DAYS; i++) {
      const day = addDays(today, i);
      const at = atHour(day, prefs.hour).getTime();
      if (at <= nowMs) continue;
      const dueToday = cards.filter((c) => c.due === day);
      const overdue = cards.filter((c) => c.due < day);
      if (dueToday.length > 0 || overdue.length > 0) planned.push(digest(day, at, dueToday, overdue));
    }
  }

  return planned.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(0, MAX_SCHEDULED);
}
