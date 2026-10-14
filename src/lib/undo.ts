import { useSyncExternalStore } from 'react';

// A short message at the bottom of the screen after a change to several cards, with «تراجع» (or
// «إعادة» after an undo).

export interface UndoOffer {
  id: number;
  message: string;
  undo: (() => void) | null;
  /** Whether the button undoes or redoes. */
  redo: boolean;
}

const SHOW_MS = 8000;
let offer: UndoOffer | null = null;
let lastId = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
/** How far above the bottom the message sits, so it clears the selection bar. */
let lift = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows `message`; with `undo`, it comes with a button that runs it (once), «إعادة» with `redo`. */
export function offerUndo(message: string, undo?: () => void, redo = false) {
  if (timer) clearTimeout(timer);
  offer = { id: ++lastId, message, undo: undo ?? null, redo };
  timer = setTimeout(dismissUndo, SHOW_MS);
  notify();
}

export function dismissUndo() {
  if (timer) clearTimeout(timer);
  timer = null;
  offer = null;
  notify();
}

export function takeUndo() {
  const run = offer?.undo;
  dismissUndo();
  run?.();
}

export function useUndoOffer(): UndoOffer | null {
  return useSyncExternalStore(subscribe, () => offer);
}

export function setUndoLift(value: number) {
  if (lift === value) return;
  lift = value;
  notify();
}

export function useUndoLift(): number {
  return useSyncExternalStore(subscribe, () => lift);
}
