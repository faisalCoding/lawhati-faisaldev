import type { Board, Card, ChecklistItem, Label, List } from '../shared/types';

// A backup is a JSON file with every board on a device, made to be brought back on any device or
// browser. Shared boards keep their share code, so they come back shared with their team.

export interface BackupBoard {
  /** The share code the board syncs under, or null for a board kept on its device only. */
  code: string | null;
  board: Board;
}

export interface Backup {
  app: 'lawhati';
  kind: 'backup';
  version: 1;
  exportedAt: string;
  boards: BackupBoard[];
}

export function makeBackup(boards: BackupBoard[], now = new Date()): Backup {
  return { app: 'lawhati', kind: 'backup', version: 1, exportedAt: now.toISOString(), boards };
}

/** The name a backup is saved under, with the day it was made. */
export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `lawhati-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** The file is not a backup of this app. */
export class BackupError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const isNullableString = (v: unknown): v is string | null | undefined => v == null || isString(v);

const isItem = (v: unknown): v is ChecklistItem =>
  isObject(v) && isString(v.id) && isString(v.text) && typeof v.done === 'boolean';

const isCard = (v: unknown): v is Card =>
  isObject(v) &&
  isString(v.id) &&
  isString(v.title) &&
  isString(v.description) &&
  isStringArray(v.labelIds) &&
  isNullableString(v.due) &&
  isNullableString(v.cover) &&
  Array.isArray(v.checklist) &&
  v.checklist.every(isItem);

const isList = (v: unknown): v is List => isObject(v) && isString(v.id) && isString(v.title) && isStringArray(v.cardIds);

const isLabel = (v: unknown): v is Label => isObject(v) && isString(v.id) && isString(v.name) && isString(v.color);

/** Whether a board read from a file has everything the app relies on, so it cannot break a screen. */
function isBoard(v: unknown): v is Board {
  return (
    isObject(v) &&
    isString(v.id) &&
    isString(v.title) &&
    Array.isArray(v.lists) &&
    v.lists.every(isList) &&
    isObject(v.cards) &&
    Object.values(v.cards).every(isCard) &&
    Array.isArray(v.labels) &&
    v.labels.every(isLabel) &&
    isObject(v.powerUps)
  );
}

/**
 * The boards in a backup file. Throws a BackupError when the text is not a backup of this app;
 * a board that is damaged, or there twice, is left out and counted.
 */
export function readBackup(text: string): { boards: BackupBoard[]; damaged: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('not_json');
  }
  if (!isObject(data) || data.app !== 'lawhati' || data.kind !== 'backup' || !Array.isArray(data.boards)) {
    throw new BackupError('not_backup');
  }
  const boards: BackupBoard[] = [];
  const seen = new Set<string>();
  let damaged = 0;
  for (const entry of data.boards) {
    if (!isObject(entry) || !isBoard(entry.board) || !isNullableString(entry.code) || seen.has(entry.board.id)) {
      damaged++;
      continue;
    }
    seen.add(entry.board.id);
    boards.push({ code: entry.code || null, board: entry.board });
  }
  return { boards, damaged };
}
