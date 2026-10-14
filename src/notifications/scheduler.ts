import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { canScheduleExactAlarms, openExactAlarmSettings } from '../../modules/exact-alarms';
import type { Board } from '../shared/types';
import { store } from '../store/store';
import { cardKey, openDueCards, planNotifications, type NotificationData } from './plan';
import {
  dropPastSnoozes,
  getNotificationState,
  loadNotificationState,
  markPermissionAsked,
  subscribeNotificationState,
} from './prefs';

// Due date reminders and the daily digest are local notifications: the phone schedules them itself,
// so they arrive without a server or a connection. The schedule is rebuilt from the boards whenever
// they (or the settings) change.

export const notificationsSupported = Platform.OS === 'android' || Platform.OS === 'ios';

export const REMINDER_CATEGORY = 'due-reminder';
export const ACTION_DONE = 'done';
export const ACTION_SNOOZE = 'snooze';

if (notificationsSupported) {
  // Show reminders even while the app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

let configuring: Promise<void> | null = null;

/**
 * Creates the Android channels (one per kind, so each can be muted in the phone's settings) and the
 * reminder buttons.
 */
function configure(): Promise<void> {
  configuring ??= (async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'تذكير المواعيد',
        description: 'تذكير بالبطاقات التي حان موعدها',
        importance: Notifications.AndroidImportance.HIGH,
      });
      await Notifications.setNotificationChannelAsync('digest', {
        name: 'خطة اليوم',
        description: 'إشعار واحد كل يوم بالبطاقات المستحقة والمتأخرة',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      // Sent by the sync server; the channel id is part of each push message.
      await Notifications.setNotificationChannelAsync('team', {
        name: 'نشاط الفريق',
        description: 'حين يعدّل أحد من فريقك بطاقة تتابعها',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    // Both buttons act without opening the app.
    await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
      { identifier: ACTION_DONE, buttonTitle: 'تم', options: { opensAppToForeground: false } },
      { identifier: ACTION_SNOOZE, buttonTitle: 'أجّل ساعة', options: { opensAppToForeground: false } },
    ]);
  })().catch((e) => {
    configuring = null;
    console.warn('Failed to set up notifications', e);
  });
  return configuring;
}

/** A notification's data. On Android it can arrive as a JSON string instead of an object. */
export function readNotificationData(content: object | undefined): NotificationData | null {
  const raw = content as { data?: unknown; dataString?: unknown } | undefined;
  let data = raw?.data;
  if ((!data || typeof data !== 'object' || !('kind' in data)) && typeof raw?.dataString === 'string') {
    try {
      data = JSON.parse(raw.dataString);
    } catch {
      return null;
    }
  }
  const d = data as Partial<Record<string, unknown>> | null | undefined;
  if (d?.kind === 'reminder' && typeof d.boardId === 'string' && typeof d.cardId === 'string') {
    return { kind: 'reminder', boardId: d.boardId, cardId: d.cardId, url: String(d.url ?? '/') };
  }
  if (d?.kind === 'team' && typeof d.url === 'string') {
    return typeof d.code === 'string' ? { kind: 'team', url: d.url, code: d.code } : { kind: 'team', url: d.url };
  }
  if (d?.kind === 'digest' && typeof d.url === 'string') return { kind: d.kind, url: d.url };
  return null;
}

/** Takes reminders of cards since done, moved to the done list or deleted out of the notification shade. */
async function dismissFinished(boards: Board[]) {
  const open = new Set(openDueCards(boards).map((c) => cardKey(c.board.id, c.card.id)));
  for (const shown of await Notifications.getPresentedNotificationsAsync()) {
    const data = readNotificationData(shown.request.content);
    if (data?.kind === 'reminder' && !open.has(cardKey(data.boardId, data.cardId))) {
      await Notifications.dismissNotificationAsync(shown.request.identifier);
    }
  }
}

let appliedPlan = '';
let queue: Promise<void> = Promise.resolve();

