import { isCardDone } from './cards';
import type { ActivityEntry, ActivityWhat, Board, Card, ChecklistItem, List, Op, OpInput, UndoStep } from './types';

// The board's activity: who changed what, and how to undo it. The reducer notes every change as it
// applies it, on the sync server and on each device alike, so the whole team sees the same history.
// Each entry keeps the operations that put things back; undoing an entry sends them as a new group,
// which is an entry of its own (and undoing that one is a redo).

/** The most entries a board keeps; the oldest go first. */
export const MAX_ACTIVITY = 100;
/** Cards one entry may keep a copy of to bring back (a whole list's, a selection's). */
const MAX_UNDO_CARDS = 500;
/**
 * Cards the whole log may keep copies of. Past it, the oldest entries lose their undo (they stay in
 * the log), so the board stays small enough to send and to save on a phone.
 */
const MAX_HELD_CARDS = 600;

export const BOARD_FIELDS = ['title', 'color', 'icon', 'buttons'] as const;
export const LIST_FIELDS = ['title', 'wipLimit'] as const;
export const CARD_FIELDS = ['title', 'description', 'due', 'dueDone', 'cover', 'link', 'assignees'] as const;
export const CHECK_FIELDS = ['text', 'done', 'assignee'] as const;

type BoardField = (typeof BOARD_FIELDS)[number];
type CardField = (typeof CARD_FIELDS)[number];
type CheckField = (typeof CHECK_FIELDS)[number];

/** Whether two values are the same, a missing value counting as null. */
export const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A card's field as every version reads it: fields older cards lack have their default. */
export function cardField(card: Card, key: CardField): unknown {
  switch (key) {
    case 'dueDone':
      return card.dueDone ?? false;
    case 'link':
      return card.link ?? null;
    case 'assignees':
      return card.assignees ?? [];
    default:
      return card[key];
  }
}

export function checkField(item: ChecklistItem, key: CheckField): unknown {
  return key === 'assignee' ? (item.assignee ?? null) : item[key];
}

function boardField(board: Board, key: BoardField): unknown {
  return key === 'buttons' ? (board.buttons ?? []) : board[key];
}

const listOf = (board: Board, cardId: string): List | undefined => board.lists.find((l) => l.cardIds.includes(cardId));

/** The fields a patch really changed: their values before (to put back) and after (to expect then). */
function changes<K extends string>(
  keys: readonly K[],
  patch: object,
  before: (key: K) => unknown,
  after: (key: K) => unknown,
): { patch: Record<string, unknown>; expect: Record<string, unknown> } | null {
  const back: Record<string, unknown> = {};
  const expect: Record<string, unknown> = {};
  for (const key of keys) {
    if ((patch as Record<string, unknown>)[key] === undefined) continue;
    const was = before(key);
    const now = after(key);
    if (same(was, now)) continue;
    back[key] = was;
    expect[key] = now;
  }
  return Object.keys(back).length ? { patch: back, expect } : null;
}

