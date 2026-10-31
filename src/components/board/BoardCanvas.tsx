import * as Haptics from 'expo-haptics';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type ScrollView as RNScrollView } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '../../lib/haptics';
import { uid } from '../../lib/ids';
import { inColumn, zonedColumns } from '../../lib/meetings';
import { newList } from '../../lib/templates';
import { LIST_GAP, LIST_WIDTH } from '../../lib/theme';
import type { Board, BoardColumn, BoardColumnKind, Card, CardLink, List, OpInput } from '../../shared/types';
import { dispatch, moveColumnWithinKind } from '../../store/actions';
import { AddListColumn } from './AddListColumn';
import { RecordCardPreview, RecordColumn, RecordColumnPreview } from './RecordColumn';
import { CardFace } from './CardFace';
import { Column, ColumnPreview } from './Column';
import { CARD_GAP, CARDS_PADDING_H, CARDS_PADDING_TOP, createGeometry, listGeometry, type BoardApi } from './boardApi';

interface DragState {
  cardId: string;
  fromListId: string;
  toListId: string;
  /** Target position among the target list's cards, not counting the dragged card. */
  toIndex: number;
  width: number;
  height: number;
  /** Where the card was when it was picked up, in canvas coordinates. */
  startX: number;
  startY: number;
  /** Where the finger grabbed the card, relative to the card. */
  grabX: number;
  grabY: number;
}

/** A meeting or a policy subject on its way to another column of the same kind. */
interface RecordDragState {
  kind: BoardColumnKind;
  itemId: string;
  fromColumnId: string;
  toColumnId: string;
  /**
   * Where it lands among the column's subjects, or -1 in a meetings column. Meetings are ordered by
   * the date they were held, so there is no slot to aim at there — the column itself is the target.
   */
  toIndex: number;
  width: number;
  height: number;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
}

interface ListDragState {
  listId: string;
  fromIndex: number;
  /** Target position among the other lists (lists are counted right to left). */
  toIndex: number;
  width: number;
  height: number;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
}

/** A meetings or policies column on its way to another place among the columns of its kind. */
interface ColumnDragState {
  columnId: string;
  kind: BoardColumnKind;
  /** Where it stood among the columns of its kind, and where it would land now, counting the others. */
  fromIndex: number;
  toIndex: number;
  width: number;
  height: number;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
}

const EDGE = 64; // distance from an edge where auto-scrolling starts
const MAX_SPEED = 18; // pixels per frame
const PADDING_H = 8;
const PADDING_V = 12;
const SLOT = LIST_WIDTH + LIST_GAP; // a list and the space next to it
const GLIDE = { duration: 160 };

