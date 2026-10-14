import { BOARD_FIELDS, CARD_FIELDS, cardField, CHECK_FIELDS, checkField, LIST_FIELDS, record, same } from './activity';
import type { Board, Card, List, Op } from './types';

// Pure, deterministic board reducer. The app applies operations optimistically and
// the sync server applies the same operations in its own order, so both must agree.

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