/** What an operation did, in the names things had then. Null for what is not worth a line. */
function whatOf(before: Board, after: Board, op: Op): ActivityWhat | null {
  switch (op.type) {
    case 'board/update': {
      const changed = (key: BoardField) =>
        op.patch[key] !== undefined && !same(boardField(before, key), boardField(after, key));
      if (changed('title')) return { type: 'board/title', title: after.title };
      if (changed('buttons')) return { type: 'board/buttons' };
      if (changed('color') || changed('icon')) return { type: 'board/look' };
      return null;
    }
    case 'powerUp/set':
      return { type: 'powerUp', key: op.key, on: op.enabled };
    case 'label/rename': {
      const label = after.labels.find((l) => l.id === op.labelId);
      return label ? { type: 'label/rename', name: label.name, color: label.color } : null;
    }
    case 'list/add':
      return { type: 'list/add', list: op.list.title };
    case 'list/update': {
      const was = before.lists.find((l) => l.id === op.listId);
      const now = after.lists.find((l) => l.id === op.listId);
      if (!was || !now) return null;
      if (was.title !== now.title) return { type: 'list/title', list: now.title, from: was.title };
      if (was.wipLimit !== now.wipLimit) return { type: 'list/wip', list: now.title, limit: now.wipLimit };
      return null;
    }
    case 'list/move': {
      const list = after.lists.find((l) => l.id === op.listId);
      return list ? { type: 'list/move', list: list.title } : null;
    }
    case 'list/remove': {
      const list = before.lists.find((l) => l.id === op.listId);
      return list ? { type: 'list/remove', list: list.title, cards: list.cardIds.length } : null;
    }
    case 'card/add':
      return { type: 'card/add', card: op.card.title, list: listOf(after, op.card.id)?.title ?? '' };
    case 'card/remove': {
      const card = before.cards[op.cardId];
      return card ? { type: 'card/remove', card: card.title } : null;
    }
    case 'card/move': {
      const card = after.cards[op.cardId];
      const to = listOf(after, op.cardId);
      return card && to
        ? { type: 'card/move', card: card.title, from: listOf(before, op.cardId)?.title ?? '', to: to.title }
        : null;
    }
    case 'card/update': {
      const was = before.cards[op.cardId];
      const now = after.cards[op.cardId];
      if (!was || !now) return null;
      const changed = (key: CardField) =>
        op.patch[key] !== undefined && !same(cardField(was, key), cardField(now, key));
      const card = now.title;
      if (changed('dueDone')) return { type: 'card/done', card, done: isCardDone(now) };
      if (changed('assignees')) {
        const had = was.assignees ?? [];
        const has = now.assignees ?? [];
        return {
          type: 'card/assign',
          card,
          added: has.filter((a) => !had.some((b) => b.id === a.id)).map((a) => a.name),
          removed: had.filter((a) => !has.some((b) => b.id === a.id)).map((a) => a.name),
        };
      }
      if (changed('due')) return { type: 'card/due', card, due: now.due };
      if (changed('title')) return { type: 'card/title', card, from: was.title };
      if (changed('description')) return { type: 'card/description', card };
      if (changed('cover')) return { type: 'card/cover', card, on: !!now.cover };
      // Refreshing a linked board's name or code is the app's own bookkeeping, not news.
      if (changed('link') && (was.link?.boardId ?? null) !== (now.link?.boardId ?? null)) {
        return { type: 'card/link', card, board: now.link?.title ?? null };
      }
      return null;
    }
    case 'card/setLabel': {
      const card = after.cards[op.cardId];
      const label = after.labels.find((l) => l.id === op.labelId);
      return card
        ? { type: 'card/label', card: card.title, label: label?.name ?? '', color: label?.color ?? '', on: op.on }
        : null;
    }
    case 'check/add': {
      const card = after.cards[op.cardId];
      return card ? { type: 'task/add', card: card.title, task: op.item.text } : null;
    }
    case 'check/update': {
      const card = after.cards[op.cardId];
      const was = before.cards[op.cardId]?.checklist.find((i) => i.id === op.itemId);
      const now = card?.checklist.find((i) => i.id === op.itemId);
      if (!card || !was || !now) return null;
      if (was.done !== now.done) return { type: 'task/done', card: card.title, task: now.text, done: now.done };
      if (!same(was.assignee, now.assignee)) {
        return { type: 'task/assign', card: card.title, task: now.text, to: now.assignee?.name ?? null };
      }
      if (was.text !== now.text) return { type: 'task/edit', card: card.title, task: now.text, from: was.text };
      return null;
    }
    case 'check/remove': {
      const card = before.cards[op.cardId];
      const item = card?.checklist.find((i) => i.id === op.itemId);
      return card && item ? { type: 'task/remove', card: card.title, task: item.text } : null;
    }
    default:
      return null;
  }
}

