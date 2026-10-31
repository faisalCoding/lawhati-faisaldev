// Subscribing a browser to this server's own push notifications.
//
// Web Push: the browser hands out a subscription — an endpoint belonging to its vendor, plus a key
// pair only this browser holds — and the sync server encrypts each notification for that key. The
// vendor forwards an envelope it cannot open. No Firebase project and no account anywhere but here.
//
// Native builds have no Service Worker and get nothing from this file; they are told about edits
// over the sync socket while the app is open, and schedule their own reminders.

import { Platform } from 'react-native';

const SUBSCRIBE_PATH = '/vapid';

/** The push endpoint sits beside the WebSocket, on http(s) rather than ws(s). */
function httpOrigin(syncUrl: string): string {
  return syncUrl.replace(/^ws/, 'http').replace(/\/+$/, '');
}

/**
 * base64url, as the browser's `applicationServerKey` wants it — over a plain ArrayBuffer, which is
 * what BufferSource means and what `Uint8Array.from` does not promise.
 */
function toKeyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));

  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }

  return bytes;
}

export const webPushSupported =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window;

/**
 * Subscribes this browser, and returns the subscription as the sync server stores it.
 * Returns null whenever push cannot work here — an older browser, a refused permission, or a
 * server with no keys set up — which the caller treats as "no team notifications", not an error.
 *
 * `ask` is whether this may show the browser's permission prompt. Only in answer to a tap: a prompt
 * nobody asked for is blocked outright by Safari and quietly muted by Chrome once it has been
 * ignored a few times. Without it, only a browser that already said yes is subscribed.
 */
export async function subscribeToPush(syncUrl: string, ask = false): Promise<string | null> {
  if (!webPushSupported) return null;

  try {
    const res = await fetch(`${httpOrigin(syncUrl)}${SUBSCRIBE_PATH}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;

    const { key } = (await res.json()) as { key?: string };
    if (!key) return null;

    if (Notification.permission !== 'granted') {
      if (!ask || (await Notification.requestPermission()) !== 'granted') return null;
    }

    const registration = await navigator.serviceWorker.ready;

    // An existing subscription is reused unless it was made for a different key.
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      const made = new Uint8Array(existing.options.applicationServerKey ?? new ArrayBuffer(0));
      const wanted = toKeyBytes(key);
      const same = made.length === wanted.length && made.every((b, i) => b === wanted[i]);
      if (same) return JSON.stringify(existing);
      await existing.unsubscribe();
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toKeyBytes(key),
    });

    return JSON.stringify(subscription);
  } catch (error) {
    console.warn('Push subscription failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Forgets this browser's subscription, so the server stops sending to it. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!webPushSupported) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await (await registration.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // Nothing to undo.
  }
}
