import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';

import { useAppState } from '../store/store';
import { defaultServerUrl, syncClient } from '../store/sync';
import { ensureDeviceId, setPushToken, setWatching, subscribeNotificationState } from './prefs';
import { getNotificationPermission, notificationsSupported, requestNotificationPermission } from './scheduler';
import { subscribeToPush, webPushSupported } from './webPush';

// Team notifications come from the sync server itself, signed with its own keys, unlike reminders,
// which the device schedules. The browser gives the server its push subscription and the cards it
// watches; the server does the rest.
//
// On the web this reaches a closed browser, including an app installed to the home screen. A native
// build has no such channel without Google's, which this instance does not use — there, team news
// arrives over the sync socket while the app is open, and reminders are scheduled locally.

/** Whether team notifications can reach this device at all. */
type PushState = 'checking' | 'ready' | 'unavailable';

let pushState: PushState = 'checking';
const pushListeners = new Set<() => void>();

function setPushState(next: PushState) {
  pushState = next;
  pushListeners.forEach((l) => l());
}

export function usePushState(): PushState {
  return useSyncExternalStore(
    (listener) => {
      pushListeners.add(listener);
      return () => pushListeners.delete(listener);
    },
    () => pushState,
  );
}

/** Subscribes this browser to the server's notifications and tells the server about it. */
async function registerForTeamPush() {
  await ensureDeviceId();

  if (!webPushSupported) {
    // Native, or a browser without the Push API. Edits still arrive over the
    // sync socket while the app is open; nothing is lost silently.
    await setPushToken(null);
    setPushState('unavailable');
    syncClient.syncTeam();

    return;
  }

  const subscription = await subscribeToPush(defaultServerUrl());

  await setPushToken(subscription);
  setPushState(subscription ? 'ready' : 'unavailable');
  syncClient.syncTeam();
}

/** Keeps the sync server up to date with this phone's token, name, choice and watched cards. */
export function startTeamUpdates(): () => void {
  if (!notificationsSupported) return () => {};
  registerForTeamPush();

  // A browser can drop a subscription on its own — a cleared site, a vendor
  // rotating its endpoints — so it is re-checked whenever the app comes back.
  const recheck = () => {
    registerForTeamPush();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', recheck);
  }

  const stopState = subscribeNotificationState(() => syncClient.syncTeam());

  return () => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', recheck);
    }
    stopState();
  };
}

/**
 * While a screen of this board is showing, the server holds back notifications about it: the
 * changes are right there. Used by the board screen and the card screen above it.
 */
export function useBoardFocus(boardId: string | undefined) {
  const code = useAppState((s) => (boardId ? (s.boards[boardId]?.sync?.code ?? null) : null));
  useFocusEffect(
    useCallback(() => {
      if (!code) return;
      syncClient.setFocus(code);
      return () => syncClient.setFocus(null);
    }, [code]),
  );
}

/** Starts or stops watching a card. Starting is when notifications make sense, so it asks for them. */
export async function toggleWatching(boardId: string, cardId: string, on: boolean) {
  await setWatching(boardId, cardId, on);
  if (on && notificationsSupported && (await getNotificationPermission()) === 'undetermined') {
    await requestNotificationPermission();
  }
}
