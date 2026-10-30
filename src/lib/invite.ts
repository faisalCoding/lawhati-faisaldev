import { normalizeShareCode, SHARE_CODE_LENGTH } from './ids';

/**
 * Inviting someone to a board, by a link rather than a code to copy out and type back in.
 *
 * The code is still what the server knows a shared board by; it just stops being something a
 * person has to handle. The link carries it, and whoever opens it lands on the board.
 */

/**
 * Where this copy of the app answers, so an invitation can point back at it. The web build fills
 * it in from the address it is published at (scripts/build-web.mjs); a phone has no address of
 * its own to give out, so it names the published one.
 */
const APP_URL = (process.env.EXPO_PUBLIC_APP_URL ?? 'https://faisaldev.site/lawhati-app').replace(/\/+$/, '');

export function inviteLink(code: string): string {
  return `${APP_URL}/join?code=${code}`;
}

/**
 * The code inside whatever was pasted — a whole invitation link, or the bare code for anyone who
 * was sent one of those. Reading both costs one regex and spares a person the question.
 */
export function codeFromInvite(input: string): string {
  const inLink = /[?&]code=([A-Za-z0-9]+)/i.exec(input) ?? /\/join\/([A-Za-z0-9]+)/i.exec(input);
  return normalizeShareCode(inLink ? inLink[1] : input);
}

export function isCompleteCode(code: string): boolean {
  return code.length === SHARE_CODE_LENGTH;
}
