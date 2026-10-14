import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import type { ClientMessage } from '../shared/types';
import { cardKey, DEFAULT_PREFS, type NotificationPrefs, type ReminderTiming, type Snoozes } from './plan';

// The user's notification choices, per device (reminders are personal, unlike a board's Power-Ups),
// plus the bookkeeping the scheduler needs between runs.

interface NotificationState {
  prefs: NotificationPrefs;
  snoozes: Snoozes;
  /** Whether the app already asked for permission by itself (it only does so once). */
  askedPermission: boolean;
  /** Notification taps already acted on; Android can deliver the same tap twice. */
  handled: string[];
  /** A random secret that identifies this phone to the sync server, for team notifications. */
  deviceId: string | null;
  /** The name teammates see in their notifications. */
  name: string;
  /** Cards this phone watches, as `boardId:cardId`. */
  watches: string[];
  /** The Expo push token, once push notifications are set up in the build. */
  pushToken: string | null;
}

const STORAGE_KEY = 'kanban-app/notifications/v1';
const TIMINGS: ReminderTiming[] = ['dueDay', 'dayBefore', 'off'];
const MAX_HANDLED = 50;

let state: NotificationState = {
  prefs: DEFAULT_PREFS,
  snoozes: {},
  askedPermission: false,
  handled: [],
  deviceId: null,
  name: '',
  watches: [],
  pushToken: null,
};
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function sanitizePrefs(value: Partial<NotificationPrefs> | undefined): NotificationPrefs {
  const hour = Number(value?.hour);
  return {
    reminders: TIMINGS.includes(value?.reminders as ReminderTiming)
      ? (value!.reminders as ReminderTiming)
      : DEFAULT_PREFS.reminders,
    digest: typeof value?.digest === 'boolean' ? value.digest : DEFAULT_PREFS.digest,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_PREFS.hour,
    team: typeof value?.team === 'boolean' ? value.team : DEFAULT_PREFS.team,
  };
}

export function loadNotificationState(): Promise<void> {
  loading ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return;
      const data = JSON.parse(raw);
      state = {
        prefs: sanitizePrefs(data.prefs),
        snoozes: data.snoozes && typeof data.snoozes === 'object' ? data.snoozes : {},
        askedPermission: data.askedPermission === true,
        handled: Array.isArray(data.handled) ? data.handled.slice(-MAX_HANDLED) : [],
        deviceId: typeof data.deviceId === 'string' ? data.deviceId : null,
        name: typeof data.name === 'string' ? data.name : '',
        watches: Array.isArray(data.watches) ? data.watches.filter((w: unknown) => typeof w === 'string') : [],
        pushToken: typeof data.pushToken === 'string' ? data.pushToken : null,
      };
      listeners.forEach((l) => l());
    })
    .catch((e) => console.warn('Failed to load notification settings', e));
  return loading;
}

function save(): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) =>
    console.warn('Failed to save notification settings', e),
  );
}

async function update(fn: (s: NotificationState) => NotificationState): Promise<void> {
  await loadNotificationState();
  state = fn(state);
  listeners.forEach((l) => l());
  await save();
}

export const getNotificationState = () => state;

export function subscribeNotificationState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNotificationPrefs(): NotificationPrefs {
  return useSyncExternalStore(subscribeNotificationState, () => state.prefs);
}

export function setNotificationPrefs(patch: Partial<NotificationPrefs>) {
  return update((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }));
}

export function markPermissionAsked() {
  return update((s) => ({ ...s, askedPermission: true }));
}

/** Reminds about a card again at `until`. */
export function snoozeCard(key: string, until: number) {
  return update((s) => ({ ...s, snoozes: { ...s.snoozes, [key]: until } }));
}

export function clearSnooze(key: string) {
  if (!(key in state.snoozes)) return Promise.resolve();
  return update((s) => {
    const { [key]: _removed, ...snoozes } = s.snoozes;
    return { ...s, snoozes };
  });
}

/** Forgets snoozes whose time has come (their reminder was already shown). */
export function dropPastSnoozes(now: number) {
  if (Object.values(state.snoozes).every((until) => until > now)) return Promise.resolve();
  return update((s) => ({
    ...s,
    snoozes: Object.fromEntries(Object.entries(s.snoozes).filter(([, until]) => until > now)),
  }));
}

/**
 * Records that a notification tap is being acted on. Resolves to false if it already was: Android
 * hands a button tap both to the background task and to the app, and replays taps made while the
 * app was closed the next time it opens.
 */
export async function claimResponse(key: string): Promise<boolean> {
  await loadNotificationState();
  if (state.handled.includes(key)) return false;
  // Checked and recorded without awaiting in between, so two callers cannot both win.
  state = { ...state, handled: [...state.handled, key].slice(-MAX_HANDLED) };
  await save();
  return true;
}

/** This phone's id for the sync server, created the first time it is needed. */
export async function ensureDeviceId(): Promise<string> {
  await loadNotificationState();
  if (!state.deviceId) {
    const deviceId = Crypto.randomUUID();
    await update((s) => (s.deviceId ? s : { ...s, deviceId }));
  }
  return state.deviceId!;
}

export function setPushToken(pushToken: string | null) {
  if (pushToken === state.pushToken) return Promise.resolve();
  return update((s) => ({ ...s, pushToken }));
}

/** The name teammates see, for changes made without signing in. */
export const getTeamName = () => state.name;

export function useTeamName(): string {
  return useSyncExternalStore(subscribeNotificationState, () => state.name);
}

export function setTeamName(name: string) {
  const clean = name.trim().slice(0, 40);
  if (clean === state.name) return Promise.resolve();
  return update((s) => ({ ...s, name: clean }));
}

export function useWatching(boardId: string, cardId: string): boolean {
  const key = cardKey(boardId, cardId);
  return useSyncExternalStore(subscribeNotificationState, () => state.watches.includes(key));
}

export function setWatching(boardId: string, cardId: string, on: boolean) {
  const key = cardKey(boardId, cardId);
  if (state.watches.includes(key) === on) return Promise.resolve();
  return update((s) => ({ ...s, watches: on ? [...s.watches, key] : s.watches.filter((w) => w !== key) }));
}

/** The cards watched on one board. */
export function watchedCardIds(boardId: string): string[] {
  const prefix = cardKey(boardId, '');
  return state.watches.filter((w) => w.startsWith(prefix)).map((w) => w.slice(prefix.length));
}

/** What this phone tells the sync server about itself; null until it has an id. */
export function teamHello(): Extract<ClientMessage, { t: 'hello' }> | null {
  if (!state.deviceId) return null;
  return { t: 'hello', device: state.deviceId, push: state.pushToken, name: state.name, team: state.prefs.team };
}
