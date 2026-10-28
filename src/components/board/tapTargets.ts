import type { ViewRef } from './CardFace';

/** A part of a card a tap can land on, within `slop` pixels of it. */
export interface TapTarget {
  ref: ViewRef | null;
  slop: number;
  run: () => void;
}

/**
 * Runs the first of `targets` that (x, y), relative to `root`, lands on, or else `otherwise`.
 *
 * A card is one button, and the controls drawn on it are plain views measured at the moment of the
 * tap. Making each of them a button of its own would nest a button inside a button, which is not
 * HTML the web build can render, and the controls move with the card's content anyway.
 */
export function runTapTarget(
  targets: TapTarget[],
  root: ViewRef | null,
  x: number,
  y: number,
  otherwise: () => void,
) {
  const live = targets.filter((t): t is TapTarget & { ref: ViewRef } => t.ref !== null);
  if (!root || live.length === 0) return otherwise();
  const hit = live.map(() => false);
  let pending = live.length;
  const settle = () => {
    if (--pending > 0) return;
    const i = hit.indexOf(true);
    if (i >= 0) live[i].run();
    else otherwise();
  };
  live.forEach((t, i) =>
    t.ref.measureLayout(
      root,
      (left, top, width, height) => {
        hit[i] = x >= left - t.slop && x <= left + width + t.slop && y >= top - t.slop && y <= top + height + t.slop;
        settle();
      },
      settle,
    ),
  );
}
