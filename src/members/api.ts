// This instance's identity API (faisaldev.site/api/lawhati): the code a person is given when they
// names its employee and lists the team, so cards can be assigned to people. Codes are issued from
// the employees list in the panel.

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
  /** `invalid`: the code is wrong or was stopped. `offline`: the panel could not be reached. */
  constructor(readonly reason: 'invalid' | 'offline') {
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

export async function fetchMe(code: string): Promise<Member> {
  return toMember((await call<{ data: ApiMember }>('me', code)).data);
}

export async function fetchTeam(code: string): Promise<Member[]> {
  return (await call<{ data: ApiMember[] }>('team', code)).data.map(toMember);
}

/**
 * The code in what was pasted: the code itself, or the whole sign-in link the panel gives out
 * (…/lawhati/sign-in?code=…).
 */
export function readCode(input: string): string {
  const text = input.trim();
  const match = /[?&]code=([^&#\s]+)/.exec(text);
  if (!match) return text;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1];
  }
}
