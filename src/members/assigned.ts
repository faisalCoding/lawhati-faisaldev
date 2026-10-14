import { normalizeSearch } from '../lib/filter';
import { isCardDone } from '../shared/cards';
import type { Board, Card, ChecklistItem, Label, List } from '../shared/types';
import type { BoardEntry } from '../store/store';
import type { Member } from './api';

/** The card's labels that make it urgent («عاجل») and important («مهم»), if it has them. */
export interface Priority {
  urgent: Label | null;
  important: Label | null;
}

export interface Found {
  board: Board;
  list: List;
  card: Card;
  item?: ChecklistItem;
  /** The card's, for a task too. */
  priority: Priority;
}

// Label names as people write them, matched whole after `normalizeSearch` («عاجلة» is «عاجل»).
const URGENT = new Set(['عاجل', 'عاجلة', 'مستعجل'].map(normalizeSearch));
const IMPORTANT = new Set(['مهم', 'هام', 'هامة'].map(normalizeSearch));

/** Whether a card is urgent or important, from its labels, while the board shows labels. */
export function priorityOf(board: Board, card: Card): Priority {
  const priority: Priority = { urgent: null, important: null };
  if (!board.powerUps.labels) return priority;
  for (const label of board.labels) {
    if (!card.labelIds.includes(label.id)) continue;
    const name = normalizeSearch(label.name);
    if (URGENT.has(name)) priority.urgent ??= label;
    else if (IMPORTANT.has(name)) priority.important ??= label;
  }
  return priority;
}

/** 0: urgent and important, 1: urgent, 2: important, 3: neither. */
export function priorityRank({ urgent, important }: Priority): number {
  if (urgent) return important ? 0 : 1;
  return important ? 2 : 3;
}

/**
 * Everything assigned to the signed-in employee, on every board on this device. Open before done;
 * then urgent and important, urgent, important, the rest; and in each, the soonest due first.
 */
export function findAssigned(
  boards: Record<string, BoardEntry>,
  order: string[],
  me: Member,
): { cards: Found[]; tasks: Found[] } {
  const cards: Found[] = [];
  const tasks: Found[] = [];
  for (const id of order) {
    const board = boards[id]?.board;
    if (!board) continue;
    for (const list of board.lists) {
      for (const cardId of list.cardIds) {
        const card = board.cards[cardId];
        if (!card) continue;
        const mine = card.assignees?.some((a) => a.id === me.id);
        const items = card.checklist.filter((item) => item.assignee?.id === me.id);
        if (!mine && items.length === 0) continue;
        const priority = priorityOf(board, card);
        if (mine) cards.push({ board, list, card, priority });
        for (const item of items) tasks.push({ board, list, card, item, priority });
      }
    }
  }
  const key = (f: Found) => ({
    done: (f.item ? f.item.done : isCardDone(f.card)) ? 1 : 0,
    rank: priorityRank(f.priority),
    due: f.card.due && f.board.powerUps.dueDates ? f.card.due : '9999-99-99',
  });
  const byKey = (a: Found, b: Found) => {
    const ka = key(a);
    const kb = key(b);
    return ka.done - kb.done || ka.rank - kb.rank || (ka.due < kb.due ? -1 : ka.due > kb.due ? 1 : 0);
  };
  return { cards: cards.sort(byKey), tasks: tasks.sort(byKey) };
}

/** How many cards and tasks assigned to someone are still open. */
export function countOpenAssigned(found: { cards: Found[]; tasks: Found[] }) {
  return {
    cards: found.cards.filter((f) => !isCardDone(f.card)).length,
    tasks: found.tasks.filter((f) => !f.item?.done).length,
  };
}
