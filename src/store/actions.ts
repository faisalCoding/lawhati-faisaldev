import { normalizeShareCode, makeShareCode, uid } from '../lib/ids';
import { createBoardFromTemplate, createWelcomeBoard, newCard } from '../lib/templates';
import { currentActor, loadActor } from '../members/actor';
import { applyOp } from '../shared/reducer';
import type { Meeting, Op, OpInput, OpMeta } from '../shared/types';
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
 * Opens a meeting, already carrying the board's standing agenda as its topics.
 *
 * Six months of real minutes had nineteen agenda items that were really six recurring subjects:
 * typing them out every week is work the board can do instead. Each topic keeps a thread back to
 * the subject it came from, so everything ever decided about one of them can be gathered later.
 *
 * Returns the new meeting's id.
 */
export function startMeeting(boardId: string, title: string, date: string): string | null {
  const board = store.get().boards[boardId]?.board;
  if (!board) return null;

  const meeting: Meeting = { id: uid(), title, date, attendees: [], topics: [], outcomes: [], createdAt: Date.now() };

  // One entry in the activity: opening a meeting is one act, however many topics it starts with.
  batch(() => {
    dispatch(boardId, { type: 'meeting/add', meeting });
    for (const subject of board.agenda ?? []) {
      dispatch(boardId, {
        type: 'topic/add',
        meetingId: meeting.id,
        topic: { id: uid(), title: subject.title, notes: '', subjectId: subject.id },
      });
    }
  });

  return meeting.id;
}

/**
 * Turns a meeting's task outcome into a card on the board, carrying its assignee and its date.
 *
 * This is the whole point of writing a task down as its own kind rather than as prose: on the board
 * it joins the reminders, «assigned to me», and the list people actually work from. The outcome
 * keeps a link to the card, so the minutes still say what was decided and where it went.
 *
 * The card goes to the first list — where new work starts on a kanban board. Moving it is a drag.
 * Returns the new card's id, or null when the board has no list to put it in.
 */
export function cardFromOutcome(boardId: string, meetingId: string, outcomeId: string): string | null {
  const board = store.get().boards[boardId]?.board;
  const meeting = board?.meetings?.find((m) => m.id === meetingId);
  const outcome = meeting?.outcomes?.find((o) => o.id === outcomeId);
  const list = board?.lists[0];
  if (!board || !outcome || !list || outcome.cardId) return null;

  const card = newCard(outcome.text, {
    due: outcome.due ?? null,
    assignees: outcome.assignee ? [outcome.assignee] : [],
    description: `من اجتماع «${meeting?.title ?? ''}»`,
  });

  // One entry in the activity and one undo: making the card and linking it back are a single act.
  // The link is dispatched first because a group is named after its first change, and «turned a
  // recommendation into a card» tells a teammate what happened; «added a card» loses the meeting.
  batch(() => {
    dispatch(boardId, { type: 'outcome/update', meetingId, outcomeId, patch: { cardId: card.id } });
    dispatch(boardId, { type: 'card/add', listId: list.id, card });
  });

  return card.id;
}

/**
 * Puts a meeting's task outcome inside an existing card, as one of its tasks.
 *
 * The other half of `cardFromOutcome`. Not every decision deserves a card: «عزام يراجع مع البراء»
 * belongs under the card for that student, not beside it. The outcome keeps both the card and the
 * task it became, so the minutes still say where it went and the meeting's progress can see it.
 */
export function checklistFromOutcome(
  boardId: string,
  meetingId: string,
  outcomeId: string,
  cardId: string,
): string | null {
  const board = store.get().boards[boardId]?.board;
  const outcome = board?.meetings?.find((m) => m.id === meetingId)?.outcomes?.find((o) => o.id === outcomeId);
  if (!board || !outcome || !board.cards[cardId] || outcome.cardId) return null;

  const item = { id: uid(), text: outcome.text, done: false, assignee: outcome.assignee ?? null };

  // The link first, so the activity names the act rather than the task appearing from nowhere.
  batch(() => {
    dispatch(boardId, { type: 'outcome/update', meetingId, outcomeId, patch: { cardId, itemId: item.id } });
    dispatch(boardId, { type: 'check/add', cardId, item });
  });

  return item.id;
}

/**
 * Carries a meeting's policy outcome into the board's standing policies — writing a new rule, or
 * replacing the text of one already there when `amends` names it.
 *
 * Nearly half of what these meetings produce is a standing rule, and the sixth meeting amended a
 * limit the fourth had set. Both paths record the meeting, so every rule says where it came from.
 *
 * The link is dispatched before the rule is written, which is what lets the activity tell «agreed
 * a policy» from «amended one»: afterwards both look alike. Returns the policy's id.
 */
export function policyFromOutcome(
  boardId: string,
  meetingId: string,
  outcomeId: string,
  options: { amends?: string | null; columnId?: string | null } = {},
): string | null {
  const board = store.get().boards[boardId]?.board;
  const outcome = board?.meetings?.find((m) => m.id === meetingId)?.outcomes?.find((o) => o.id === outcomeId);
  if (!board || !outcome || outcome.policyId) return null;

  const existing = options.amends ? (board.policies ?? []).find((x) => x.id === options.amends) : undefined;
  const policyId = existing?.id ?? uid();

  batch(() => {
    dispatch(boardId, { type: 'outcome/update', meetingId, outcomeId, patch: { policyId } });
    if (existing) {
      dispatch(boardId, { type: 'policy/update', policyId, patch: { text: outcome.text, meetingId } });
    } else {
      dispatch(boardId, {
        type: 'policy/add',
        policy: {
          id: policyId,
          text: outcome.text,
          columnId: options.columnId ?? null,
          meetingId,
          at: Date.now(),
        },
      });
    }
  });

  return policyId;
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
