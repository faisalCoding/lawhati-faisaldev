import AsyncStorage from '@react-native-async-storage/async-storage';

import { uid } from '../lib/ids';
import { getTeamName, loadNotificationState } from '../notifications/prefs';
import type { Actor } from '../shared/types';
import { getMemberSession, loadMemberSession, useMe } from './session';

// Who makes the changes on this device, for the board's activity. An employee signed in with their
// code is themselves on every device. Anyone else is this device, under a random id made up here
// (not the device's secret id for the sync server) and the name they gave for team notifications.

const STORAGE_KEY = 'kanban-app/author/v1';
let guestId: string | null = null;
let loading: Promise<void> | null = null;

function makeGuestId(): string {
  guestId = uid();
  AsyncStorage.setItem(STORAGE_KEY, guestId).catch((e) => console.warn('Failed to save the author id', e));
  return guestId;
}

/** Reads what `currentActor` needs, so the first change is already signed with the right name. */
export function loadActor(): Promise<void> {
  loading ??= Promise.all([
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        guestId ??= saved;
      })
      .catch(() => {}),
    loadMemberSession(),
    loadNotificationState(),
  ]).then(() => {
    if (!guestId) makeGuestId();
  });
  return loading;
}

export function currentActor(): Actor {
  const { me } = getMemberSession();
  if (me) return { id: me.id, name: me.name };
  return { id: `g:${guestId ?? makeGuestId()}`, name: getTeamName() };
}

/** The id `currentActor` gives, following signing in and out. */
export function useActorId(): string {
  const me = useMe();
  return me ? me.id : `g:${guestId ?? makeGuestId()}`;
}
