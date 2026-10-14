// Push notifications sent by this server itself, with keys it owns.
//
// Web Push (RFC 8030) signed with a VAPID key pair: the payload is encrypted here, for the
// subscriber's key alone, and handed to whatever push endpoint the browser named. No Firebase
// project, no service account, no third party holding a copy — the browser vendor's endpoint
// forwards a sealed envelope it cannot read.
//
// Under systemd the keys come from the service's credentials (see deploy/lawhati-faisaldev.service);
// elsewhere VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY work. Missing keys are fine: no notifications.
//
// A note on reach, so it is not discovered later: this wakes a browser, including a web app the
// person installed to their home screen. A packaged Android build that is fully closed cannot be
// woken this way — that path belongs to Google Play Services, and this instance does not use it.

import fs from 'node:fs';
import path from 'node:path';

import webpush from 'web-push';

const CREDENTIAL_NAME = 'lawhati-faisaldev-vapid.json';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** Contact for the push service, should it need to warn about a misbehaving sender. */
  subject: string;
}

let keys: VapidKeys | null = null;

function fromCredentials(): string | null {
  const dir = process.env.CREDENTIALS_DIRECTORY;
  if (!dir) return null;
  const file = path.join(dir, CREDENTIAL_NAME);
  return fs.existsSync(file) ? file : null;
}

export function loadPushCredentials() {
  const fromEnv = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY;

  if (fromEnv) {
    keys = {
      publicKey: process.env.VAPID_PUBLIC_KEY!,
      privateKey: process.env.VAPID_PRIVATE_KEY!,
      subject: process.env.VAPID_SUBJECT ?? 'https://faisaldev.site',
    };
  } else {
    const file = process.env.VAPID_KEY_FILE ?? fromCredentials();
    if (!file) {
      console.log('Push notifications: no VAPID keys, so none are sent.');
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<VapidKeys>;
      if (!parsed.publicKey || !parsed.privateKey) throw new Error('publicKey and privateKey are required');
      keys = { publicKey: parsed.publicKey, privateKey: parsed.privateKey, subject: parsed.subject ?? 'https://faisaldev.site' };
    } catch (error) {
      console.error(`Push notifications: ${file} could not be read —`, error instanceof Error ? error.message : error);
      return;
    }
  }

  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  console.log('Push notifications: sending from this server, signed with its own VAPID key.');
}

export const pushEnabled = () => keys !== null;

/** The public half, which the app needs before a browser will subscribe. */
export const publicKey = () => keys?.publicKey ?? null;

export interface PushMessage {
  title: string;
  body: string;
  /** What the app needs when the notification is tapped. */
  data: Record<string, string>;
  /** Groups related notifications so a burst replaces itself rather than stacking. */
  channelId: string;
}

/**
 * Sends one notification to one subscriber. Resolves to 'gone' when the subscription is no longer
 * valid — the person cleared their site data, or uninstalled — so the caller can forget it.
 *
 * `subscription` is the PushSubscription the browser handed the app, stored as JSON.
 */
export async function sendPush(subscription: string, message: PushMessage): Promise<'sent' | 'gone'> {
  if (!keys) return 'gone';

  let parsed: webpush.PushSubscription;
  try {
    parsed = JSON.parse(subscription) as webpush.PushSubscription;
    if (!parsed.endpoint || !parsed.keys?.p256dh || !parsed.keys?.auth) throw new Error('incomplete subscription');
  } catch {
    return 'gone';
  }

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    data: message.data,
    tag: message.channelId,
  });

  try {
    await webpush.sendNotification(parsed, payload, { TTL: 60 * 60 * 24 });
    return 'sent';
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // 404/410: the subscription is dead and will never work again.
    if (status === 404 || status === 410) return 'gone';
    throw error;
  }
}
