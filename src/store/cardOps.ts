import { offerUndo } from '../lib/undo';
import type { Board, Card, OpInput } from '../shared/types';
import { batch, dispatch } from './actions';
import { canRevert, toggleEntry } from './activity';
import { store } from './store';

// Changes to several cards at once (a selection, or a card button).

const boardOf = (boardId: string): Board | undefined => store.get().boards[boardId]?.board;

/** The cards among `ids` that still exist, list by list and top to bottom. */
export function inBoardOrder(board: Board, ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return board.lists.flatMap((l) => l.cardIds.filter((id) => wanted.has(id) && board.cards[id]));
}

/**
 * Applies `change` to each card, in board order, handing it the board as it is at that moment.
 * Adds the ids of the cards it changed to `changed` and returns how many there were.
 */
export function changeCards(
  boardId: string,
  ids: Iterable<string>,
  change: (card: Card, board: Board) => OpInput[],
  changed = new Set<string>(),
): number {
  const start = boardOf(boardId);
  if (!start) return 0;
  const before = changed.size;
  for (const id of inBoardOrder(start, ids)) {
    const board = boardOf(boardId);
    const card = board?.cards[id];
    if (!board || !card) continue;
    for (const op of change(card, board)) dispatch(boardId, op);
    if (boardOf(boardId) !== board) changed.add(id);
  }
  return changed.size - before;
}

/** Moves cards to the top or bottom of a list, keeping their order. Cards already in it stay put. */
export function moveCards(
  boardId: string,
  ids: Iterable<string>,
  toListId: string,
  position: 'top' | 'bottom' = 'bottom',
  changed = new Set<string>(),
): number {
  let placed = 0;
  return changeCards(
    boardId,
    ids,
    (card, board) => {
      const target = board.lists.find((l) => l.id === toListId);
      if (!target || target.cardIds.includes(card.id)) return [];
      const toIndex = position === 'top' ? placed++ : target.cardIds.length;
      return [{ type: 'card/move', cardId: card.id, toListId, toIndex }];
    },
    changed,
  );
}

/**
 * Runs a change on some cards as one entry in the board's activity, then says what it did with a way
 * to undo it. `run` returns how many cards it changed, and `describe` turns that number into the message.
 */
export function changeWithUndo(boardId: string, run: () => number, describe: (n: number) => string) {
  const { group, result: n } = batch(run);
  offerUndo(
    n > 0 ? describe(n) : 'لم يتغير شيء',
    canRevert(boardId, group) ? () => toggleEntry(boardId, group) : undefined,
  );
}
