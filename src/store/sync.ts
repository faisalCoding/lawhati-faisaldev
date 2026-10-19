import Constants from 'expo-constants';
import { AppState as RNAppState, Platform } from 'react-native';

import { getMemberSession } from '../members/session';
import { teamHello, watchedCardIds } from '../notifications/prefs';
import { applyOp, applyOps } from '../shared/reducer';
import type { Board, ClientMessage, Op, ServerErrorReason, ServerMessage } from '../shared/types';
import { findBoardIdByCode, store, type AppState, type BoardEntry, type ConnectionStatus } from './store';

export const SYNC_PORT = 8787;

/**
 * A deployed server set in `.env` (EXPO_PUBLIC_SYNC_URL) wins. Otherwise, in development, the
 * sync server runs next to Metro, so reuse the dev machine's address.
 */
export function defaultServerUrl(): string {
  const deployed = process.env.EXPO_PUBLIC_SYNC_URL;
  if (deployed) return deployed;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return `ws://${window.location.hostname}:${SYNC_PORT}`;
  }
  const host = (Constants.expoConfig?.hostUri ?? '').split(':')[0];
  return `ws://${host || 'localhost'}:${SYNC_PORT}`;
}

export function currentServerUrl(s: AppState = store.get()): string {
  return s.serverUrl?.trim() || defaultServerUrl();
}

export type SyncErrorReason = ServerErrorReason | 'offline' | 'timeout';

export class SyncError extends Error {
  reason: SyncErrorReason;
  constructor(reason: SyncErrorReason) {
    super(reason);
    this.reason = reason;
  }
}

function setEntry(s: AppState, id: string, entry: BoardEntry): AppState {
  return { ...s, boards: { ...s.boards, [id]: entry } };
}

function setConnection(connection: ConnectionStatus) {
  store.set((s) => (s.connection === connection ? s : { ...s, connection }));
}

function applySnapshot(code: string, board: Board, version: number, seen: string[]) {
  store.set((s) => {
    const id = findBoardIdByCode(s, code) ?? board.id;
    const seenIds = new Set(seen);
    const pending = (s.boards[id]?.sync?.pending ?? []).filter((op) => !seenIds.has(op.id));
    const next = setEntry(s, id, {
      board: applyOps(board, pending),
      sync: { code, confirmed: board, pending, version },
    });
    return s.order.includes(id) ? next : { ...next, order: [id, ...s.order] };
  });
}

function applyRemoteOp(code: string, op: Op, version: number) {
  store.set((s) => {
    const id = findBoardIdByCode(s, code);
    const sync = id ? s.boards[id].sync : null;
    if (!id || !sync) return s;
    const confirmed = applyOp(sync.confirmed, op);
    const pending = sync.pending.filter((p) => p.id !== op.id);
    return setEntry(s, id, {
      board: pending.length ? applyOps(confirmed, pending) : confirmed,
      sync: { ...sync, confirmed, pending, version },
    });
  });
}

function ackOp(code: string, opId: string) {
  store.set((s) => {
    const id = findBoardIdByCode(s, code);
    const sync = id ? s.boards[id].sync : null;
    if (!id || !sync || !sync.pending.some((p) => p.id === opId)) return s;
    const pending = sync.pending.filter((p) => p.id !== opId);
    return setEntry(s, id, { board: applyOps(sync.confirmed, pending), sync: { ...sync, pending } });
  });
}

interface Waiter {
  resolve: (board: Board) => void;
  reject: (error: SyncError) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * One WebSocket to the sync server, shared by all boards.
 * Local operations are applied immediately and kept as "pending" until the server
 * echoes them back; the server's order is the source of truth, so every device converges.
 */
class SyncClient {
  private ws: WebSocket | null = null;
  private url = '';
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1000;
  private outbox: ClientMessage[] = [];
  private waiters = new Map<string, Waiter>();
  /** The shared board on screen, so the server holds back notifications about it meanwhile. */
  private focus: string | null = null;
  private appActive = RNAppState.currentState === 'active';
  /** What was last sent about this phone and its watched cards, on this connection. */
  private teamSent = '';

  constructor() {
    RNAppState.addEventListener('change', (next) => {
      const active = next === 'active';
      if (active === this.appActive) return;
      this.appActive = active;
      this.sendFocus();
    });
  }

  ensureConnected() {
    const url = currentServerUrl();
    if (this.ws && this.url === url && this.ws.readyState <= WebSocket.OPEN) return;
    this.open(url);
  }

  /** Reconnect from scratch, e.g. after the server address changed. */
  restart() {
    this.retryDelay = 1000;
    this.closeSocket();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.isNeeded()) this.ensureConnected();
    else setConnection('idle');
  }

  sendOp(code: string, op: Op) {
    // Not queued: every pending op is replayed after the next snapshot anyway.
    this.send({ t: 'op', code, op });
  }

  setFocus(code: string | null) {
    this.focus = code;
    this.sendFocus();
  }

