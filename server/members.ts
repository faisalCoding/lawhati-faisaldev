// Which of the company's employees a phone belongs to. The app sends the employee's sign-in code
// (issued in the company panel); it is checked with the panel's API and never stored, only the
// answer is, for a few minutes.

import crypto from 'node:crypto';

const API = (process.env.LAWHATI_API ?? 'https://faisaldev.site/api/lawhati').replace(/\/+$/, '');
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 2000;
// Laravel Sanctum tokens: "<id>|<random>".
const CODE_PATTERN = /^[0-9]{1,20}\|[A-Za-z0-9_]{20,120}$/;

export interface MemberInfo {
  id: string;
  name: string;
}

const cache = new Map<string, { member: MemberInfo | null; until: number }>();
// Phones of the same employee often connect at once: they share one check.
const checking = new Map<string, Promise<MemberInfo | null | 'unreachable'>>();

function remember(key: string, member: MemberInfo | null) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { member, until: Date.now() + CACHE_MS });
}

/** The employee a code belongs to; null when it is not a valid code; `unreachable` when the panel did not answer. */
export async function verifyMember(code: string): Promise<MemberInfo | null | 'unreachable'> {
  if (!CODE_PATTERN.test(code)) return null;
  const key = crypto.createHash('sha256').update(code).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.member;
  let pending = checking.get(key);
  if (!pending) {
    pending = ask(code, key).finally(() => checking.delete(key));
    checking.set(key, pending);
  }
  return pending;
}

async function ask(code: string, key: string): Promise<MemberInfo | null | 'unreachable'> {
  try {
    const res = await fetch(`${API}/me`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${code}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) {
      remember(key, null);
      return null;
    }
    if (!res.ok) return 'unreachable';
    const { data } = (await res.json()) as { data: { id: number | string; name: string } };
    const member = { id: String(data.id), name: String(data.name).slice(0, 60) };
    remember(key, member);
    return member;
  } catch {
    return 'unreachable';
  }
}
