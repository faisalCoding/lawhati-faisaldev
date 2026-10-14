import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { backupFileName, makeBackup, readBackup, type BackupBoard } from '../lib/backup';
import { joinBoard } from './actions';
import { store, type BoardEntry } from './store';
import { SyncError } from './sync';

/** Every board on this device, in the order they are listed. */
function backupBoards(): BackupBoard[] {
  const { boards, order } = store.get();
  const ids = [...order.filter((id) => boards[id]), ...Object.keys(boards).filter((id) => !order.includes(id))];
  return ids.map((id) => ({ code: boards[id].sync?.code ?? null, board: boards[id].board }));
}

/**
 * Saves a backup of every board: on the web it downloads, on a phone it opens the share sheet, to
 * keep it in Drive, send it on WhatsApp… Returns how many boards it holds.
 */
export async function saveBackup(): Promise<number> {
  const boards = backupBoards();
  const text = JSON.stringify(makeBackup(boards));
  const name = backupFileName();
  if (Platform.OS === 'web') {
    const doc = globalThis.document;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = doc.createElement('a');
    link.href = url;
    link.download = name;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } else {
    const file = new File(Paths.cache, name);
    file.create({ overwrite: true });
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: name, UTI: 'public.json' });
  }
  return boards.length;
}

/** Lets the person pick a backup file and returns its text, or null when they cancel. */
export function pickBackupFile(): Promise<string | null> {
  if (Platform.OS !== 'web') {
    return File.pickFileAsync({ mimeTypes: '*/*' }).then((picked) => (picked.canceled ? null : picked.result.text()));
  }
  return new Promise((resolve) => {
    const input = globalThis.document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) file.text().then(resolve, () => resolve(null));
      else resolve(null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export interface RestoreResult {
  /** Boards added: kept on this device, or shared again with their team. */
  added: number;
  /** Shared boards the sync server no longer has, added as copies on this device. */
  copies: number;
  /** Boards this device already has, left as they are. */
  existing: number;
  /** Shared boards not restored: the sync server could not be reached. */
  unreachable: number;
  /** Boards in the file too damaged to restore. */
  damaged: number;
}

/**
 * Adds the boards in a backup file's text that this device does not have, first in the list. Boards
 * already here stay as they are. A shared board is joined again, so it comes back as its team has it
 * now. Throws a BackupError when the text is not a backup.
 */
export async function restoreBackup(text: string): Promise<RestoreResult> {
  const { boards: items, damaged } = readBackup(text);

  const s = store.get();
  const codes = new Set(Object.values(s.boards).flatMap((e) => (e.sync ? [e.sync.code] : [])));
  const missing = items.filter((it) => !s.boards[it.board.id] && !(it.code && codes.has(it.code)));
  const result: RestoreResult = { added: 0, copies: 0, existing: items.length - missing.length, unreachable: 0, damaged };

  const shared = missing.filter((it) => it.code);
  const joined = await Promise.allSettled(shared.map((it) => joinBoard(it.code!)));
  const restored = new Map<BackupBoard, string>();
  const local: Record<string, BoardEntry> = {};
  shared.forEach((it, i) => {
    const outcome = joined[i];
    if (outcome.status === 'fulfilled') {
      restored.set(it, outcome.value);
      result.added++;
    } else if (outcome.reason instanceof SyncError && outcome.reason.reason === 'not_found') {
      // Not published again: the file may come from another server, or a test one.
      local[it.board.id] = { board: { ...it.board, shareCode: null }, sync: null };
      restored.set(it, it.board.id);
      result.copies++;
    } else {
      result.unreachable++;
    }
  });
  for (const it of missing) {
    if (it.code) continue;
    local[it.board.id] = { board: { ...it.board, shareCode: null }, sync: null };
    restored.set(it, it.board.id);
    result.added++;
  }

  // The restored boards go first, in the backup's order.
  const first = missing.flatMap((it) => (restored.has(it) ? [restored.get(it)!] : []));
  store.set((st) => {
    const boards = { ...st.boards };
    for (const [id, entry] of Object.entries(local)) boards[id] ??= entry;
    const ids = first.filter((id) => boards[id]);
    return { ...st, boards, order: [...ids, ...st.order.filter((id) => !ids.includes(id))] };
  });
  return result;
}
