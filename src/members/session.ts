import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { Assignee } from '../shared/types';
import { fetchTeam, MemberError, signInWithPassword, type Member } from './api';

// Who is using the app, as one of the company's employees, and the team cards can be assigned to.
// An employee signs in on each device with the code the panel gives them. Signing in is optional:
// boards work without it, but assigning people needs the team list, which the code unlocks.

export interface MemberSession {
  /** The token the site minted for this device. Never shown to anyone. */
  token: string | null;
  me: Member | null;
  /** The team when last fetched; kept after signing out so assigned cards still show names. */
  team: Member[];
  teamAt: number;
  /** The code stopped working: a new one was issued, or it was stopped from the panel. */
  expired: boolean;
}

// v2: the stored field is a token, not the code a person used to copy in. Nothing is deployed
// from v1 here, so there is nothing to carry over.
const STORAGE_KEY = 'lawhati/members/v2';
const REFRESH_MS = 10 * 60 * 1000;

let session: MemberSession = { token: null, me: null, team: [], teamAt: 0, expired: false };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const isMember = (m: unknown): m is Member =>
  !!m && typeof m === 'object' && typeof (m as Member).id === 'string' && typeof (m as Member).name === 'string';

export function loadMemberSession(): Promise<void> {
  loading ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return;
      const data = JSON.parse(raw);
      session = {
        token: typeof data.token === 'string' ? data.token : null,
        me: isMember(data.me) ? data.me : null,
        team: Array.isArray(data.team) ? data.team.filter(isMember) : [],
        teamAt: Number(data.teamAt) || 0,
        expired: data.expired === true,
      };
      listeners.forEach((l) => l());
    })
    .catch((e) => console.warn('Failed to load the sign-in', e));
  return loading;
}

function update(next: MemberSession) {
  session = next;
  listeners.forEach((l) => l());
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session)).catch((e) =>
    console.warn('Failed to save the sign-in', e),
  );
}

export const getMemberSession = () => session;

export function subscribeMemberSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMemberSession(): MemberSession {
  return useSyncExternalStore(subscribeMemberSession, getMemberSession);
}

export function useMe(): Member | null {
  return useSyncExternalStore(subscribeMemberSession, () => session.me);
}

/**
 * Signs this device in with the account its owner has on the site. Throws a MemberError when it
 * cannot — `credentials` for a wrong email or password, `throttled` after too many tries.
 *
 * The token the site hands back is kept here and carried by every later call; nobody is asked to
 * see it, copy it, or know that it exists.
 */
export async function signIn(email: string, password: string, deviceName: string): Promise<Member> {
  await loadMemberSession();
  const { token, me } = await signInWithPassword(email, password, deviceName);
  await update({ ...session, token, me, expired: false });
  refreshTeam(true);
  return me;
}

export async function signOut() {
  await loadMemberSession();
  await update({ ...session, token: null, me: null, expired: false });
}

/** Fetches the team again when it is older than a few minutes (or `force`). */
export async function refreshTeam(force = false) {
  await loadMemberSession();
  const { token } = session;
  if (!token || (!force && Date.now() - session.teamAt < REFRESH_MS)) return;
  try {
    const team = await fetchTeam(token);
    if (session.token !== token) return;
    // The team carries the signed-in employee too, with any change to their name.
    const me = team.find((m) => m.id === session.me?.id) ?? session.me;
    await update({ ...session, team, teamAt: Date.now(), me });
  } catch (e) {
    if (e instanceof MemberError && e.reason === 'invalid' && session.token === token) {
      await update({ ...session, token: null, me: null, expired: true });
    }
    // Offline: keep what is known and try again later.
  }
}

/** What a card or task keeps about the person it is assigned to. */
export const asAssignee = (member: Member): Assignee => ({ id: member.id, name: member.name });

/** The newest name known for someone assigned earlier (names can change in the panel). */
export function useAssigneeName(assignee: Assignee): string {
  return useSyncExternalStore(
    subscribeMemberSession,
    () => session.team.find((m) => m.id === assignee.id)?.name ?? assignee.name,
  );
}
