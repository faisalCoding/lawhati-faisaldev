import { normalizeShareCode, makeShareCode, uid } from '../lib/ids';
import { createBoardFromTemplate, createWelcomeBoard } from '../lib/templates';
import { currentActor, loadActor } from '../members/actor';
import { applyOp } from '../shared/reducer';
import type { Op, OpInput, OpMeta } from '../shared/types';
import { bringOverPreviousAddress } from './previousAddress';
import { findBoardIdByCode, store } from './store';
import { SyncError, syncClient } from './sync';

let initPromise: Promise<void> | null = null;

export function initStore(): Promise<void> {
  initPromise ??= (async () => {
    await bringOverPreviousAddress();
    // Who is making changes, so the activity names them from the first one.
    const [saved] = await Promise.all([store.load(), loadActor()]);
    store.set((s) => {
      if (saved) return { ...s, ...saved, order: saved.order.filter((id) => saved.boards[id]), ready: true };
      const welcome = createWelcomeBoard();
      return { ...s, boards: { [welcome.id]: { board: welcome, sync: null } }, order: [welcome.id], ready: true };
    });
    if (Object.values(store.get().boards).some((e) => e.sync)) syncClient.ensureConnected();
  })();
  return initPromise;
}

/** The group the changes being dispatched belong to, while `batch` runs. */
let group: (OpMeta & { group: string }) | null = null;

/**
 * Runs `run`, and every change it dispatches becomes one entry in the board's activity (moving five
 * selected cards is one line, undone in one go). Returns the entry's id with what `run` returned.
 */
export function batch<T>(run: () => T, meta: Pick<OpMeta, 'reverts' | 'button'> = {}): { group: string; result: T } {
  // Inside another batch, the changes join that one.
  if (group) return { group: group.group, result: run() };
  group = { ...meta, group: uid() };
  const id = group.group;
  try {
    return { group: id, result: run() };
  } finally {
    group = null;
  }
}

/** Applies a change locally right away and, for shared boards, sends it to the sync server. */
export function dispatch(boardId: string, input: OpInput) {
  // Older app versions hide tasks unless the board's checklist flag is on, so a task turns it on.
  if (input.type === 'check/add' && store.get().boards[boardId]?.board.powerUps.checklists === false) {
    dispatch(boardId, { type: 'powerUp/set', key: 'checklists', enabled: true });
  }
  const entry = store.get().boards[boardId];
  if (!entry) return;
  const op = { ...input, id: uid(), at: Date.now(), by: currentActor(), ...group } as Op;
  const board = applyOp(entry.board, op);
  if (board === entry.board) return;
  const sync = entry.sync ? { ...entry.sync, pending: [...entry.sync.pending, op] } : null;
  store.set((s) => ({ ...s, boards: { ...s.boards, [boardId]: { board, sync } } }));
  if (sync) syncClient.sendOp(sync.code, op);
}

/**
 * Puts whoever is using this device on a board's roster, so they can be assigned work and, later,
 * recorded as having attended a meeting.
 *
 * Called every time a board is opened. The reducer ignores someone it already holds under the same
 * name, and `dispatch` sends nothing when the board did not change — so the usual case is a
 * comparison and no traffic. A guest who never gave a name adds nothing worth a row.
 */
export function noteMember(boardId: string) {
  const actor = currentActor();
  if (!actor.name.trim()) return;
  dispatch(boardId, { type: 'member/seen', member: { id: actor.id, name: actor.name.trim(), at: Date.now() } });
}

/**
 * Resolves once the sync server has confirmed this board's pending changes, or after `timeoutMs`.
 * Screens that close right after a change (widget actions, quick add) use it so edits reach the
 * team before the app goes away; anything still unconfirmed is sent on the next connection.
 */
export async function waitForServer(boardId: string, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && (store.get().boards[boardId]?.sync?.pending.length ?? 0) > 0) {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

export function createBoard(opts: { title: string; color?: string; icon?: string; templateId?: string }): string {
  const board = createBoardFromTemplate(opts);
  store.set((s) => ({
    ...s,
    boards: { ...s.boards, [board.id]: { board, sync: null } },
    order: [board.id, ...s.order],
  }));
  return board.id;
}

export function deleteBoard(boardId: string) {
  const entry = store.get().boards[boardId];
  if (!entry) return;
  if (entry.sync) syncClient.leave(entry.sync.code);
  store.set((s) => {
    const boards = { ...s.boards };
    delete boards[boardId];
    return { ...s, boards, order: s.order.filter((id) => id !== boardId) };
  });
}

/** Publishes the board to the sync server and returns its share code. */
export async function shareBoard(boardId: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const entry = store.get().boards[boardId];
    if (!entry) throw new SyncError('not_found');
    if (entry.sync) return entry.sync.code;
    const code = makeShareCode();
    try {
      await syncClient.publish(code, { ...entry.board, shareCode: code });
      return code;
    } catch (e) {
      if (!(e instanceof SyncError && e.reason === 'code_taken')) throw e;
    }
  }
  throw new SyncError('code_taken');
}

/** Joins a shared board by code and returns its local id. */
export async function joinBoard(input: string): Promise<string> {
  const code = normalizeShareCode(input);
  const existing = findBoardIdByCode(store.get(), code);
  if (existing) return existing;
  const board = await syncClient.join(code);
  return findBoardIdByCode(store.get(), code) ?? board.id;
}

/** Stops syncing on this device; the board stays here as a private copy. */
export function unlinkBoard(boardId: string) {
  const entry = store.get().boards[boardId];
  if (!entry?.sync) return;
  syncClient.leave(entry.sync.code);
  store.set((s) => ({
    ...s,
    boards: { ...s.boards, [boardId]: { board: { ...entry.board, shareCode: null }, sync: null } },
  }));
}

export function setServerUrl(url: string | null) {
  const value = url?.trim() || null;
  store.set((s) => (s.serverUrl === value ? s : { ...s, serverUrl: value }));
  syncClient.restart();
}

export function reconnect() {
  syncClient.restart();
}
