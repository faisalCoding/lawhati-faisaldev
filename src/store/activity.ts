import { describeChange } from '../lib/activityText';
import { offerUndo } from '../lib/undo';
import { currentActor } from '../members/actor';
import { isUndone, revertDepth, stillApplies } from '../shared/activity';
import type { ActivityEntry, Board } from '../shared/types';
import { batch, dispatch } from './actions';
import { store } from './store';

// Undo and redo from the board's activity. Undoing an entry sends what still applies of its undo
// steps as a new entry that points back at it; undoing that one is a redo, and so on.

const boardOf = (boardId: string): Board | undefined => store.get().boards[boardId]?.board;

export type RevertResult =
  { status: 'done'; group: string } | { status: 'nothing' } | { status: 'gone' } | { status: 'impossible' };

/** Whether an entry can be undone: it is still in the log, with what puts things back. */
export function canRevert(boardId: string, entryId: string): boolean {
  return !!boardOf(boardId)?.activity?.find((e) => e.id === entryId)?.undo?.length;
}

/** Sends an entry's undo steps, skipping what was changed again since. */
export function revertEntry(boardId: string, entryId: string): RevertResult {
  const entry = boardOf(boardId)?.activity?.find((e) => e.id === entryId);
  if (!entry) return { status: 'gone' };
  const steps = entry.undo;
  if (!steps?.length) return { status: 'impossible' };
  const { group, result: changed } = batch(
    () => {
      let any = false;
      for (const step of steps) {
        const board = boardOf(boardId);
        const op = board && stillApplies(board, step);
        if (!op) continue;
        dispatch(boardId, op);
        if (boardOf(boardId) !== board) any = true;
      }
      return any;
    },
    { reverts: entryId },
  );
  return changed ? { status: 'done', group } : { status: 'nothing' };
}

/** The newest entry in the chain of undos and redos that starts at `entry`: reverting it flips the change. */
export function tipOf(log: readonly ActivityEntry[], entry: ActivityEntry): ActivityEntry {
  let current = entry;
  for (let i = 0; i < 50 && current.revertedBy; i++) {
    const next = log.find((e) => e.id === current.revertedBy);
    if (!next) break;
    current = next;
  }
  return current;
}

/** What the button on a change does now: undo it, redo it, or nothing (an undo can't be undone from its own line). */
export function entryAction(log: readonly ActivityEntry[], entry: ActivityEntry): 'undo' | 'redo' | null {
  if (entry.reverts) return null;
  const tip = tipOf(log, entry);
  if (!tip.undo?.length) return null;
  const undone = isUndone(log, entry);
  // Undone by an entry no longer in the log: its steps went with it.
  if (undone && tip === entry) return null;
  return undone ? 'redo' : 'undo';
}

/** Undoes or redoes an entry, then says so, with a button that does the opposite. */
export function toggleEntry(boardId: string, entryId: string) {
  const log = boardOf(boardId)?.activity ?? [];
  const entry = log.find((e) => e.id === entryId);
  if (!entry) return offerUndo('لم يعد هذا التغيير في السجل');
  const { depth, origin } = revertDepth(log, entry);
  const what = origin && !origin.reverts ? describeChange(origin) : 'تغيير أقدم';
  const result = revertEntry(boardId, entryId);
  if (result.status === 'gone') return offerUndo('لم يعد هذا التغيير في السجل');
  if (result.status === 'impossible') return offerUndo('لا يمكن التراجع عن هذا التغيير');
  if (result.status === 'nothing') return offerUndo('لا شيء لتغييره: تغيّر ذلك بعده');
  // Reverting a change (or a redo) undoes it; reverting an undo redoes it.
  const undid = depth % 2 === 0;
  offerUndo(undid ? `تم التراجع عن: ${what}` : `تمت إعادة: ${what}`, () => toggleEntry(boardId, result.group), undid);
}

/** My latest change on the board that is still in effect. */
export function lastUndoable(log: readonly ActivityEntry[], me: string): ActivityEntry | undefined {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.by?.id !== me || e.reverts) continue;
    if (entryAction(log, e) === 'undo') return e;
  }
  return undefined;
}

/** My latest undo that still stands, unless I made a new change since (as in any editor). */
export function lastRedoable(log: readonly ActivityEntry[], me: string): ActivityEntry | undefined {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.by?.id !== me) continue;
    if (!e.reverts) return undefined;
    if (revertDepth(log, e).depth % 2 === 1 && !isUndone(log, e) && e.undo?.length) return e;
  }
  return undefined;
}

/** Undoes my latest change on the board. */
export function undoMine(boardId: string) {
  const log = boardOf(boardId)?.activity ?? [];
  const entry = lastUndoable(log, currentActor().id);
  if (!entry) return offerUndo('لا تغيير لك هنا للتراجع عنه');
  toggleEntry(boardId, tipOf(log, entry).id);
}

/** Redoes my latest undo on the board. */
export function redoMine(boardId: string) {
  const log = boardOf(boardId)?.activity ?? [];
  const entry = lastRedoable(log, currentActor().id);
  if (!entry) return offerUndo('لا شيء لإعادته');
  toggleEntry(boardId, entry.id);
}