/** The operations that undo `op`, in the order to send them. */
export function undoOf(before: Board, after: Board, op: Op): UndoStep[] {
  switch (op.type) {
    case 'board/update': {
      const c = changes(
        BOARD_FIELDS,
        op.patch,
        (k) => boardField(before, k),
        (k) => boardField(after, k),
      );
      return c ? [{ op: { type: 'board/update', patch: c.patch }, expect: c.expect }] : [];
    }
    case 'powerUp/set':
      return [{ op: { type: 'powerUp/set', key: op.key, enabled: !op.enabled } }];
    case 'label/rename': {
      const label = before.labels.find((l) => l.id === op.labelId);
      return label
        ? [{ op: { type: 'label/rename', labelId: label.id, name: label.name }, expect: { name: op.name } }]
        : [];
    }
    case 'list/add':
      return [{ op: { type: 'list/remove', listId: op.list.id } }];
    case 'list/update': {
      const was = before.lists.find((l) => l.id === op.listId);
      const now = after.lists.find((l) => l.id === op.listId);
      const c =
        was && now
          ? changes(
              LIST_FIELDS,
              op.patch,
              (k) => was[k],
              (k) => now[k],
            )
          : null;
      return c ? [{ op: { type: 'list/update', listId: op.listId, patch: c.patch }, expect: c.expect }] : [];
    }
    case 'list/move': {
      const from = before.lists.findIndex((l) => l.id === op.listId);
      return from < 0 ? [] : [{ op: { type: 'list/move', listId: op.listId, toIndex: from } }];
    }
    case 'list/remove': {
      const index = before.lists.findIndex((l) => l.id === op.listId);
      const list = before.lists[index];
      if (!list) return [];
      // The list comes back empty, in its place, then its cards in their order.
      return [
        { op: { type: 'list/add', list: { ...list, cardIds: [] } } },
        { op: { type: 'list/move', listId: list.id, toIndex: index } },
        ...list.cardIds
          .filter((id) => before.cards[id])
          .map((id): UndoStep => ({ op: { type: 'card/add', listId: list.id, card: before.cards[id] } })),
      ];
    }
    case 'card/add':
      return [{ op: { type: 'card/remove', cardId: op.card.id } }];
    case 'card/remove': {
      const card = before.cards[op.cardId];
      const list = listOf(before, op.cardId);
      if (!card || !list) return [];
      // Cards are added at the bottom of a list; the move puts it back in its place.
      return [
        { op: { type: 'card/add', listId: list.id, card } },
        { op: { type: 'card/move', cardId: card.id, toListId: list.id, toIndex: list.cardIds.indexOf(card.id) } },
      ];
    }
    case 'card/update': {
      const was = before.cards[op.cardId];
      const now = after.cards[op.cardId];
      const c =
        was && now
          ? changes(
              CARD_FIELDS,
              op.patch,
              (k) => cardField(was, k),
              (k) => cardField(now, k),
            )
          : null;
      return c ? [{ op: { type: 'card/update', cardId: op.cardId, patch: c.patch }, expect: c.expect }] : [];
    }
    case 'card/move': {
      const from = listOf(before, op.cardId);
      const to = listOf(after, op.cardId);
      if (!from || !to) return [];
      return [
        {
          op: { type: 'card/move', cardId: op.cardId, toListId: from.id, toIndex: from.cardIds.indexOf(op.cardId) },
          // Moved again since to another list: that move stays.
          expect: { list: to.id },
        },
      ];
    }
    case 'card/setLabel':
      return [{ op: { type: 'card/setLabel', cardId: op.cardId, labelId: op.labelId, on: !op.on } }];
    case 'check/add':
      return [{ op: { type: 'check/remove', cardId: op.cardId, itemId: op.item.id } }];
    case 'check/update': {
      const was = before.cards[op.cardId]?.checklist.find((i) => i.id === op.itemId);
      const now = after.cards[op.cardId]?.checklist.find((i) => i.id === op.itemId);
      const c =
        was && now
          ? changes(
              CHECK_FIELDS,
              op.patch,
              (k) => checkField(was, k),
              (k) => checkField(now, k),
            )
          : null;
      return c
        ? [{ op: { type: 'check/update', cardId: op.cardId, itemId: op.itemId, patch: c.patch }, expect: c.expect }]
        : [];
    }
    case 'check/remove': {
      const checklist = before.cards[op.cardId]?.checklist ?? [];
      const index = checklist.findIndex((i) => i.id === op.itemId);
      return index < 0 ? [] : [{ op: { type: 'check/add', cardId: op.cardId, item: checklist[index], index } }];
    }
    default:
      return [];
  }
}