async function apply() {
  await loadNotificationState();
  // Before the boards are loaded the plan would be empty and cancel everything.
  if (!store.get().ready) return;
  const now = new Date();
  await dropPastSnoozes(now.getTime());
  const boards = Object.values(store.get().boards).map((e) => e.board);
  const { granted } = await Notifications.getPermissionsAsync();
  const { prefs, snoozes } = getNotificationState();
  const plan = granted ? planNotifications(boards, prefs, snoozes, now) : [];
  await dismissFinished(boards);

  // Alarms set without the exact-alarm permission stay inexact, so granting it also reschedules.
  const signature = JSON.stringify({ plan, exact: canScheduleExactAlarms() });
  if (signature === appliedPlan) return;
  await configure();
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const n of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: {
        title: n.title,
        body: n.body,
        data: n.data,
        ...(n.channel === 'reminders' ? { categoryIdentifier: REMINDER_CATEGORY } : null),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: n.channel },
    });
  }
  appliedPlan = signature;
}

/** Brings the scheduled notifications in line with the boards and settings. Runs one at a time. */
export function rescheduleNotifications(): Promise<void> {
  if (!notificationsSupported) return Promise.resolve();
  queue = queue.then(apply).catch((e) => console.warn('Failed to schedule notifications', e));
  return queue;
}

/**
 * Keeps the scheduled notifications in step with the app: after any change to the boards (made here
 * or by a teammate) or to the settings. Returns a function that stops watching.
 */
export function startNotificationUpdates(): () => void {
  if (!notificationsSupported) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const later = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      rescheduleNotifications();
    }, 1500);
  };

  let boards = store.get().boards;
  const stopStore = store.subscribe(() => {
    // Presence and connection updates change nothing that is due.
    if (store.get().boards === boards) return;
    boards = store.get().boards;
    later();
  });
  const stopPrefs = subscribeNotificationState(later);
  // A new day moves the digest along; snoozes that were shown can go.
  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'active') later();
  });
  configure();
  later();
  return () => {
    stopStore();
    stopPrefs();
    appState.remove();
    if (timer) clearTimeout(timer);
  };
}

export type PermissionState = 'granted' | 'undetermined' | 'denied' | 'unsupported';

function toPermissionState(p: Notifications.NotificationPermissionsStatus): PermissionState {
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function getNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported';
  return toPermissionState(await Notifications.getPermissionsAsync());
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported';
  // Android 13+ shows the permission prompt only once the app has a notification channel.
  await configure();
  const result = toPermissionState(await Notifications.requestPermissionsAsync());
  await markPermissionAsked();
  if (result === 'granted') await rescheduleNotifications();
  return result;
}

/**
 * Called when the user gives a card a due date: the moment reminders make sense, so the app asks for
 * permission then rather than at launch. It asks by itself only once; after that, from the settings.
 */
export async function offerReminders() {
  if (!notificationsSupported) return;
  await loadNotificationState();
  const { prefs, askedPermission } = getNotificationState();
  if (askedPermission || (prefs.reminders === 'off' && !prefs.digest)) return;
  if ((await getNotificationPermission()) === 'undetermined') await requestNotificationPermission();
}

/**
 * Whether reminders arrive at the exact minute (Android's "Alarms & reminders" permission, off by
 * default since Android 14; without it they can come up to an hour late). Null where it does not apply.
 */
export function useExactAlarms() {
  const [exact, setExact] = useState(canScheduleExactAlarms);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setExact(canScheduleExactAlarms());
    });
    return () => sub.remove();
  }, []);
  return { exact, openSettings: openExactAlarmSettings };
}

/** The notification permission, refreshed when the user comes back from the phone's settings. */
export function useNotificationPermission() {
  const [permission, setPermission] = useState<PermissionState | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      getNotificationPermission().then((p) => {
        if (alive) setPermission(p);
      });
    refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  const request = useCallback(async () => setPermission(await requestNotificationPermission()), []);
  return { permission, request };
}
