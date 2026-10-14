import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState as RNAppState } from 'react-native';

import type { Board, Op } from '../shared/types';

export interface SyncMeta {
  code: string;
  /** Latest state confirmed by the server. */
  confirmed: Board;
  /** Local operations the server has not acknowledged yet. */
  pending: Op[];
  version: number;
}

export interface BoardEntry {
  /** What the user sees: `confirmed` plus pending operations (or the whole board if not shared). */
  board: Board;
  sync: SyncMeta | null;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'offline';

export interface AppState {
  boards: Record<string, BoardEntry>;
  order: string[];
  serverUrl: string | null;
  // Runtime only, never persisted.
  ready: boolean;
  connection: ConnectionStatus;
  presence: Record<string, number>;
}

const STORAGE_KEY = 'kanban-app/state/v1';

let state: AppState = {
  boards: {},
  order: [],
  serverUrl: null,
  ready: false,
  connection: 'idle',
  presence: {},
};

const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * A shared board with nothing waiting for the server is its confirmed copy. That copy is saved
 * without the activity, which can be large, and `unpack` makes the two one again. Versions of the
 * app from before the activity still read it as they always did.
 */
function pack(boards: Record<string, BoardEntry>): Record<string, BoardEntry> {
  const out: Record<string, BoardEntry> = {};
  for (const [id, entry] of Object.entries(boards)) {
    const { sync, board } = entry;
    out[id] =
      sync && sync.confirmed === board && board.activity
        ? { board, sync: { ...sync, confirmed: { ...board, activity: undefined } } }
        : entry;
  }
  return out;
}

function unpack(boards: Record<string, BoardEntry>): Record<string, BoardEntry> {
  for (const entry of Object.values(boards)) {
    const sync = entry?.sync;
    if (!sync) continue;
    // Saved without its activity, or missing: the board itself, which the next snapshot replaces anyway.
    const stripped = sync.pending?.length === 0 && entry.board?.activity && !sync.confirmed?.activity;
    if (!sync.confirmed || stripped) sync.confirmed = entry.board;
  }
  return boards;
}

function persist(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const { boards, order, serverUrl } = state;
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ boards: pack(boards), order, serverUrl })).catch((e) =>
    console.warn('Failed to save boards', e),
  );
}

export const store = {
  get: () => state,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  set(updater: (s: AppState) => AppState) {
    const prev = state;
    const next = updater(prev);
    if (next === prev) return;
    state = next;
    listeners.forEach((l) => l());
    const persistedChanged =
      next.boards !== prev.boards || next.order !== prev.order || next.serverUrl !== prev.serverUrl;
    if (persistedChanged && next.ready) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 300);
    }
  },

  async load(): Promise<Pick<AppState, 'boards' | 'order' | 'serverUrl'> | null> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return {
        boards: unpack(data.boards ?? {}),
        order: Array.isArray(data.order) ? data.order : [],
        serverUrl: typeof data.serverUrl === 'string' ? data.serverUrl : null,
      };
    } catch (e) {
      console.warn('Failed to load boards', e);
      return null;
    }
  },

  /** Writes pending changes now; resolves once they are on disk. */
  flush(): Promise<void> {
    return saveTimer ? persist() : Promise.resolve();
  },
};

// Save right away when the app goes to the background, so nothing is lost if it is killed.
RNAppState.addEventListener('change', (next) => {
  if (next !== 'active') store.flush();
});

/** Subscribe to a slice of the state. The selector must return stored references, not new objects. */
export function useAppState<T>(selector: (s: AppState) => T): T {
  const get = () => selector(store.get());
  return useSyncExternalStore(store.subscribe, get, get);
}

export function useBoard(id: string | undefined): Board | undefined {
  return useAppState((s) => (id ? s.boards[id]?.board : undefined));
}

export function useBoardEntry(id: string | undefined): BoardEntry | undefined {
  return useAppState((s) => (id ? s.boards[id] : undefined));
}

export function findBoardIdByCode(s: AppState, code: string): string | undefined {
  return Object.keys(s.boards).find((id) => s.boards[id].sync?.code === code);
}