/** The cards an operation changed. */
function cardsOf(op: OpInput): string[] {
  switch (op.type) {
    case 'card/add':
      return [op.card.id];
    case 'card/remove':
    case 'card/update':
    case 'card/move':
    case 'card/setLabel':
    case 'check/add':
    case 'check/update':
    case 'check/remove':
      return [op.cardId];
    default:
      return [];
  }
}

const heldCards = (steps: UndoStep[]) => steps.filter((s) => s.op.type === 'card/add').length;

/** Adds one more operation of a group to its entry. */
function merge(entry: ActivityEntry, what: ActivityWhat, steps: UndoStep[], cards: string[]): ActivityEntry {
  const kinds = entry.kinds ?? [entry.what.type];
  // Putting a card just added in its place is part of adding it.
  const partOfAdding =
    what.type === 'card/move' && entry.what.type === 'card/add' && cards.every((id) => entry.cards.includes(id));
  const nextKinds = partOfAdding || kinds.includes(what.type) ? kinds : [...kinds, what.type];
  // Undone last change first.
  const undo = entry.undo ? [...steps, ...entry.undo] : null;
  const next: ActivityEntry = {
    ...entry,
    cards: [...entry.cards, ...cards.filter((id) => !entry.cards.includes(id))],
    n: (entry.n ?? 1) + 1,
    undo: undo && heldCards(undo) <= MAX_UNDO_CARDS ? undo : null,
  };
  if (nextKinds.length > 1) next.kinds = nextKinds;
  return next;
}

/** Notes an operation `op`, which turned `before` into `after`, in the board's activity. */
export function record(before: Board, after: Board, op: Op): Board {
  const what = whatOf(before, after, op);
  if (!what) return after;
  const log = after.activity ?? [];
  const steps = undoOf(before, after, op);
  const cards = cardsOf(op);

  // A group's entry is usually the last one, unless a teammate's change came in between.
  for (let index = log.length - 1; op.group && index >= 0; index--) {
    if (log[index].id !== op.group) continue;
    const next = log.slice();
    next[index] = merge(log[index], what, steps, cards);
    return { ...after, activity: trimHeld(next) };
  }

  const entry: ActivityEntry = {
    id: op.group ?? op.id,
    at: op.at,
    by: op.by ?? null,
    what,
    cards,
    undo: heldCards(steps) <= MAX_UNDO_CARDS ? steps : null,
  };
  if (op.button) entry.button = op.button;
  if (op.reverts) entry.reverts = op.reverts;
  let next = [...log, entry];
  if (op.reverts) next = next.map((e) => (e.id === op.reverts ? { ...e, revertedBy: entry.id } : e));
  if (next.length > MAX_ACTIVITY) next = next.slice(next.length - MAX_ACTIVITY);
  return { ...after, activity: trimHeld(next) };
}

/** Drops the undo of the oldest entries while the log keeps more card copies than it may. */
function trimHeld(log: ActivityEntry[]): ActivityEntry[] {
  let held = 0;
  for (const e of log) held += e.undo ? heldCards(e.undo) : 0;
  if (held <= MAX_HELD_CARDS) return log;
  const next = log.slice();
  for (let i = 0; i < next.length - 1 && held > MAX_HELD_CARDS; i++) {
    const cards = next[i].undo ? heldCards(next[i].undo!) : 0;
    if (!cards) continue;
    held -= cards;
    next[i] = { ...next[i], undo: null };
  }
  return next;
}