  /**
   * Tells the server who this phone is and which cards it watches, for team notifications.
   * Sends nothing when that has not changed since the last time on this connection.
   */
  syncTeam() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const base = teamHello();
    if (!base) return;
    // The signed-in account's token lets the server tell whose phone this is, for "assigned to
    // you" notifications. Not to be confused with a board's share code, which `watch` carries.
    const hello = { ...base, member: getMemberSession().token };
    const watches: ClientMessage[] = Object.values(store.get().boards).flatMap((e) =>
      e.sync ? [{ t: 'watch' as const, code: e.sync.code, cardIds: watchedCardIds(e.board.id) }] : [],
    );
    const signature = JSON.stringify([hello, watches]);
    if (signature === this.teamSent) return;
    this.teamSent = signature;
    // The server needs to know the phone before its watches, and the board (joined) before either.
    this.send(hello);
    watches.forEach((m) => this.send(m));
  }

  private sendFocus() {
    // In the background nothing is on screen.
    this.send({ t: 'focus', code: this.appActive ? this.focus : null });
  }

  leave(code: string) {
    this.send({ t: 'leave', code });
    store.set((s) => {
      if (!(code in s.presence)) return s;
      const presence = { ...s.presence };
      delete presence[code];
      return { ...s, presence };
    });
  }

  publish(code: string, board: Board): Promise<Board> {
    return this.request({ t: 'publish', code, board });
  }

  join(code: string): Promise<Board> {
    return this.request({ t: 'join', code });
  }

  private request(msg: Extract<ClientMessage, { t: 'publish' | 'join' }>): Promise<Board> {
    return new Promise((resolve, reject) => {
      this.waiters.get(msg.code)?.reject(new SyncError('timeout'));
      const timer = setTimeout(() => {
        this.waiters.delete(msg.code);
        reject(new SyncError(this.ws?.readyState === WebSocket.OPEN ? 'timeout' : 'offline'));
      }, 8000);
      this.waiters.set(msg.code, { resolve, reject, timer });
      if (!this.send(msg)) this.outbox.push(msg);
      this.ensureConnected();
    });
  }

  private isNeeded() {
    return this.waiters.size > 0 || Object.values(store.get().boards).some((e) => e.sync);
  }

  private open(url: string) {
    this.closeSocket();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.url = url;
    setConnection('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.handleClose();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retryDelay = 1000;
      setConnection('online');
      for (const entry of Object.values(store.get().boards)) {
        if (entry.sync) this.send({ t: 'join', code: entry.sync.code });
      }
      this.teamSent = '';
      this.syncTeam();
      this.sendFocus();
      const queued = this.outbox;
      this.outbox = [];
      queued.forEach((m) => this.send(m));
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      try {
        this.handle(JSON.parse(String(event.data)) as ServerMessage);
      } catch (e) {
        console.warn('Bad sync message', e);
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.handleClose();
    };
    ws.onerror = () => {
      // onclose always follows; reconnecting happens there.
    };
  }

  private handleClose() {
    this.ws = null;
    this.outbox = [];
    store.set((s) => ({ ...s, connection: 'offline', presence: {} }));
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new SyncError('offline'));
    }
    this.waiters.clear();
    if (this.isNeeded()) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.ensureConnected();
      }, this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 10_000);
    }
  }

  private closeSocket() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try {
      ws.close();
    } catch {
      // Already closed.
    }
  }

  private send(msg: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private settle(code: string, result: { board: Board } | { error: SyncError }) {
    const waiter = this.waiters.get(code);
    if (!waiter) return false;
    clearTimeout(waiter.timer);
    this.waiters.delete(code);
    if ('board' in result) waiter.resolve(result.board);
    else waiter.reject(result.error);
    return true;
  }

  private handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'snapshot': {
        // Ignore snapshots for boards this device has stopped syncing.
        if (!this.waiters.has(msg.code) && !findBoardIdByCode(store.get(), msg.code)) return;
        applySnapshot(msg.code, msg.board, msg.version, msg.seen);
        this.settle(msg.code, { board: msg.board });
        // Replay local changes the server has not seen yet (made offline, or in flight).
        const id = findBoardIdByCode(store.get(), msg.code);
        const pending = id ? (store.get().boards[id].sync?.pending ?? []) : [];
        pending.forEach((op) => this.send({ t: 'op', code: msg.code, op }));
        break;
      }
      case 'op':
        applyRemoteOp(msg.code, msg.op, msg.version);
        break;
      case 'ack':
        ackOp(msg.code, msg.opId);
        break;
      case 'presence':
        store.set((s) => ({ ...s, presence: { ...s.presence, [msg.code]: msg.count } }));
        break;
      case 'error': {
        if (this.settle(msg.code, { error: new SyncError(msg.reason) })) break;
        if (msg.reason === 'not_found') {
          // The server lost this board (for example it restarted without its data file):
          // publish the last confirmed copy again, then pending ops are replayed on the snapshot.
          const s = store.get();
          const id = findBoardIdByCode(s, msg.code);
          const sync = id ? s.boards[id].sync : null;
          if (sync) this.send({ t: 'publish', code: msg.code, board: sync.confirmed });
        }
        break;
      }
    }
  }
}

export const syncClient = new SyncClient();
