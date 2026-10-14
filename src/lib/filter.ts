import { isAssignedTo, isCardDone } from '../shared/cards';
import type { Board, Card } from '../shared/types';
import { addDays, todayISO } from './dates';
import { toLatinDigits } from './text';

// Filtering a board's cards, as in Trello: a keyword, people, completion, due dates and labels.
// A card shows when it matches at least one choice in every section that has one.

export interface BoardFilter {
  keyword: string;
  /** `none`: cards nobody is responsible for. `me`: the signed-in employee's. `ids`: these people's. */
  members: { none: boolean; me: boolean; ids: string[] };
  status: { done: boolean; open: boolean };
  due: { none: boolean; overdue: boolean; day: boolean; week: boolean; month: boolean };
  labels: { none: boolean; ids: string[] };
}

export const EMPTY_FILTER: BoardFilter = {
  keyword: '',
  members: { none: false, me: false, ids: [] },
  status: { done: false, open: false },
  due: { none: false, overdue: false, day: false, week: false, month: false },
  labels: { none: false, ids: [] },
};

export type DueChoice = keyof BoardFilter['due'];

/**
 * Text as it is searched: without diacritics and tatweel, with the letters people type
 * interchangeably made the same (أ إ آ ا، ى ي، ة ه), Latin digits, lower case.
 */
export function normalizeSearch(text: string): string {
  return toLatinDigits(text)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/** How many choices are on (the keyword counts as one), for the badge on the filter button. */
export function countChoices(f: BoardFilter): number {
  const on = (values: boolean[]) => values.filter(Boolean).length;
  return (
    (f.keyword.trim() ? 1 : 0) +
    on([f.members.none, f.members.me]) +
    f.members.ids.length +
    on([f.status.done, f.status.open]) +
    on(Object.values(f.due)) +
    (f.labels.none ? 1 : 0) +
    f.labels.ids.length
  );
}

/** Everything a keyword is looked for in: the title, description, labels, people, tasks and linked board. */
function searchText(card: Card, board: Pick<Board, 'labels'>): string {
  const parts = [card.title, card.description, card.link?.title ?? ''];
  for (const id of card.labelIds) parts.push(board.labels.find((l) => l.id === id)?.name ?? '');
  for (const a of card.assignees ?? []) parts.push(a.name);
  for (const item of card.checklist) {
    parts.push(item.text);
    if (item.assignee) parts.push(item.assignee.name);
  }
  return normalizeSearch(parts.join('\n'));
}

/**
 * The test a card must pass to show, or null when the filter lets every card through.
 * `me`: the signed-in employee's id. Sections of Power-Ups that are off are left out.
 */
export function cardMatcher(
  f: BoardFilter,
  board: Pick<Board, 'labels' | 'powerUps'>,
  me: string | null,
): ((card: Card) => boolean) | null {
  const tests: ((card: Card) => boolean)[] = [];

  const terms = normalizeSearch(f.keyword).split(' ').filter(Boolean);
  if (terms.length) {
    tests.push((card) => {
      const text = searchText(card, board);
      return terms.every((t) => text.includes(t));
    });
  }

  const people = [...f.members.ids, ...(f.members.me && me ? [me] : [])];
  if (f.members.none || people.length) {
    tests.push(
      (card) => (f.members.none && (card.assignees ?? []).length === 0) || people.some((id) => isAssignedTo(card, id)),
    );
  }

  if (f.status.done !== f.status.open) tests.push((card) => isCardDone(card) === f.status.done);

  if (board.powerUps.dueDates && Object.values(f.due).some(Boolean)) {
    const today = todayISO();
    const limits = { day: addDays(today, 1), week: addDays(today, 7), month: addDays(today, 30) };
    tests.push((card) => {
      const due = card.due;
      if (!due) return f.due.none;
      if (f.due.overdue && due < today && !isCardDone(card)) return true;
      if (due < today) return false;
      return (
        (f.due.day && due <= limits.day) || (f.due.week && due <= limits.week) || (f.due.month && due <= limits.month)
      );
    });
  }

  if (board.powerUps.labels && (f.labels.none || f.labels.ids.length)) {
    const known = new Set(board.labels.map((l) => l.id));
    tests.push((card) => {
      const ids = card.labelIds.filter((id) => known.has(id));
      return (f.labels.none && ids.length === 0) || ids.some((id) => f.labels.ids.includes(id));
    });
  }

  return tests.length ? (card) => tests.every((t) => t(card)) : null;
}
