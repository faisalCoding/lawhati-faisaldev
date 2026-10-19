// This instance's identity API (faisaldev.site/api/lawhati): signs a device in with the account its
// owner already has on the site, names that account, and lists who cards may be assigned to.
//
// There is no separate code to copy any more. The site mints a token when the app sends the email
// and password its owner already knows, and that token is what every call below carries.

const PANEL_URL = (process.env.EXPO_PUBLIC_PANEL_URL ?? 'https://faisaldev.site').replace(/\/+$/, '');
const TIMEOUT_MS = 10_000;

export interface Member {
  id: string;
  name: string;
  role: string | null;
  /** Employees who left stay listed, so cards assigned to them still show who they were. */
  active: boolean;
}

export class MemberError extends Error {
  /**
   * `invalid`: the token is wrong or was stopped. `credentials`: the email or password is wrong.
   * `throttled`: too many attempts, too fast. `offline`: the site could not be reached.
   */
  constructor(readonly reason: 'invalid' | 'credentials' | 'throttled' | 'offline') {
    super(reason);
  }
}

interface ApiMember {
  id: number;
  name: string;
  role: string | null;
  is_active: boolean;
}

const toMember = (m: ApiMember): Member => ({ id: String(m.id), name: m.name, role: m.role, active: m.is_active });

async function call<T>(path: string, code: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${PANEL_URL}/api/lawhati/${path}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${code}` },
      signal: controller.signal,
    });
  } catch {
    throw new MemberError('offline');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new MemberError('invalid');
  if (!res.ok) throw new MemberError('offline');
  return (await res.json()) as T;
}

/**
 * Signs in with the account the person has on the site, and returns the token to keep.
 *
 * `deviceName` names this device on the site: signing in again from the same one replaces its
 * token rather than leaving another live behind it.
 */
export async function signInWithPassword(
  email: string,
  password: string,
  deviceName: string,
): Promise<{ token: string; me: Member }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${PANEL_URL}/api/lawhati/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password, device_name: deviceName }),
      signal: controller.signal,
    });
  } catch {
    throw new MemberError('offline');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 422) throw new MemberError('credentials');
  if (res.status === 429) throw new MemberError('throttled');
  if (!res.ok) throw new MemberError('offline');

  const body = (await res.json()) as { token: string; data: ApiMember };
  return { token: body.token, me: toMember(body.data) };
}

export async function fetchMe(code: string): Promise<Member> {
  return toMember((await call<{ data: ApiMember }>('me', code)).data);
}

export async function fetchTeam(code: string): Promise<Member[]> {
  return (await call<{ data: ApiMember[] }>('team', code)).data.map(toMember);
}
