import { Platform } from 'react-native';

/** The page at the web version's previous address that hands over what was saved there (public/migrate.html). */
const BRIDGE = process.env.EXPO_PUBLIC_WEB_PREVIOUS_BRIDGE;
const PREFIX = 'kanban-app/';
const STATE_KEY = 'kanban-app/state/v1';
const DONE_KEY = 'kanban-app/previous-address/v1';
const MAX_TRIES = 3;

/**
 * The web version moved to a new address, and browsers keep saved data per address. On the first
 * visits to the new one, this asks the previous address (in a hidden frame) for what this browser
 * saved there and adds it here: boards missing here are added, and nothing already here is replaced.
 * Nothing at the previous address is changed or deleted.
 */
export async function bringOverPreviousAddress(): Promise<void> {
  if (Platform.OS !== 'web' || !BRIDGE || typeof window === 'undefined') return;
  let storage: Storage;
  let bridge: URL;
  try {
    storage = window.localStorage;
    bridge = new URL(BRIDGE);
  } catch {
    return;
  }
  if (bridge.origin === window.location.origin) return;

  const done = readDone(storage);
  if (done.at || done.tries >= MAX_TRIES) return;
  const saved = await askBridge(bridge, 4000);
  if (!saved || !Object.keys(saved).some((key) => key.startsWith(PREFIX) && key !== DONE_KEY)) {
    // No answer (offline), or nothing handed over (never used there, or the browser kept the frame
    // from its storage): try again on the next visits, then stop asking.
    writeDone(storage, { at: null, tries: done.tries + 1 });
    return;
  }
  for (const [key, value] of Object.entries(saved)) {
    if (!key.startsWith(PREFIX) || key === DONE_KEY) continue;
    const here = storage.getItem(key);
    if (here === null) storage.setItem(key, value);
    else if (key === STATE_KEY) storage.setItem(key, mergeBoards(here, value));
  }
  writeDone(storage, { at: new Date().toISOString(), tries: done.tries + 1 });
}

function askBridge(bridge: URL, timeoutMs: number): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.setAttribute('aria-hidden', 'true');
    const finish = (saved: Record<string, string> | null) => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      frame.remove();
      resolve(saved);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== bridge.origin || e.source !== frame.contentWindow) return;
      const saved = e.data?.type === 'lawhati-previous-address' ? e.data.saved : null;
      if (!saved || typeof saved !== 'object') return;
      const strings: Record<string, string> = {};
      for (const [key, value] of Object.entries(saved)) if (typeof value === 'string') strings[key] = value;
      finish(strings);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    window.addEventListener('message', onMessage);
    frame.src = bridge.href;
    document.body.appendChild(frame);
  });
}

/** Adds the previous address's boards that are not here; a board that is in both keeps this copy. */
function mergeBoards(hereText: string, previousText: string): string {
  try {
    const here = JSON.parse(hereText);
    const previous = JSON.parse(previousText);
    const hereOrder: string[] = Array.isArray(here.order) ? here.order : [];
    const previousOrder: string[] = Array.isArray(previous.order) ? previous.order : [];
    return JSON.stringify({
      ...here,
      boards: { ...previous.boards, ...here.boards },
      order: [...hereOrder, ...previousOrder.filter((id) => !hereOrder.includes(id))],
    });
  } catch {
    return hereText;
  }
}

function readDone(storage: Storage): { at: string | null; tries: number } {
  try {
    const done = JSON.parse(storage.getItem(DONE_KEY) ?? 'null');
    return { at: done?.at ?? null, tries: Number(done?.tries) || 0 };
  } catch {
    return { at: null, tries: 0 };
  }
}

function writeDone(storage: Storage, done: { at: string | null; tries: number }) {
  storage.setItem(DONE_KEY, JSON.stringify(done));
}
