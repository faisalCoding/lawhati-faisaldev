import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState, type Href } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { isCardDone } from '../shared/cards';
import { dispatch, initStore, waitForServer } from '../store/actions';
import { store } from '../store/store';
import { redrawWidgets } from '../widget/updates';
import { cardKey } from './plan';
import { claimResponse, clearSnooze, snoozeCard } from './prefs';
import {
  ACTION_DONE,
  ACTION_SNOOZE,
  notificationsSupported,
  readNotificationData,
  rescheduleNotifications,
} from './scheduler';

const SNOOZE_MS = 60 * 60 * 1000;

/** Whether the board a `/board/<id>/…` address points at is on this phone. */
async function boardIsHere(url: string): Promise<boolean> {
  await initStore();
  const id = /^\/board\/([^/]+)/.exec(url)?.[1];
  return !!id && !!store.get().boards[id];
}
const BACKGROUND_TASK = 'lawhati-notification-actions';

/** "تم": marks the card complete, for the whole team when the board is shared. */
async function markDone(boardId: string, cardId: string) {
  await initStore();
  const card = store.get().boards[boardId]?.board.cards[cardId];
  if (!card || isCardDone(card)) return;
  dispatch(boardId, { type: 'card/update', cardId, patch: { dueDone: true } });
  await store.flush();
  await redrawWidgets().catch(() => {});
  // When the app is closed, give the change a moment to reach the server; anything left is sent
  // the next time the app connects.
  await waitForServer(boardId, 4000);
  await store.flush();
}

/**
 * Acts on a tap on a notification or one of its buttons. Android can deliver the same tap twice
 * (to the background task and to the app), so each one is claimed first.
 */
async function handleResponse(response: Notifications.NotificationResponse, canNavigate: boolean) {
  const { request, date } = response.notification ?? {};
  const data = request ? readNotificationData(request.content) : null;
  if (!request || !data) return;
  if (!(await claimResponse(`${request.identifier}|${date}|${response.actionIdentifier}`))) return;

  if (response.actionIdentifier === ACTION_DONE || response.actionIdentifier === ACTION_SNOOZE) {
    if (data.kind !== 'reminder') return;
    await Notifications.dismissNotificationAsync(request.identifier).catch(() => {});
    const key = cardKey(data.boardId, data.cardId);
    if (response.actionIdentifier === ACTION_DONE) {
      await markDone(data.boardId, data.cardId);
      await clearSnooze(key);
    } else {
      await snoozeCard(key, Date.now() + SNOOZE_MS);
    }
    await initStore();
    await rescheduleNotifications();
  } else if (canNavigate) {
    // The card (or board) the notification is about; the digest for several boards opens the list of boards.
    if (data.url === '/') {
      if (router.canDismiss()) router.dismissAll();
    } else if (data.kind === 'team' && data.code && !(await boardIsHere(data.url))) {
      // Assigned a card on a board this phone has not joined yet: join it first.
      router.push({ pathname: '/join', params: { code: data.code } });
    } else {
      router.push(data.url as Href);
    }
  }
}

/** Opens what a tapped notification is about, and runs its buttons while the app is open. */
export function NotificationObserver() {
  // Navigating before the root navigator is ready would be lost.
  const ready = useRootNavigationState()?.key != null;
  useEffect(() => {
    if (!notificationsSupported || !ready) return;
    // The tap that launched the app.
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      Notifications.clearLastNotificationResponse();
      handleResponse(last, true);
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      handleResponse(r, true);
    });
    return () => sub.remove();
  }, [ready]);
  return null;
}

/**
 * Lets the reminder buttons work while the app is closed: Android runs this task for them. It has
 * to be defined as soon as the JS bundle loads, so index.ts calls this.
 */
export function registerNotificationTasks() {
  if (Platform.OS !== 'android') return;
  try {
    TaskManager.defineTask<Notifications.NotificationTaskPayload>(BACKGROUND_TASK, async ({ data, error }) => {
      if (error || !data || !('actionIdentifier' in data)) return;
      await handleResponse(data, false);
    });
    Notifications.registerTaskAsync(BACKGROUND_TASK).catch(() => {});
  } catch {
    // Without background tasks (Expo Go) the buttons still work while the app is running.
  }
}
