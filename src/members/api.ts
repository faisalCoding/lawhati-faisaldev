// This instance's identity API (faisaldev.site/api/lawhati): signs a device in with the account its
// owner already has on the site, names that account, and lists who cards may be assigned to.
//
// There is no separate code to copy any more. The site mints a token when the app sends the email
// and password its owner already knows, and that token is what every call below carries.
//
// Both doors are here: the account someone already has, and the one they make now without ever
// opening the site. They are the same account either way — the site's, under the site's rules.

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
   * `rejected`: the site would not make the account, and said why — in `message`, in its own
   * words, because only the site knows which rule was broken and how it reads in Arabic.
   */
  constructor(
    readonly reason: 'invalid' | 'credentials' | 'throttled' | 'offline' | 'rejected',
    message?: string,
  ) {
    super(message ?? reason);
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

async function post(path: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${PANEL_URL}/api/lawhati/${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new MemberError('offline');
  } finally {
    clearTimeout(timer);
  }
}

/** The token and the person, from whichever of the two doors they came through. */
async function admitted(res: Response): Promise<{ token: string; me: Member }> {
  const body = (await res.json()) as { token: string; data: ApiMember };
  return { token: body.token, me: toMember(body.data) };
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
  const res = await post('login', { email: email.trim(), password, device_name: deviceName });

  if (res.status === 422) throw new MemberError('credentials');
  if (res.status === 429) throw new MemberError('throttled');
  if (!res.ok) throw new MemberError('offline');

  return admitted(res);
}

/**
 * Makes the account on the site and signs this device in with it at once — the same account its
 * own sign-up form makes, under the same rules, so nobody has to leave the app to begin.
 *
 * A refusal carries the site's own sentence: the address is taken, the password is too short for
 * its policy, the confirmation does not match. Guessing at which it was, here, would get it wrong.
 */
export async function signUpWithPassword(
  name: string,
  email: string,
  password: string,
  confirmation: string,
  deviceName: string,
): Promise<{ token: string; me: Member }> {
  // The confirmation is sent as typed rather than compared here: the site owns what makes a
  // password acceptable, down to whether the two match, and it says so in one sentence.
  const res = await post('register', {
    name: name.trim(),
    email: email.trim(),
    password,
    password_confirmation: confirmation,
    device_name: deviceName,
  });

  if (res.status === 422) throw new MemberError('rejected', await firstComplaint(res));
  if (res.status === 429) throw new MemberError('throttled');
  if (!res.ok) throw new MemberError('offline');

  return admitted(res);
}

/** The first thing the site said was wrong, or nothing when it did not say. */
async function firstComplaint(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { errors?: Record<string, string[]> };
    return Object.values(body.errors ?? {}).flat()[0];
  } catch {
    return undefined;
  }
}

export async function fetchMe(code: string): Promise<Member> {
  return toMember((await call<{ data: ApiMember }>('me', code)).data);
}

export async function fetchTeam(code: string): Promise<Member[]> {
  return (await call<{ data: ApiMember[] }>('team', code)).data.map(toMember);
}
