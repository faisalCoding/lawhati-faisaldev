export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// No 0/O or 1/I/L so codes are easy to read aloud and type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const SHARE_CODE_LENGTH = 6;

export function makeShareCode(): string {
  let code = '';
  for (let i = 0; i < SHARE_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeShareCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, SHARE_CODE_LENGTH);
}
