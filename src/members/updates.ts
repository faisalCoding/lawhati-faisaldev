import { AppState as RNAppState } from 'react-native';

import { ensureDeviceId } from '../notifications/prefs';
import { syncClient } from '../store/sync';
import { getMemberSession, loadMemberSession, refreshTeam, subscribeMemberSession } from './session';

/**
 * Keeps the team fresh while the app is used, and tells the sync server whose device this is
 * whenever someone signs in or out, so "assigned to you" notifications reach the right phone.
 */
export function startMemberUpdates(): () => void {
  let told: string | null | undefined;
  const tellServer = async () => {
    const { token } = getMemberSession();
    if (token === told) return;
    told = token;
    // The web version never registers for push, so it may not have a device id yet.
    if (token) await ensureDeviceId();
    syncClient.syncTeam();
  };

  loadMemberSession().then(() => {
    refreshTeam();
    tellServer();
  });
  const stop = subscribeMemberSession(() => {
    tellServer();
  });
  const sub = RNAppState.addEventListener('change', (next) => {
    if (next === 'active') refreshTeam();
  });
  return () => {
    stop();
    sub.remove();
  };
}
