import fs from 'node:fs';

/**
 * Reads one of the JSON files the server keeps its data in. Missing means nothing was saved yet.
 * Anything else (unreadable, cut short, not JSON) stops the server: starting empty would overwrite
 * the file with the next save, so it is left exactly as it is.
 */
export function readStored<T>(file: string): T | null {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return refuse(file, e);
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    return refuse(file, e);
  }
}

function refuse(file: string, error: unknown): never {
  console.error(`Cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Stopping so the file is not overwritten. Restore it from /var/backups/lawhati-faisaldev and start again.');
  process.exit(1);
}
