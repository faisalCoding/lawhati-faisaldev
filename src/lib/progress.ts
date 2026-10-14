import type { Board } from '../shared/types';

/**
 * How far along a board is. Kanban boards end with their "done" list («مكتمل», «تم الشراء»…),
 * so the cards in the last list count as done. A board with a single list has no done list.
 */
export function boardProgress(board: Board): { done: number | null; total: number } {
  const total = board.lists.reduce((n, list) => n + list.cardIds.filter((id) => board.cards[id]).length, 0);
  if (board.lists.length < 2) return { done: null, total };
  const last = board.lists[board.lists.length - 1];
  return { done: last.cardIds.filter((id) => board.cards[id]).length, total };
}