export function BoardCanvas({
  board,
  onOpenCard,
  onOpenLink,
  onOpenButtons,
  onOpenTask,
  cardFilter = null,
  selection = null,
  onToggleSelect,
  onSelectList,
}: {
  board: Board;
  onOpenCard: (cardId: string) => void;
  onOpenLink: (link: CardLink) => void;
  onOpenButtons: (cardId: string) => void;
  /** Edits a task listed on a card, or (null) adds tasks to the card. */
  onOpenTask: (cardId: string, itemId: string | null) => void;
  /** Shows only the cards it lets through (the board's filters); cards cannot be moved meanwhile. */
  cardFilter?: ((card: Card) => boolean) | null;
  /** The selected cards while selecting, or null. Tapping a card then selects it instead of opening it. */
  selection?: ReadonlySet<string> | null;
  onToggleSelect: (cardId: string) => void;
  onSelectList: (listId: string, on: boolean) => void;
}) {
  const boardRef = useRef(board);
  const openCardRef = useRef(onOpenCard);
  const openLinkRef = useRef(onOpenLink);
  const openButtonsRef = useRef(onOpenButtons);
  const openTaskRef = useRef(onOpenTask);
  const toggleSelectRef = useRef(onToggleSelect);
  const selectListRef = useRef(onSelectList);
  useLayoutEffect(() => {
    boardRef.current = board;
    openCardRef.current = onOpenCard;
    openLinkRef.current = onOpenLink;
    openButtonsRef.current = onOpenButtons;
    openTaskRef.current = onOpenTask;
    toggleSelectRef.current = onToggleSelect;
    selectListRef.current = onSelectList;
  });

  const scrollRef = useRef<RNScrollView>(null);
  const geoRef = useRef(createGeometry());
  const pointerRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const listDragRef = useRef<ListDragState | null>(null);
  const recordDragRef = useRef<RecordDragState | null>(null);
  const columnDragRef = useRef<ColumnDragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [listDrag, setListDrag] = useState<ListDragState | null>(null);
  const [recordDrag, setRecordDrag] = useState<RecordDragState | null>(null);
  const [columnDrag, setColumnDrag] = useState<ColumnDragState | null>(null);
  const [height, setHeight] = useState(0);
  // The cards whose tasks are listed under them.
  const [openTasks, setOpenTasks] = useState<ReadonlySet<string>>(() => new Set());

  // One drag at a time: holds the dragged card's (or record's) id, "list:<id>" for a list, or
  // "column:<id>" for a meetings or policies column.
  const activeId = useSharedValue('');
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const lift = useSharedValue(0);

  // On the web the cards and titles leave touch-action to the browser, so a plain swipe scrolls the
  // board. The price: once a long press has lifted something, the browser still reads the next move
  // of the same finger as a scroll, starts one, cancels the pointer — and what was lifted drops out
  // of the finger. So from the moment a drag starts, the moves are the drag's. Before it, a swipe is
  // still a scroll; only a finger that held still long enough to lift something is kept.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const keep = (e: TouchEvent) => {
      if (activeId.value !== '' && e.cancelable) e.preventDefault();
    };
    // Not passive: a passive listener's preventDefault is ignored, and the browser would scroll.
    document.addEventListener('touchmove', keep, { passive: false });
    return () => document.removeEventListener('touchmove', keep);
  }, [activeId]);

  const api = useMemo<BoardApi>(() => {
    // Positions are worked out from the lists' order and the cards' heights instead of being read
    // from onLayout: on the web it only reports size changes, so moved views keep stale positions.

    // The horizontal scroll view is mirrored (scaleX: -1) so lists flow right-to-left.
    // This turns an x range inside the scroll content into its on-screen left edge.
    const leftOf = (x: number, width: number) => {
      const geo = geoRef.current;
      return geo.width - (x - geo.scrollX) - width;
    };
    /** On-screen left edge of the list at `index`. */
    const slotLeft = (index: number) => leftOf(PADDING_H + index * SLOT + LIST_GAP / 2, LIST_WIDTH);
    /** Index of the list slot under an on-screen x (can be out of range). */
    const slotAt = (x: number) => {
      const geo = geoRef.current;
      return Math.floor((geo.width - x + geo.scrollX - PADDING_H) / SLOT);
    };
    const listIndex = (listId: string) => boardRef.current.lists.findIndex((l) => l.id === listId);
    /** Top of the `index`-th card of a stack inside its scroll content, leaving out `skipId`. */
    const stackTop = (ids: readonly string[], index: number, skipId: string | null) => {
      let top = CARDS_PADDING_TOP;
      let n = 0;
      for (const id of ids) {
        if (n >= index) break;
        const r = geoRef.current.cards[id];
        if (id === skipId || !r) continue;
        top += r.height + CARD_GAP;
        n++;
      }
      return top;
    };
    const cardTop = (list: List, index: number, skipId: string | null) => stackTop(list.cardIds, index, skipId);

    // The record columns sit after the task lists in the same row, so they take the slots that
    // follow them and the slot arithmetic above needs nothing added for them. In the order they are
    // drawn — the meetings zone, then the policies zone — or every slot would point at a neighbour.
    const recordColumns = () => zonedColumns(boardRef.current.columns ?? []);
    const columnSlot = (columnId: string) => {
      const i = recordColumns().findIndex((c) => c.id === columnId);
      return i < 0 ? -1 : boardRef.current.lists.length + i;
    };
    const columnAt = (x: number) => recordColumns()[slotAt(x) - boardRef.current.lists.length];
    const recordItems = (column: BoardColumn) => {
      const b = boardRef.current;
      return column.kind === 'meetings'
        ? inColumn(b.meetings ?? [], column, b.columns ?? [])
        : inColumn(b.policyTopics ?? [], column, b.columns ?? []);
    };
    const recordIds = (column: BoardColumn) => recordItems(column).map((x) => x.id);
    /** The columns of one kind, in their order: a column moves among these and no others. */
    const kinOf = (kind: BoardColumnKind) => recordColumns().filter((c) => c.kind === kind);
    /** The slot a kind's zone starts at: after the task lists, and for policies after the meetings. */
    const zoneStart = (kind: BoardColumnKind) => {
      const zoned = recordColumns();
      const first = zoned.findIndex((c) => c.kind === kind);
      return boardRef.current.lists.length + (first < 0 ? zoned.length : first);
    };

    const setDragState = (next: DragState | null) => {
      dragRef.current = next;
      setDrag(next);
    };
    const setListDragState = (next: ListDragState | null) => {
      listDragRef.current = next;
      setListDrag(next);
    };
    const setRecordDragState = (next: RecordDragState | null) => {
      recordDragRef.current = next;
      setRecordDrag(next);
    };
    const setColumnDragState = (next: ColumnDragState | null) => {
      columnDragRef.current = next;
      setColumnDrag(next);
    };
    const anyDrag = () => !!(dragRef.current || listDragRef.current || recordDragRef.current || columnDragRef.current);

    // Card drag: finds the list under the finger and the slot the card would drop into.
    const updateCardTarget = () => {
      const d = dragRef.current;
      if (!d) return;
      const geo = geoRef.current;
      const pointer = pointerRef.current;
      const lists = boardRef.current.lists;
      const list = lists[slotAt(pointer.x)] ?? lists.find((l) => l.id === d.toListId);
      const lg = list && geo.lists[list.id];
      if (!list || !lg) return;
      // Count the cards whose middle is above the finger. Cards after the placeholder sit lower.
      const y = pointer.y - PADDING_V - lg.y + lg.scrollY;
      let toIndex = 0;
      let top = CARDS_PADDING_TOP;
      for (const id of list.cardIds) {
        const r = geo.cards[id];
        if (id === d.cardId || !r) continue;
        if (list.id === d.toListId && toIndex === d.toIndex) top += d.height + CARD_GAP;
        if (top + r.height / 2 >= y) break;
        top += r.height + CARD_GAP;
        toIndex++;
      }
      if (list.id !== d.toListId || toIndex !== d.toIndex) {
        if (list.id !== d.toListId) haptic(() => Haptics.selectionAsync());
        setDragState({ ...d, toListId: list.id, toIndex });
      }
    };

    // Record drag: finds the record column under the finger, and in a policies column the slot.
    const updateRecordTarget = () => {
      const d = recordDragRef.current;
      if (!d) return;
      const geo = geoRef.current;
      const pointer = pointerRef.current;
      const under = columnAt(pointer.x);
      // Only a column of its own kind takes it. Over a task list, the gap, or nothing at all, the
      // last target stands: a meeting dropped on a list of tasks has nowhere to be.
      const column = under?.kind === d.kind ? under : recordColumns().find((c) => c.id === d.toColumnId);
      const lg = column && geo.lists[column.id];
      if (!column || !lg) return;
      let toIndex = -1;
      if (d.kind === 'policies') {
        // Count the subjects whose middle is above the finger, as a list of cards does.
        const y = pointer.y - PADDING_V - lg.y + lg.scrollY;
        toIndex = 0;
        let top = CARDS_PADDING_TOP;
        for (const id of recordIds(column)) {
          const r = geo.cards[id];
          if (id === d.itemId || !r) continue;
          if (column.id === d.toColumnId && toIndex === d.toIndex) top += d.height + CARD_GAP;
          if (top + r.height / 2 >= y) break;
          top += r.height + CARD_GAP;
          toIndex++;
        }
      }
      if (column.id !== d.toColumnId || toIndex !== d.toIndex) {
        if (column.id !== d.toColumnId) haptic(() => Haptics.selectionAsync());
        setRecordDragState({ ...d, toColumnId: column.id, toIndex });
      }
    };

    // List drag: the list goes to the slot under the middle of the lifted list.
    const updateListTarget = () => {
      const d = listDragRef.current;
      if (!d) return;
      const middle = pointerRef.current.x - d.grabX + d.width / 2;
      const toIndex = Math.max(0, Math.min(boardRef.current.lists.length - 1, slotAt(middle)));
      if (toIndex !== d.toIndex) {
        haptic(() => Haptics.selectionAsync());
        setListDragState({ ...d, toIndex });
      }
    };

    // Column drag: the slot under the middle of the lifted column, held inside its kind's zone. Past
    // the zone's edge it stays at the edge: a meetings column has no place among the policies.
    const updateColumnTarget = () => {
      const d = columnDragRef.current;
      if (!d) return;
      const middle = pointerRef.current.x - d.grabX + d.width / 2;
      const last = kinOf(d.kind).length - 1;
      const toIndex = Math.max(0, Math.min(last, slotAt(middle) - zoneStart(d.kind)));
      if (toIndex !== d.toIndex) {
        haptic(() => Haptics.selectionAsync());
        setColumnDragState({ ...d, toIndex });
      }
    };

    const speed = (depth: number) => Math.ceil(MAX_SPEED * Math.min(1, Math.max(0, depth) / EDGE));

    // Runs every frame while dragging: scrolls the board or a list when the finger nears an edge.
    const tick = () => {
      frameRef.current = null;
      const card = dragRef.current;
      const list = listDragRef.current;
      const record = recordDragRef.current;
      const col = columnDragRef.current;
      if (!card && !list && !record && !col) return;
      const geo = geoRef.current;
      const pointer = pointerRef.current;
      let scrolled = false;

      // Mirrored board: a larger offset reveals the lists further to the left.
      let dx = 0;
      if (pointer.x < EDGE) dx = speed(EDGE - pointer.x);
      else if (pointer.x > geo.width - EDGE) dx = -speed(pointer.x - (geo.width - EDGE));
      if (dx !== 0) {
        const max = Math.max(0, geo.contentWidth - geo.width);
        const next = Math.max(0, Math.min(max, geo.scrollX + dx));
        if (next !== geo.scrollX) {
          geo.scrollX = next;
          scrollRef.current?.scrollTo({ x: next, animated: false });
          scrolled = true;
        }
      }

      const lg = card ? geo.lists[card.toListId] : record ? geo.lists[record.toColumnId] : undefined;
      if (lg && lg.height > 0) {
        const top = PADDING_V + lg.y;
        const bottom = top + lg.height;
        const zone = Math.min(EDGE, lg.height / 3);
        let dy = 0;
        if (pointer.y < top + zone) dy = -speed(((top + zone - pointer.y) / zone) * EDGE);
        else if (pointer.y > bottom - zone) dy = speed(((pointer.y - (bottom - zone)) / zone) * EDGE);
        if (dy !== 0) {
          const max = Math.max(0, lg.contentHeight - lg.height);
          const next = Math.max(0, Math.min(max, lg.scrollY + dy));
          if (next !== lg.scrollY) {
            lg.scrollY = next;
            lg.ref?.scrollTo({ y: next, animated: false });
            scrolled = true;
          }
        }
      }

      if (scrolled) {
        if (card) updateCardTarget();
        else if (record) updateRecordTarget();
        else if (col) updateColumnTarget();
        else updateListTarget();
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    const stopTicking = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };

    // Lifts the ghost at (startX, startY) and starts following the finger.
    const pickUp = (startX: number, startY: number, grabX: number, grabY: number) => {
      originX.set(startX);
      originY.set(startY);
      lift.set(withTiming(1, { duration: 150 }));
      pointerRef.current = { x: startX + grabX, y: startY + grabY };
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(tick);
    };

    // Glides the ghost from its start to (toX, toY), then runs `commit` once.
    const settle = (
      from: { startX: number; startY: number },
      to: { x: number; y: number } | null,
      commit: () => void,
    ) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        commit();
        activeId.set('');
      };
      lift.set(withTiming(0, GLIDE));
      if (to) {
        tx.set(withTiming(to.x - from.startX, GLIDE));
        ty.set(
          withTiming(to.y - from.startY, GLIDE, () => {
            'worklet';
            scheduleOnRN(finish);
          }),
        );
        // Animations pause while the app is in the background; never leave a drop uncommitted.
        setTimeout(finish, 400);
      } else {
        finish();
      }
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    };

    const startDrag = (cardId: string, listId: string, x: number, y: number) => {
      if (anyDrag()) return;
      const geo = geoRef.current;
      const index = listIndex(listId);
      const list = boardRef.current.lists[index];
      const lg = geo.lists[listId];
      const r = geo.cards[cardId];
      if (!list || !lg || !r) {
        activeId.set('');
        return;
      }
      const startX = slotLeft(index) + CARDS_PADDING_H;
      const startY = PADDING_V + lg.y + cardTop(list, list.cardIds.indexOf(cardId), null) - lg.scrollY;
      setDragState({
        cardId,
        fromListId: listId,
        toListId: listId,
        toIndex: list.cardIds.indexOf(cardId),
        width: r.width,
        height: r.height,
        startX,
        startY,
        grabX: x,
        grabY: y,
      });
      pickUp(startX, startY, x, y);
    };

    const moveDrag = (dx: number, dy: number) => {
      const d = dragRef.current;
      if (!d) return;
      pointerRef.current = {
        x: d.startX + d.grabX + dx,
        y: d.startY + d.grabY + dy,
      };
      updateCardTarget();
    };

    const endDrag = () => {
      stopTicking();
      const d = dragRef.current;
      if (!d) {
        if (!anyDrag()) activeId.set('');
        return;
      }
      dragRef.current = null;
      const lists = boardRef.current.lists;
      const from = lists.find((l) => l.id === d.fromListId);
      const moved = d.toListId !== d.fromListId || d.toIndex !== from?.cardIds.indexOf(d.cardId);
      const index = listIndex(d.toListId);
      const lg = geoRef.current.lists[d.toListId];
      const to =
        index >= 0 && lg
          ? {
              x: slotLeft(index) + CARDS_PADDING_H,
              y: PADDING_V + lg.y + cardTop(lists[index], d.toIndex, d.cardId) - lg.scrollY,
            }
          : null;
      settle(d, to, () => {
        setDrag(null);
        if (moved) {
          dispatch(boardRef.current.id, {
            type: 'card/move',
            cardId: d.cardId,
            toListId: d.toListId,
            toIndex: d.toIndex,
          });
        }
      });
    };

    const startRecordDrag = (
      kind: BoardColumnKind,
      itemId: string,
      columnId: string,
      x: number,
      y: number,
    ) => {
      if (anyDrag()) return;
      const geo = geoRef.current;
      const slot = columnSlot(columnId);
      const column = recordColumns().find((c) => c.id === columnId);
      const lg = geo.lists[columnId];
      const r = geo.cards[itemId];
      if (slot < 0 || !column || !lg || !r) {
        activeId.set('');
        return;
      }
      const ids = recordIds(column);
      const startX = slotLeft(slot) + CARDS_PADDING_H;
      const startY = PADDING_V + lg.y + stackTop(ids, ids.indexOf(itemId), null) - lg.scrollY;
      setRecordDragState({
        kind,
        itemId,
        fromColumnId: columnId,
        toColumnId: columnId,
        toIndex: kind === 'policies' ? ids.indexOf(itemId) : -1,
        width: r.width,
        height: r.height,
        startX,
        startY,
        grabX: x,
        grabY: y,
      });
      pickUp(startX, startY, x, y);
    };

    const moveRecordDrag = (dx: number, dy: number) => {
      const d = recordDragRef.current;
      if (!d) return;
      pointerRef.current = { x: d.startX + d.grabX + dx, y: d.startY + d.grabY + dy };
      updateRecordTarget();
    };

    /** The place a subject must take in the whole list of subjects to sit at `at` in its column. */
    const policyTopicIndex = (topicId: string, column: BoardColumn, at: number) => {
      // `topic/movePolicy` splices the subject out and back in, so this counts the list without it.
      const rest = (boardRef.current.policyTopics ?? []).filter((t) => t.id !== topicId);
      const here = inColumn(rest, column, recordColumns());
      if (here.length === 0) return null; // alone in the column: a position would say nothing
      const last = at >= here.length;
      const i = rest.findIndex((t) => t.id === (last ? here[here.length - 1] : here[at]).id);
      return last ? i + 1 : i;
    };

    const endRecordDrag = () => {
      stopTicking();
      const d = recordDragRef.current;
      if (!d) {
        if (!anyDrag()) activeId.set('');
        return;
      }
      recordDragRef.current = null;
      const boardId = boardRef.current.id;
      const column = recordColumns().find((c) => c.id === d.toColumnId);
      const slot = columnSlot(d.toColumnId);
      const lg = geoRef.current.lists[d.toColumnId];
      const ids = column ? recordIds(column) : [];
      // Where it will actually come to rest: the slot it was aimed at, or, in a meetings column,
      // the place its date gives it.
      let landing = d.toIndex;
      if (landing < 0) {
        const m = (boardRef.current.meetings ?? []).find((x) => x.id === d.itemId);
        const others = ids.filter((id) => id !== d.itemId);
        landing = m
          ? others.filter((id) => {
              const other = (boardRef.current.meetings ?? []).find((x) => x.id === id);
              return other !== undefined && other.date > m.date;
            }).length
          : 0;
      }
      const to =
        column && slot >= 0 && lg
          ? {
              x: slotLeft(slot) + CARDS_PADDING_H,
              y: PADDING_V + lg.y + stackTop(ids, landing, d.itemId) - lg.scrollY,
            }
          : null;
      settle(d, to, () => {
        setRecordDrag(null);
        if (!column) return;
        const changedColumn = d.toColumnId !== d.fromColumnId;
        if (d.kind === 'meetings') {
          // Inside a meetings column the date decides the order, so only its column can change.
          if (changedColumn) {
            dispatch(boardId, { type: 'meeting/update', meetingId: d.itemId, patch: { columnId: d.toColumnId } });
          }
          return;
        }
        if (changedColumn) {
          dispatch(boardId, { type: 'topic/updatePolicy', topicId: d.itemId, patch: { columnId: d.toColumnId } });
        }
        const at = policyTopicIndex(d.itemId, column, d.toIndex);
        if (at !== null) dispatch(boardId, { type: 'topic/movePolicy', topicId: d.itemId, toIndex: at });
      });
    };

    const startListDrag = (listId: string, x: number, y: number) => {
      if (anyDrag()) return;
      const geo = geoRef.current;
      const fromIndex = listIndex(listId);
      const c = geo.columns[listId];
      if (!c || fromIndex < 0) {
        activeId.set('');
        return;
      }
      // x / y are relative to the list's title; make them relative to the whole list.
      const grab = geo.grabAreas[listId] ?? { x: 0, y: 0 };
      const startX = slotLeft(fromIndex);
      setListDragState({
        listId,
        fromIndex,
        toIndex: fromIndex,
        width: LIST_WIDTH,
        height: c.height,
        startX,
        startY: PADDING_V,
        grabX: grab.x + x,
        grabY: grab.y + y,
      });
      pickUp(startX, PADDING_V, grab.x + x, grab.y + y);
    };

    const moveListDrag = (dx: number, dy: number) => {
      const d = listDragRef.current;
      if (!d) return;
      pointerRef.current = {
        x: d.startX + d.grabX + dx,
        y: d.startY + d.grabY + dy,
      };
      updateListTarget();
    };

    const endListDrag = () => {
      stopTicking();
      const d = listDragRef.current;
      if (!d) {
        if (!anyDrag()) activeId.set('');
        return;
      }
      listDragRef.current = null;
      settle(d, { x: slotLeft(d.toIndex), y: PADDING_V }, () => {
        setListDrag(null);
        if (d.toIndex !== d.fromIndex) {
          dispatch(boardRef.current.id, {
            type: 'list/move',
            listId: d.listId,
            toIndex: d.toIndex,
          });
        }
      });
    };

    const startColumnDrag = (columnId: string, x: number, y: number) => {
      if (anyDrag()) return;
      const geo = geoRef.current;
      const column = recordColumns().find((c) => c.id === columnId);
      const slot = columnSlot(columnId);
      const c = geo.columns[columnId];
      if (!column || slot < 0 || !c) {
        activeId.set('');
        return;
      }
      // x / y are relative to the column's title; make them relative to the whole column.
      const grab = geo.grabAreas[columnId] ?? { x: 0, y: 0 };
      const fromIndex = kinOf(column.kind).findIndex((k) => k.id === columnId);
      const startX = slotLeft(slot);
      setColumnDragState({
        columnId,
        kind: column.kind,
        fromIndex,
        toIndex: fromIndex,
        width: LIST_WIDTH,
        height: c.height,
        startX,
        startY: PADDING_V,
        grabX: grab.x + x,
        grabY: grab.y + y,
      });
      pickUp(startX, PADDING_V, grab.x + x, grab.y + y);
    };

    const moveColumnDrag = (dx: number, dy: number) => {
      const d = columnDragRef.current;
      if (!d) return;
      pointerRef.current = { x: d.startX + d.grabX + dx, y: d.startY + d.grabY + dy };
      updateColumnTarget();
    };

    const endColumnDrag = () => {
      stopTicking();
      const d = columnDragRef.current;
      if (!d) {
        if (!anyDrag()) activeId.set('');
        return;
      }
      columnDragRef.current = null;
      settle(d, { x: slotLeft(zoneStart(d.kind) + d.toIndex), y: PADDING_V }, () => {
        setColumnDrag(null);
        // Also files whatever would otherwise follow «the first column» to its new holder.
        if (d.toIndex !== d.fromIndex) moveColumnWithinKind(boardRef.current.id, d.columnId, d.toIndex);
      });
    };

    return {
      activeId,
      tx,
      ty,
      startDrag,
      moveDrag,
      endDrag,
      startRecordDrag,
      moveRecordDrag,
      endRecordDrag,
      startListDrag,
      moveListDrag,
      endListDrag,
      startColumnDrag,
      moveColumnDrag,
      endColumnDrag,
      openCard: (cardId) => openCardRef.current(cardId),
      openLink: (link) => openLinkRef.current(link),
      openButtons: (cardId) => openButtonsRef.current(cardId),
      toggleTasks: (cardId) =>
        setOpenTasks((open) => {
          const next = new Set(open);
          if (!next.delete(cardId)) next.add(cardId);
          return next;
        }),
      openTask: (cardId, itemId) => openTaskRef.current(cardId, itemId),
      toggleSelect: (cardId) => toggleSelectRef.current(cardId),
      selectList: (listId, on) => selectListRef.current(listId, on),
      dispatch: (op: OpInput) => dispatch(boardRef.current.id, op),
      reportColumn: (listId, layout) => {
        geoRef.current.columns[listId] = layout;
      },
      reportListViewport: (listId, y, h) => {
        const g = listGeometry(geoRef.current, listId);
        g.y = y;
        g.height = h;
      },
      reportListContent: (listId, h) => {
        listGeometry(geoRef.current, listId).contentHeight = h;
      },
      reportListScroll: (listId, y) => {
        // While dragging, auto-scroll owns the offsets; late scroll events would fight it.
        if (!dragRef.current) listGeometry(geoRef.current, listId).scrollY = y;
      },
      registerList: (listId, ref) => {
        listGeometry(geoRef.current, listId).ref = ref;
      },
      reportCard: (cardId, layout) => {
        geoRef.current.cards[cardId] = layout;
      },
      reportGrabArea: (listId, layout) => {
        geoRef.current.grabAreas[listId] = layout;
      },
    };
  }, [activeId, tx, ty, originX, originY, lift]);

  const ghostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: originX.value + tx.value },
      { translateY: originY.value + ty.value },
      { rotate: `${lift.value * -3}deg` },
      { scale: 1 + lift.value * 0.03 },
    ],
  }));

  const maxColumnHeight = Math.max(0, height - PADDING_V * 2);
  const dragCard = drag ? board.cards[drag.cardId] : undefined;
  const draggedList = listDrag ? board.lists.find((l) => l.id === listDrag.listId) : undefined;
  const draggedColumn = columnDrag ? (board.columns ?? []).find((c) => c.id === columnDrag.columnId) : undefined;
  const dragging = drag !== null || listDrag !== null || recordDrag !== null || columnDrag !== null;

  // The lists, with a gap where the list being dragged would land.
  const columns: ReactNode[] = [];
  const listPlaceholder = listDrag ? (
    <View key="list-placeholder" style={[styles.listPlaceholder, { height: listDrag.height }]} />
  ) : null;
  let visible = 0;
  board.lists.forEach((list, index) => {
    const isDragged = list.id === listDrag?.listId;
    if (!isDragged && listDrag && visible === listDrag.toIndex) columns.push(listPlaceholder);
    columns.push(
      <Column
        key={list.id}
        list={list}
        cards={board.cards}
        labels={board.labels}
        powerUps={board.powerUps}
        index={index}
        listCount={board.lists.length}
        maxHeight={maxColumnHeight}
        dragCardId={drag?.cardId ?? null}
        dragging={dragging}
        collapsed={isDragged}
        placeholderIndex={drag && drag.toListId === list.id ? drag.toIndex : -1}
        placeholderHeight={drag?.height ?? 0}
        cardFilter={cardFilter}
        selection={selection}
        hasButtons={(board.buttons ?? []).length > 0}
        openTasks={openTasks}
        api={api}
      />,
    );
    if (!isDragged) visible++;
  });
  if (listDrag && listDrag.toIndex >= visible) columns.push(listPlaceholder);

  // The meetings zone, then the policies zone, each with a gap where the column being dragged would
  // land. A column moves among its own kind only, so its gap never leaves its zone.
  const zoned = zonedColumns(board.columns ?? []);
  const zones: ReactNode[] = [];
  const columnPlaceholder = columnDrag ? (
    <View key="column-placeholder" style={[styles.listPlaceholder, { height: columnDrag.height }]} />
  ) : null;
  for (const kind of [...new Set(zoned.map((c) => c.kind))]) {
    const kin = zoned.filter((c) => c.kind === kind);
    const here = columnDrag?.kind === kind ? columnDrag : null;
    let shown = 0;
    kin.forEach((column, i) => {
      const isDragged = column.id === columnDrag?.columnId;
      if (here && !isDragged && shown === here.toIndex) zones.push(columnPlaceholder);
      zones.push(
        <RecordColumn
          key={column.id}
          board={board}
          column={column}
          index={i}
          count={kin.length}
          maxHeight={maxColumnHeight}
          api={api}
          dragging={dragging}
          collapsed={isDragged}
          dragItemId={recordDrag?.itemId ?? null}
          // A meetings column has no slot to show: it is the target as a whole, because the
          // date decides where the card lands in it.
          targeted={recordDrag?.toColumnId === column.id && recordDrag.toIndex < 0}
          placeholderIndex={recordDrag?.toColumnId === column.id ? recordDrag.toIndex : -1}
          placeholderHeight={recordDrag?.height ?? 0}
        />,
      );
      if (!isDragged) shown++;
    });
    if (here && here.toIndex >= shown) zones.push(columnPlaceholder);
  }

  return (
    <View
      style={styles.canvas}
      onLayout={(e) => {
        geoRef.current.width = e.nativeEvent.layout.width;
        geoRef.current.height = e.nativeEvent.layout.height;
        setHeight(e.nativeEvent.layout.height);
      }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        style={styles.mirrored}
        contentContainerStyle={styles.content}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!dragging}
        scrollEventThrottle={16}
        onScroll={(e) => {
          // While a drag auto-scrolls the board, its own scrollX is the live one: a scroll event
          // reports where the view has got to, which lags behind, and would drag the target back.
          if (!dragRef.current && !listDragRef.current && !recordDragRef.current && !columnDragRef.current) {
            geoRef.current.scrollX = e.nativeEvent.contentOffset.x;
          }
        }}
        onContentSizeChange={(w) => {
          geoRef.current.contentWidth = w;
        }}
        keyboardShouldPersistTaps="handled"
      >
        {columns}
        {/* After the task lists: the meetings in the middle of the board, the policies at its far end. */}
        {board.powerUps.meetings ? zones : null}
        <AddListColumn
          onAdd={(title) => api.dispatch({ type: 'list/add', list: newList(title) })}
          onAddColumn={
            board.powerUps.meetings
              ? (title: string, kind: BoardColumnKind) =>
                  api.dispatch({ type: 'column/add', column: { id: uid(), title, kind } })
              : undefined
          }
        />
      </ScrollView>

      {drag && dragCard ? (
        <View style={styles.overlay}>
          <Animated.View style={[styles.ghost, { width: drag.width }, ghostStyle]}>
            <CardFace
              card={dragCard}
              labels={board.labels}
              powerUps={board.powerUps}
              expanded={openTasks.has(dragCard.id)}
              lifted
            />
          </Animated.View>
        </View>
      ) : null}
      {recordDrag ? (
        <View style={styles.overlay}>
          <Animated.View style={[styles.ghost, { width: recordDrag.width }, ghostStyle]}>
            <RecordCardPreview board={board} kind={recordDrag.kind} itemId={recordDrag.itemId} />
          </Animated.View>
        </View>
      ) : null}
      {columnDrag && draggedColumn ? (
        <View style={styles.overlay}>
          <Animated.View style={[styles.ghost, { width: columnDrag.width }, ghostStyle]}>
            <RecordColumnPreview board={board} column={draggedColumn} maxHeight={columnDrag.height} />
          </Animated.View>
        </View>
      ) : null}
      {listDrag && draggedList ? (
        <View style={styles.overlay}>
          <Animated.View style={[styles.ghost, { width: listDrag.width }, ghostStyle]}>
            <ColumnPreview
              list={draggedList}
              cards={board.cards}
              labels={board.labels}
              powerUps={board.powerUps}
              openTasks={openTasks}
              maxHeight={listDrag.height}
            />
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, overflow: 'hidden' },
  // Mirroring the scroll view (and each column back) makes lists start on the right and
  // scroll naturally for Arabic, the same way React Native's `inverted` lists work.
  mirrored: { flex: 1, transform: [{ scaleX: -1 }] },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: PADDING_H,
    paddingVertical: PADDING_V,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  ghost: { position: 'absolute', left: 0, top: 0 },
  listPlaceholder: {
    width: LIST_WIDTH,
    marginHorizontal: LIST_GAP / 2,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
});
