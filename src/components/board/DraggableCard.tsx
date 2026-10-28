import * as Haptics from 'expo-haptics';
import { memo, useCallback, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '../../lib/haptics';
import { isCardDone } from '../../shared/cards';
import type { Card, ChecklistItem, Label, PowerUps } from '../../shared/types';
import { CardFace, type TaskTargets, type ViewRef } from './CardFace';
import { InsertGap } from './InsertGap';
import { CARD_GAP, LONG_PRESS_MS, type BoardApi } from './boardApi';
import { runTapTarget, type TapTarget } from './tapTargets';

/**
 * A card on the board: tap to open it, tap its circle to mark it done, tap its tasks' arrow to list
 * them (to tick, edit or add one), long-press and drag to move it.
 */
export const DraggableCard = memo(function DraggableCard({
  card,
  listId,
  labels,
  powerUps,
  hidden,
  movable = true,
  selecting = false,
  selected = false,
  hasButtons = false,
  expanded = false,
  api,
  onInsert,
}: {
  card: Card;
  listId: string;
  labels: Label[];
  powerUps: PowerUps;
  /** The card being dragged stays mounted (it owns the gesture) but takes no space. */
  hidden: boolean;
  /** False while the board shows only some cards (a filter): the gaps are not the real ones. */
  movable?: boolean;
  /** Cards are being selected: a tap selects this one (or unselects it) instead of opening it. */
  selecting?: boolean;
  selected?: boolean;
  /** The board has card buttons: the card shows a button that lists them. */
  hasButtons?: boolean;
  /** The card's tasks are listed under it. */
  expanded?: boolean;
  api: BoardApi;
  /** Offers a "+" in the gap above the card that adds a new card there (web, with a mouse). */
  onInsert?: (beforeCardId: string) => void;
}) {
  const cardId = card.id;
  const {
    activeId,
    tx,
    ty,
    startDrag,
    moveDrag,
    endDrag,
    openCard,
    openLink,
    openButtons,
    toggleTasks,
    openTask,
    toggleSelect,
    dispatch,
    reportCard,
  } = api;
  const link = card.link;
  const done = isCardDone(card);
  const tasks = card.checklist;

  const toggleDone = useCallback(() => {
    if (!done) haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    dispatch({ type: 'card/update', cardId, patch: { dueDone: !done } });
  }, [cardId, done, dispatch]);

  const toggleTask = useCallback(
    (item: ChecklistItem) => {
      if (!item.done) haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      dispatch({ type: 'check/update', cardId, itemId: item.id, patch: { done: !item.done } });
    },
    [cardId, dispatch],
  );

  // A tap opens the card, except on its circle, which marks it done, on its tasks' arrow, which lists
  // them, on its buttons' button, and on the linked board's button, which opens that board. A task
  // listed is ticked by its circle and edited by its text, and the row under them adds one. They move
  // with the card's content, so they are measured at the moment of the tap. While selecting, a tap
  // anywhere selects the card.
  const rootRef = useRef<ViewRef>(null);
  const checkRef = useRef<ViewRef>(null);
  const buttonsRef = useRef<ViewRef>(null);
  const linkButtonRef = useRef<ViewRef>(null);
  const tasksButtonRef = useRef<ViewRef>(null);
  const taskTargets = useRef<TaskTargets>({ checks: {}, rows: {} });
  const addTaskRef = useRef<ViewRef>(null);
  const onTap = useCallback(
    (x: number, y: number) => {
      if (selecting) return toggleSelect(cardId);
      // The tasks come first, hit only when tapped right on: they sit close to the arrow. A task's
      // circle sits inside its row, so the circles go before the rows.
      const { checks, rows } = taskTargets.current;
      const listed: TapTarget[] = expanded
        ? [
            ...tasks.map((item) => ({ ref: checks[item.id] ?? null, slop: 0, run: () => toggleTask(item) })),
            ...tasks.map((item) => ({ ref: rows[item.id] ?? null, slop: 0, run: () => openTask(cardId, item.id) })),
            { ref: addTaskRef.current, slop: 0, run: () => openTask(cardId, null) },
          ]
        : [];
      runTapTarget(
        [
          ...listed,
          { ref: checkRef.current, slop: 8, run: toggleDone },
          { ref: tasksButtonRef.current, slop: 8, run: () => toggleTasks(cardId) },
          { ref: buttonsRef.current, slop: 8, run: () => openButtons(cardId) },
          { ref: link ? linkButtonRef.current : null, slop: 8, run: () => link && openLink(link) },
        ],
        rootRef.current,
        x,
        y,
        () => openCard(cardId),
      );
    },
    [
      cardId,
      link,
      tasks,
      expanded,
      selecting,
      openCard,
      openLink,
      openButtons,
      toggleTasks,
      openTask,
      toggleSelect,
      toggleDone,
      toggleTask,
    ],
  );

  const gesture = useMemo(() => {
    const tap = Gesture.Tap().onEnd((e, success) => {
      'worklet';
      if (success && activeId.value === '') scheduleOnRN(onTap, e.x, e.y);
    });
    // A tap alone when the card cannot move: in Exclusive the tap waits for the drag to fail, and a
    // disabled drag never does, so the tap would never fire.
    if (!movable) return tap;

    const pan = Gesture.Pan()
      .activateAfterLongPress(LONG_PRESS_MS)
      .onStart((e) => {
        'worklet';
        if (activeId.value !== '') return;
        activeId.set(cardId);
        tx.set(0);
        ty.set(0);
        scheduleOnRN(startDrag, cardId, listId, e.x, e.y);
      })
      .onUpdate((e) => {
        'worklet';
        if (activeId.value !== cardId) return;
        tx.set(e.translationX);
        ty.set(e.translationY);
        scheduleOnRN(moveDrag, e.translationX, e.translationY);
      })
      .onFinalize(() => {
        'worklet';
        if (activeId.value === cardId) scheduleOnRN(endDrag);
      });

    return Gesture.Exclusive(pan, tap);
  }, [cardId, listId, movable, activeId, tx, ty, startDrag, moveDrag, endDrag, onTap]);

  const actions = [{ name: 'toggleDone', label: done ? 'إلغاء الإنجاز' : 'تحديد كمنجزة' }];
  if (tasks.length > 0) actions.push({ name: 'toggleTasks', label: expanded ? 'إخفاء المهام' : 'إظهار المهام' });
  if (tasks.length > 0 && expanded) actions.push({ name: 'addTask', label: 'إضافة مهمة' });
  if (hasButtons) actions.push({ name: 'openButtons', label: 'أزرار البطاقة' });
  if (link) actions.push({ name: 'openLink', label: 'فتح اللوحة المرتبطة' });

  // The outer view is measured: it must be a direct child of the list's content, and on the
  // web GestureDetector inserts a `display: contents` wrapper around the view it controls.
  return (
    <View
      collapsable={false}
      onLayout={(e) => reportCard(cardId, e.nativeEvent.layout)}
      style={[styles.wrap, hidden && styles.hidden]}
    >
      <GestureDetector gesture={gesture}>
        <View
          collapsable={false}
          accessibilityRole={selecting ? 'checkbox' : 'button'}
          aria-checked={selecting ? selected : undefined}
          accessibilityLabel={done ? `${card.title}، منجزة` : card.title}
          accessibilityHint={
            selecting ? 'اضغط لتحديدها أو إلغاء تحديدها' : 'اضغط لفتح البطاقة، أو اضغط مطولًا واسحبها لنقلها'
          }
          accessibilityActions={selecting ? undefined : actions}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'toggleDone') toggleDone();
            else if (e.nativeEvent.actionName === 'toggleTasks') toggleTasks(cardId);
            else if (e.nativeEvent.actionName === 'addTask') openTask(cardId, null);
            else if (e.nativeEvent.actionName === 'openButtons') openButtons(cardId);
            else if (link && e.nativeEvent.actionName === 'openLink') openLink(link);
          }}
        >
          <CardFace
            card={card}
            labels={labels}
            powerUps={powerUps}
            expanded={expanded}
            rootRef={rootRef}
            checkRef={checkRef}
            buttonsRef={hasButtons && !selecting ? buttonsRef : undefined}
            linkButtonRef={linkButtonRef}
            tasksButtonRef={tasksButtonRef}
            taskTargets={taskTargets}
            addTaskRef={addTaskRef}
            selected={selecting && selected}
          />
        </View>
      </GestureDetector>
      {onInsert ? <InsertGap onPress={() => onInsert(cardId)} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: CARD_GAP,
    // Stop the browser from selecting text while a card is long-pressed.
    ...(Platform.OS === 'web' ? { userSelect: 'none' as const } : null),
  },
  hidden: { height: 0, marginBottom: 0, opacity: 0, overflow: 'hidden' },
});
