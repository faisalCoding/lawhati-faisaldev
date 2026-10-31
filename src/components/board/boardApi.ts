import type { LayoutRectangle, ScrollView } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type { BoardColumnKind, CardLink, OpInput } from '../../shared/types';

export const LONG_PRESS_MS = 250;

/** Card spacing inside a list. The drag logic adds up card heights with these, so styles must use them. */
export const CARD_GAP = 8;
export const CARDS_PADDING_H = 8;
export const CARDS_PADDING_TOP = 4;

export interface ListGeometry {
  /** Position of the card list's viewport inside its column. */
  y: number;
  height: number;
  contentHeight: number;
  scrollY: number;
  ref: ScrollView | null;
}

/**
 * Layout of everything on the board, kept outside React state (no re-renders).
 * Columns and cards report their sizes; the drag logic places them from the lists' order
 * and the current scroll offsets.
 */
export interface BoardGeometry {
  width: number;
  height: number;
  contentWidth: number;
  scrollX: number;
  /** Column frames inside the (mirrored) horizontal scroll content; only their heights are used. */
  columns: Record<string, LayoutRectangle>;
  lists: Record<string, ListGeometry>;
  /** Card frames inside their list's scroll content; only their sizes are used. */
  cards: Record<string, LayoutRectangle>;
  /** Where each list's draggable title area sits inside its column. */
  grabAreas: Record<string, LayoutRectangle>;
}

export function createGeometry(): BoardGeometry {
  return {
    width: 0,
    height: 0,
    contentWidth: 0,
    scrollX: 0,
    columns: {},
    lists: {},
    cards: {},
    grabAreas: {},
  };
}

export function listGeometry(geo: BoardGeometry, listId: string): ListGeometry {
  let g = geo.lists[listId];
  if (!g) {
    g = { y: 0, height: 0, contentHeight: 0, scrollY: 0, ref: null };
    geo.lists[listId] = g;
  }
  return g;
}

/** Stable handles that columns and cards use to talk to the board. */
export interface BoardApi {
  activeId: SharedValue<string>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  startDrag: (cardId: string, listId: string, x: number, y: number) => void;
  moveDrag: (tx: number, ty: number) => void;
  endDrag: () => void;
  /**
   * Picks up a meeting, or a policy subject, out of a record column. It can only be dropped in a
   * column of the same kind: a meeting is not a subject and neither is a task.
   */
  startRecordDrag: (kind: BoardColumnKind, itemId: string, columnId: string, x: number, y: number) => void;
  moveRecordDrag: (tx: number, ty: number) => void;
  endRecordDrag: () => void;
  /** Picks a whole list up by its title; x / y are where the finger is, relative to the title area. */
  startListDrag: (listId: string, x: number, y: number) => void;
  moveListDrag: (tx: number, ty: number) => void;
  endListDrag: () => void;
  /**
   * Picks a meetings or policies column up by its title. It moves among the columns of its own
   * kind and no further: each kind keeps its zone of the board.
   */
  startColumnDrag: (columnId: string, x: number, y: number) => void;
  moveColumnDrag: (tx: number, ty: number) => void;
  endColumnDrag: () => void;
  openCard: (cardId: string) => void;
  /** Opens the board a card is linked to (or joins it, on a phone that doesn't have it). */
  openLink: (link: CardLink) => void;
  /** Opens the board's card buttons, to press one on this card. */
  openButtons: (cardId: string) => void;
  /** Lists the card's tasks under it, or hides them. */
  toggleTasks: (cardId: string) => void;
  /** Edits one of the card's tasks, or (null) adds tasks to it. */
  openTask: (cardId: string, itemId: string | null) => void;
  /** While cards are being selected: selects the card, or unselects it. */
  toggleSelect: (cardId: string) => void;
  /** Selects (or unselects) the cards of a list that are shown, and starts selecting if needed. */
  selectList: (listId: string, on: boolean) => void;
  dispatch: (op: OpInput) => void;
  reportColumn: (listId: string, layout: LayoutRectangle) => void;
  reportListViewport: (listId: string, y: number, height: number) => void;
  reportListContent: (listId: string, height: number) => void;
  reportListScroll: (listId: string, y: number) => void;
  registerList: (listId: string, ref: ScrollView | null) => void;
  reportCard: (cardId: string, layout: LayoutRectangle) => void;
  reportGrabArea: (listId: string, layout: LayoutRectangle) => void;
}
