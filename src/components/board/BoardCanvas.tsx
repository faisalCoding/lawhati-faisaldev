import * as Haptics from 'expo-haptics';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type ScrollView as RNScrollView } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '../../lib/haptics';
import { newList } from '../../lib/templates';
import { LIST_GAP, LIST_WIDTH } from '../../lib/theme';
import type { Board, Card, CardLink, List, OpInput } from '../../shared/types';
import { dispatch } from '../../store/actions';
import { AddListColumn } from './AddListColumn';
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
  const [drag, setDrag] = useState<DragState | null>(null);
  const [listDrag, setListDrag] = useState<ListDragState | null>(null);
  const [height, setHeight] = useState(0);
  // The cards whose tasks are listed under them.
  const [openTasks, setOpenTasks] = useState<ReadonlySet<string>>(() => new Set());

  // One drag at a time: holds the dragged card's id, or "list:<id>" for a list.
  const activeId = useSharedValue('');
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const lift = useSharedValue(0);

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
    /** Top of the `index`-th card of a list inside its scroll content, leaving out `skipId`. */
    const cardTop = (list: List, index: number, skipId: string | null) => {
      let top = CARDS_PADDING_TOP;
      let n = 0;
      for (const id of list.cardIds) {
        if (n >= index) break;
        const r = geoRef.current.cards[id];
        if (id === skipId || !r) continue;
        top += r.height + CARD_GAP;
        n++;
      }
      return top;
    };

    const setDragState = (next: DragState | null) => {
      dragRef.current = next;
      setDrag(next);
    };
    const setListDragState = (next: ListDragState | null) => {
      listDragRef.current = next;
      setListDrag(next);
    };

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

    const speed = (depth: number) => Math.ceil(MAX_SPEED * Math.min(1, Math.max(0, depth) / EDGE));

    // Runs every frame while dragging: scrolls the board or a list when the finger nears an edge.
    const tick = () => {
      frameRef.current = null;
      const card = dragRef.current;
      const list = listDragRef.current;
      if (!card && !list) return;
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

      const lg = card ? geo.lists[card.toListId] : undefined;
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
      if (dragRef.current || listDragRef.current) return;
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
        if (!listDragRef.current) activeId.set('');
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

    const startListDrag = (listId: string, x: number, y: number) => {
      if (dragRef.current || listDragRef.current) return;
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
        if (!dragRef.current) activeId.set('');
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

    return {
      activeId,
      tx,
      ty,
      startDrag,
      moveDrag,
      endDrag,
      startListDrag,
      moveListDrag,
      endListDrag,
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
  const dragging = drag !== null || listDrag !== null;

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
          if (!dragRef.current && !listDragRef.current) geoRef.current.scrollX = e.nativeEvent.contentOffset.x;
        }}
        onContentSizeChange={(w) => {
          geoRef.current.contentWidth = w;
        }}
        keyboardShouldPersistTaps="handled"
      >
        {columns}
        <AddListColumn onAdd={(title) => api.dispatch({ type: 'list/add', list: newList(title) })} />
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