/**
 * What is left of an undo step for the board as it is now, or null when nothing is: a deleted card
 * that is back already, a field someone changed again since, a card that is gone.
 */
export function stillApplies(board: Board, step: UndoStep): OpInput | null {
  const { op, expect } = step;
  // The fields whose value is still what the change left.
  const kept = (patch: object, current: (key: string) => unknown): Record<string, unknown> | null => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!expect || !(key in expect) || same(current(key), expect[key])) out[key] = value;
    }
    return Object.keys(out).length ? out : null;
  };
  switch (op.type) {
    case 'board/update': {
      const patch = kept(op.patch, (k) => boardField(board, k as BoardField));
      return patch ? ({ ...op, patch } as OpInput) : null;
    }
    case 'powerUp/set':
      return board.powerUps[op.key] !== op.enabled ? op : null;
    case 'label/rename': {
      const label = board.labels.find((l) => l.id === op.labelId);
      return label && (!expect || same(label.name, expect.name)) ? op : null;
    }
    case 'list/add':
      return board.lists.some((l) => l.id === op.list.id) ? null : op;
    case 'list/update': {
      const list = board.lists.find((l) => l.id === op.listId);
      const patch = list ? kept(op.patch, (k) => list[k as (typeof LIST_FIELDS)[number]]) : null;
      return patch ? ({ ...op, patch } as OpInput) : null;
    }
    case 'list/move':
    case 'list/remove':
      return board.lists.some((l) => l.id === op.listId) ? op : null;
    case 'card/add': {
      if (board.cards[op.card.id]) return null;
      // Its list was deleted since: it comes back in the first one.
      const list = board.lists.find((l) => l.id === op.listId) ?? board.lists[0];
      return list ? { ...op, listId: list.id } : null;
    }
    case 'card/remove':
      return board.cards[op.cardId] ? op : null;
    case 'card/update': {
      const card = board.cards[op.cardId];
      const patch = card ? kept(op.patch, (k) => cardField(card, k as CardField)) : null;
      return patch ? ({ ...op, patch } as OpInput) : null;
    }
    case 'card/move':
      if (!board.cards[op.cardId] || !board.lists.some((l) => l.id === op.toListId)) return null;
      return expect && listOf(board, op.cardId)?.id !== expect.list ? null : op;
    case 'card/setLabel': {
      const card = board.cards[op.cardId];
      return card && card.labelIds.includes(op.labelId) !== op.on ? op : null;
    }
    case 'check/add': {
      const card = board.cards[op.cardId];
      return card && !card.checklist.some((i) => i.id === op.item.id) ? op : null;
    }
    case 'check/update': {
      const item = board.cards[op.cardId]?.checklist.find((i) => i.id === op.itemId);
      const patch = item ? kept(op.patch, (k) => checkField(item, k as CheckField)) : null;
      return patch ? ({ ...op, patch } as OpInput) : null;
    }
    case 'check/remove':
      return board.cards[op.cardId]?.checklist.some((i) => i.id === op.itemId) ? op : null;
    default:
      return null;
  }
}

/** How many undos deep an entry is: 0 for a change, 1 for its undo, 2 for a redo, and so on. */
export function revertDepth(
  log: readonly ActivityEntry[],
  entry: ActivityEntry,
): { depth: number; origin: ActivityEntry | null } {
  let depth = 0;
  let current: ActivityEntry | undefined = entry;
  while (current?.reverts && depth <= 50) {
    const target: string = current.reverts;
    current = log.find((e) => e.id === target);
    depth++;
  }
  return { depth, origin: current ?? null };
}

/** Whether an entry's change is undone now: undone by an entry that was not undone in turn (a redo). */
export function isUndone(log: readonly ActivityEntry[], entry: ActivityEntry, depth = 0): boolean {
  if (!entry.revertedBy || depth > 50) return false;
  const by = log.find((e) => e.id === entry.revertedBy);
  // Undone by an entry that has since dropped out of the log: that undo still stands.
  if (!by) return true;
  return !isUndone(log, by, depth + 1);
}
