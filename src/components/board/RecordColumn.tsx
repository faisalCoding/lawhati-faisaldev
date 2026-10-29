import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, type ScrollView as RNScrollView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { formatLongDate, todayISO } from '../../lib/dates';
import { uid } from '../../lib/ids';
import { inColumn, isHeld, livingClauses, movedProgress } from '../../lib/meetings';
import { pluralPolicies, pluralSubtopics, pluralTopics } from '../../lib/text';
import { colors, LIST_GAP, LIST_WIDTH } from '../../lib/theme';
import type { Board, BoardColumn, BoardColumnKind, Meeting, PolicyTopic } from '../../shared/types';
import { dispatch, startMeeting } from '../../store/actions';
import type { ViewRef } from './CardFace';
import { CARD_GAP, CARDS_PADDING_H, CARDS_PADDING_TOP, LONG_PRESS_MS, type BoardApi } from './boardApi';
import { runTapTarget } from './tapTargets';
import { Icon, IconButton } from '../ui/Buttons';
import { ActionList, Sheet, type SheetAction } from '../ui/Sheet';
import { Input, Txt } from '../ui/Txt';

/**
 * A column of meetings, or of standing policies.
 *
 * It wears the task column's shell so the board reads as one thing, and shares none of its
 * behaviour. A task card is dragged between lists and ticked off; a meeting is a record of a day
 * and a policy is a rule, and neither is work in progress.
 *
 * Its contents are not in `board.lists`. Two dozen files read that array and every one of them
 * would take a meeting for a task.
 */
export function RecordColumn({
  board,
  column,
  index,
  count,
  maxHeight,
  api,
  dragging,
  dragItemId,
  targeted,
  placeholderIndex,
  placeholderHeight,
}: {
  board: Board;
  column: BoardColumn;
  index: number;
  /** How many columns there are, for the move actions. */
  count: number;
  maxHeight: number;
  api: BoardApi;
  /** Something is being dragged on the board: the column must not scroll under it. */
  dragging: boolean;
  /** The record being dragged: it stays mounted (it owns the gesture) but takes no space. */
  dragItemId: string | null;
  /** This whole column is where the record would land, with no slot to show for it. */
  targeted: boolean;
  /** Where the drop placeholder goes among the subjects, or -1. */
  placeholderIndex: number;
  placeholderHeight: number;
}) {
  const [sheet, setSheet] = useState<'menu' | 'remove' | 'rename' | 'agenda' | null>(null);
  const [moving, setMoving] = useState<{ id: string; text: string } | null>(null);
  const [composing, setComposing] = useState(false);

  const siblings = (board.columns ?? []).filter((c) => c.kind === column.kind && c.id !== column.id);
  const columns = board.columns ?? [];
  const items =
    column.kind === 'meetings'
      ? inColumn(board.meetings ?? [], column, columns)
      // A policies column holds subjects, not rules. The rules live two levels down, which is how
      // the minutes already write them.
      : inColumn(board.policyTopics ?? [], column, columns);

  const menu: SheetAction[] = [{ label: 'إعادة التسمية', icon: 'pencil', onPress: () => setSheet('rename') }];
  if (column.kind === 'meetings') {
    menu.push({
      label: 'المحاور الثابتة',
      icon: 'layers',
      hint: 'يبدأ كل اجتماع جديد بها',
      onPress: () => setSheet('agenda'),
    });
  }
  if (index > 0) {
    menu.push({
      label: 'نقل إلى اليمين',
      icon: 'chevron-right',
      onPress: () => {
        dispatch(board.id, { type: 'column/move', columnId: column.id, toIndex: index - 1 });
        setSheet(null);
      },
    });
  }
  if (index < count - 1) {
    menu.push({
      label: 'نقل إلى اليسار',
      icon: 'chevron-left',
      onPress: () => {
        dispatch(board.id, { type: 'column/move', columnId: column.id, toIndex: index + 1 });
        setSheet(null);
      },
    });
  }
  menu.push({
    label: 'حذف العمود',
    icon: 'trash',
    destructive: true,
    onPress: () => setSheet(items.length > 0 || siblings.length > 0 ? 'remove' : null),
  });
  // Nothing in it and nowhere to move things: deleting asks nothing.
  if (items.length === 0 && siblings.length === 0) {
    menu[menu.length - 1].onPress = () => {
      dispatch(board.id, { type: 'column/remove', columnId: column.id });
      setSheet(null);
    };
  }

  const add = (text: string) => {
    if (column.kind === 'meetings') {
      const id = startMeeting(board.id, text, todayISO(), column.id);
      setComposing(false);
      if (id) router.push(`/board/${board.id}/meeting/${id}`);
      return;
    }
    dispatch(board.id, {
      type: 'topic/addPolicy',
      topic: { id: uid(), title: text, columnId: column.id, subtopics: [] },
    });
  };

  const movable = siblings.length > 0 || (column.kind === 'policies' && items.length > 1);

  // The cards, with a gap where the record being dragged would land. A meetings column shows no
  // gap: the order in it is the dates', not the finger's, so the whole column lights up instead.
  const cards: ReactNode[] = [];
  const placeholder = <View key="drop-placeholder" style={[styles.placeholder, { height: placeholderHeight }]} />;
  let shown = 0;
  for (const item of items) {
    const dragged = item.id === dragItemId;
    if (!dragged && shown === placeholderIndex) cards.push(placeholder);
    cards.push(
      <DraggableRecord
        key={item.id}
        api={api}
        board={board}
        column={column}
        item={item}
        hidden={dragged}
        movable={movable}
        onOpen={
          column.kind === 'meetings'
            ? () => router.push(`/board/${board.id}/meeting/${item.id}`)
            : () => router.push(`/board/${board.id}/policy/${item.id}`)
        }
        onMove={siblings.length ? () => setMoving({ id: item.id, text: item.title }) : undefined}
      />,
    );
    if (!dragged) shown++;
  }
  if (placeholderIndex >= shown) cards.push(placeholder);

  return (
    <View style={[styles.column, { maxHeight }]}>
      <View style={styles.header}>
        <View style={styles.titleBox}>
          <Icon name={column.kind === 'meetings' ? 'calendar' : 'book'} size={15} color={colors.textSubtle} />
          <Txt style={styles.title} numberOfLines={2}>
            {column.title}
          </Txt>
          <View style={styles.count}>
            <Txt style={styles.countText}>{items.length}</Txt>
          </View>
        </View>
        <IconButton name="more" label="خيارات العمود" size={20} onPress={() => setSheet('menu')} />
      </View>

      <ScrollView
        ref={(r: RNScrollView | null) => api.registerList(column.id, r)}
        style={[styles.cards, targeted && styles.cardsTargeted]}
        contentContainerStyle={styles.cardsContent}
        scrollEnabled={!dragging}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onLayout={(e) => api.reportListViewport(column.id, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => api.reportListContent(column.id, h)}
        onScroll={(e) => api.reportListScroll(column.id, e.nativeEvent.contentOffset.y)}
      >
        {cards}
      </ScrollView>

      {composing ? (
        <Composer
          placeholder={column.kind === 'meetings' ? 'عنوان الاجتماع' : 'موضوع جديد'}

          onAdd={add}
          onCancel={() => setComposing(false)}
        />
      ) : (
        <Pressable
          onPress={() => setComposing(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
        >
          <Icon name="plus" size={16} color={colors.textSubtle} />
          <Txt style={styles.addText}>{column.kind === 'meetings' ? 'اجتماع جديد' : 'موضوع جديد'}</Txt>
        </Pressable>
      )}

      <Sheet visible={sheet !== null} onClose={() => setSheet(null)} title={column.title}>
        {sheet === 'menu' ? <ActionList actions={menu} /> : null}
        {sheet === 'rename' ? (
          <RenameColumn board={board} column={column} onDone={() => setSheet(null)} />
        ) : null}
        {sheet === 'agenda' ? <AgendaSheet board={board} /> : null}
        {sheet === 'remove' ? (
          <RemoveColumn
            board={board}
            column={column}
            held={items.length}
            siblings={siblings}
            onDone={() => setSheet(null)}
          />
        ) : null}
      </Sheet>

      <Sheet visible={moving !== null} onClose={() => setMoving(null)} title="نقل إلى عمود">
        <View style={styles.remove}>
          {siblings.map((sib) => (
            <Pressable
              key={sib.id}
              accessibilityRole="button"
              onPress={() => {
                if (!moving) return;
                dispatch(
                  board.id,
                  column.kind === 'meetings'
                    ? { type: 'meeting/update', meetingId: moving.id, patch: { columnId: sib.id } }
                    : { type: 'topic/updatePolicy', topicId: moving.id, patch: { columnId: sib.id } },
                );
                setMoving(null);
              }}
              style={({ pressed }) => [styles.removeChoice, pressed && styles.pressed]}
            >
              <Icon name={column.kind === 'meetings' ? 'calendar' : 'book'} size={16} color={colors.primary} />
              <Txt style={styles.removeMove}>{sib.title}</Txt>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

/** Everything filed here — including anything with no column at all, which the first one adopts. */
/**
 * Deleting a column asks what becomes of what is in it, because minutes are the most valuable
 * thing on this board and a column is only a heading over them.
 */
function RemoveColumn({
  board,
  column,
  held,
  siblings,
  onDone,
}: {
  board: Board;
  column: BoardColumn;
  held: number;
  siblings: BoardColumn[];
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const what = column.kind === 'meetings' ? `${held} اجتماعًا` : pluralPolicies(held);

  return (
    <View style={styles.remove}>
      <Txt style={styles.removeLead}>
        {held > 0 ? `في هذا العمود ${what}. ماذا يحلّ بها؟` : 'العمود فارغ.'}
      </Txt>

      {held > 0
        ? siblings.map((s) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              onPress={() => {
                dispatch(board.id, { type: 'column/remove', columnId: column.id, moveTo: s.id });
                onDone();
              }}
              style={({ pressed }) => [styles.removeChoice, pressed && styles.pressed]}
            >
              <Icon name="move" size={16} color={colors.primary} />
              <Txt style={styles.removeMove}>انقلها إلى {s.title}</Txt>
            </Pressable>
          ))
        : null}

      {confirming ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            dispatch(board.id, { type: 'column/remove', columnId: column.id });
            onDone();
          }}
          style={({ pressed }) => [styles.removeChoice, styles.removeDanger, pressed && styles.pressed]}
        >
          <Icon name="trash" size={16} color={colors.surface} />
          <Txt style={styles.removeDangerText}>
            {held > 0 ? `نعم، احذف العمود و${what} معه` : 'نعم، احذف العمود'}
          </Txt>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirming(true)}
          style={({ pressed }) => [styles.removeChoice, pressed && styles.pressed]}
        >
          <Icon name="trash" size={16} color={colors.danger} />
          <Txt style={styles.removeDelete}>{held > 0 ? `احذفها مع العمود` : 'احذف العمود'}</Txt>
        </Pressable>
      )}

      {confirming && held > 0 ? <Txt style={styles.removeWarn}>لا يُستعاد إلا بالتراجع.</Txt> : null}
    </View>
  );
}

/**
 * A record card that can be lifted out of its column and dropped in another of the same kind.
 *
 * It is the task card's gesture — long-press, then drag — over a different body, and it ends
 * somewhere else: a meeting only changes column, because within one the date sets the order.
 *
 * The whole card is one button and the move control on it is a plain view, measured at the moment
 * of the tap. That is how the task cards do it, and it is what keeps the web build from putting a
 * button inside a button.
 */
function DraggableRecord({
  api,
  board,
  column,
  item,
  hidden,
  movable,
  onOpen,
  onMove,
}: {
  api: BoardApi;
  board: Board;
  column: BoardColumn;
  item: Meeting | PolicyTopic;
  /** Being dragged: it keeps the gesture and gives up its space. */
  hidden: boolean;
  /** False when there is nowhere it could go, so the long press is left to do nothing. */
  movable: boolean;
  onOpen: () => void;
  /** The same move by a button, for a column too far to drag to and for assistive tech. */
  onMove?: () => void;
}) {
  const { activeId, tx, ty, startRecordDrag, moveRecordDrag, endRecordDrag, reportCard } = api;
  const itemId = item.id;
  const kind = column.kind;
  const columnId = column.id;
  const rootRef = useRef<ViewRef>(null);
  const moveRef = useRef<ViewRef>(null);

  const onTap = useCallback(
    (x: number, y: number) => {
      runTapTarget(
        [{ ref: onMove ? moveRef.current : null, slop: 8, run: () => onMove?.() }],
        rootRef.current,
        x,
        y,
        onOpen,
      );
    },
    [onMove, onOpen],
  );

  const gesture = useMemo(() => {
    // scheduleOnRN hands onTap to the tap itself, so the views it measures are read then and not
    // while this gesture is being built — which the rule has no way to see through.
    // eslint-disable-next-line react-hooks/refs
    const tap = Gesture.Tap().onEnd((e, success) => {
      'worklet';
      // A tap that was really the end of a drag opens nothing.
      if (success && activeId.value === '') scheduleOnRN(onTap, e.x, e.y);
    });
    // In Exclusive the tap waits for the drag to fail, and a drag that cannot start never does.
    if (!movable) return tap;

    const pan = Gesture.Pan()
      .activateAfterLongPress(LONG_PRESS_MS)
      .onStart((e) => {
        'worklet';
        if (activeId.value !== '') return;
        activeId.set(itemId);
        tx.set(0);
        ty.set(0);
        scheduleOnRN(startRecordDrag, kind, itemId, columnId, e.x, e.y);
      })
      .onUpdate((e) => {
        'worklet';
        if (activeId.value !== itemId) return;
        tx.set(e.translationX);
        ty.set(e.translationY);
        scheduleOnRN(moveRecordDrag, e.translationX, e.translationY);
      })
      .onFinalize(() => {
        'worklet';
        if (activeId.value === itemId) scheduleOnRN(endRecordDrag);
      });

    return Gesture.Exclusive(pan, tap);
  }, [activeId, tx, ty, startRecordDrag, moveRecordDrag, endRecordDrag, kind, itemId, columnId, movable, onTap]);

  return (
    <View
      collapsable={false}
      onLayout={(e) => reportCard(itemId, e.nativeEvent.layout)}
      style={[styles.recordWrap, hidden && styles.recordHidden]}
    >
      {/* Without this the detector sets touch-action: none, and a finger landing on a card —
      most of the board — stops the browser scrolling the board under it. The drag only
      starts after a long press, so the two never want the same touch. */}
      <GestureDetector gesture={gesture} touchAction="manipulation">
        <View
          ref={rootRef}
          collapsable={false}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          accessibilityHint={movable ? 'اضغط لفتحه، أو اضغط مطوّلًا واسحبه لنقله' : undefined}
          accessibilityActions={onMove ? [{ name: 'move', label: 'نقل إلى عمود آخر' }] : undefined}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'move') onMove?.();
          }}
        >
          {kind === 'meetings' ? (
            <MeetingCard board={board} meeting={item as Meeting} moveRef={onMove ? moveRef : undefined} />
          ) : (
            <TopicCard board={board} topic={item as PolicyTopic} moveRef={onMove ? moveRef : undefined} />
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

/** The card that follows the finger while a record is being dragged. */
export function RecordCardPreview({
  board,
  kind,
  itemId,
}: {
  board: Board;
  kind: BoardColumnKind;
  itemId: string;
}) {
  // It has to look like the card it was lifted from, down to the corner the move icon sits in.
  const moveRef = useRef<ViewRef>(null);
  const moving = (board.columns ?? []).filter((c) => c.kind === kind).length > 1 ? moveRef : undefined;
  if (kind === 'meetings') {
    const meeting = (board.meetings ?? []).find((m) => m.id === itemId);
    return meeting ? <MeetingCard board={board} meeting={meeting} moveRef={moving} lifted /> : null;
  }
  const topic = (board.policyTopics ?? []).find((t) => t.id === itemId);
  return topic ? <TopicCard board={board} topic={topic} moveRef={moving} lifted /> : null;
}

function MeetingCard({
  board,
  meeting,
  moveRef,
  lifted = false,
}: {
  board: Board;
  meeting: Meeting;
  /** Absent when there is nowhere else of this kind to move it to. */
  moveRef?: RefObject<ViewRef | null>;
  /** Drawn under the finger rather than in its column. */
  lifted?: boolean;
}) {
  const held = isHeld(meeting);
  const { moved, total } = movedProgress(board, meeting);

  return (
    <View style={[styles.card, lifted && styles.lifted]}>
      <View style={styles.cardTop}>
        <Txt style={styles.cardTitle} numberOfLines={2}>
          {meeting.title}
        </Txt>
        <View style={[styles.held, held ? styles.heldOn : styles.heldOff]}>
          <Txt style={[styles.heldText, held ? styles.heldTextOn : styles.heldTextOff]}>
            {held ? 'عُقد' : 'لم يُعقد'}
          </Txt>
        </View>
      </View>

      <View style={styles.cardFoot}>
        <Txt style={styles.cardMeta} numberOfLines={1}>
          {formatLongDate(meeting.date)} · {pluralTopics(meeting.topics.length)}
          {meeting.attendees.length ? ` · ${meeting.attendees.length} حضورًا` : ''}
        </Txt>
        {/* Visible, not a hidden long-press: everything else on this board is a thing you can see. */}
        <MoveTarget moveRef={moveRef} />
      </View>

      {total > 0 ? (
        <View style={styles.bar}>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.round((moved / total) * 100)}%` },
                moved === total && styles.barFillDone,
              ]}
            />
          </View>
          <Txt style={[styles.barText, moved === total && styles.barTextDone]}>
            {moved === total ? 'رُحِّلت' : `${moved}/${total}`}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

function TopicCard({
  board,
  topic,
  moveRef,
  lifted = false,
}: {
  board: Board;
  topic: PolicyTopic;
  moveRef?: RefObject<ViewRef | null>;
  lifted?: boolean;
}) {
  const clauses = livingClauses(board, topic.id);
  return (
    <View style={[styles.card, lifted && styles.lifted]}>
      <Txt style={styles.cardTitle} numberOfLines={2}>
        {topic.title}
      </Txt>
      <View style={styles.cardFoot}>
        <Txt style={styles.cardMeta} numberOfLines={1}>
          {topic.subtopics.length ? `${pluralSubtopics(topic.subtopics.length)} · ` : ''}
          {pluralPolicies(clauses.length)}
        </Txt>
        <MoveTarget moveRef={moveRef} />
      </View>
    </View>
  );
}

/**
 * The move control drawn on a record card: a view, not a button, because the card around it is one.
 * `DraggableRecord` measures it when a tap lands and runs the move itself.
 */
function MoveTarget({ moveRef }: { moveRef?: RefObject<ViewRef | null> }) {
  if (!moveRef) return null;
  return (
    <View ref={moveRef} collapsable={false} style={styles.moveTarget}>
      <Icon name="move" size={16} color={colors.textSubtle} />
    </View>
  );
}

/**
 * One policy subject: its sub-headings, and the rules under each.
 *
 * Three levels, because the minutes are written in three: «ضوابط وإجراءات الرحلات», then
 * «الانضباط والمواعيد», then the rule itself. A flat list would lose the reading.
 */
/**
 * The subjects these meetings keep returning to. Every new meeting starts from them.
 */
function AgendaSheet({ board }: { board: Board }) {
  const [draft, setDraft] = useState('');
  const agenda = board.agenda ?? [];
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    dispatch(board.id, { type: 'agenda/add', subject: { id: uid(), title } });
    setDraft('');
  };

  return (
    <ScrollView style={styles.topicSheet} keyboardShouldPersistTaps="handled">
      <Txt style={styles.agendaNote}>
        يبدأ كل اجتماع جديد بهذه المحاور جاهزةً للتدوين، ويبقى بإمكانك إضافة محاور طارئة داخله.
      </Txt>
      {agenda.map((subject, index) => (
        <View key={subject.id} style={styles.agendaRow}>
          <Txt style={styles.agendaTitle} numberOfLines={2}>
            {subject.title}
          </Txt>
          <IconButton
            name="history"
            label={`كل ما تقرّر عن ${subject.title}`}
            size={18}
            onPress={() => router.push(`/board/${board.id}/subject/${subject.id}`)}
          />
          <IconButton
            name="chevron-up"
            label="أعلى"
            size={18}
            disabled={index === 0}
            onPress={() => dispatch(board.id, { type: 'agenda/move', subjectId: subject.id, toIndex: index - 1 })}
          />
          <IconButton
            name="chevron-down"
            label="أسفل"
            size={18}
            disabled={index === agenda.length - 1}
            onPress={() => dispatch(board.id, { type: 'agenda/move', subjectId: subject.id, toIndex: index + 1 })}
          />
          <IconButton
            name="trash"
            label="حذف المحور الثابت"
            size={18}
            onPress={() => dispatch(board.id, { type: 'agenda/remove', subjectId: subject.id })}
          />
        </View>
      ))}
      <View style={styles.agendaAdd}>
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder="محور ثابت جديد"
          onSubmitEditing={add}
          returnKeyType="done"
          style={styles.agendaInput}
        />
        <IconButton name="plus" label="إضافة محور ثابت" onPress={add} disabled={!draft.trim()} />
      </View>
    </ScrollView>
  );
}

function RenameColumn({ board, column, onDone }: { board: Board; column: BoardColumn; onDone: () => void }) {
  const [text, setText] = useState(column.title);
  return (
    <View style={styles.remove}>
      <Input autoFocus value={text} onChangeText={setText} placeholder="اسم العمود" style={styles.editInput} />
      <Pressable
        accessibilityRole="button"
        disabled={!text.trim() || text.trim() === column.title}
        onPress={() => {
          dispatch(board.id, { type: 'column/update', columnId: column.id, patch: { title: text.trim() } });
          onDone();
        }}
        style={({ pressed }) => [styles.removeChoice, pressed && styles.pressed]}
      >
        <Icon name="check" size={16} color={colors.primary} />
        <Txt style={styles.removeMove}>حفظ</Txt>
      </Pressable>
    </View>
  );
}

function Composer({
  placeholder,
  multiline,
  onAdd,
  onCancel,
}: {
  placeholder: string;
  multiline?: boolean;
  onAdd: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onAdd(value);
    setText('');
  };

  return (
    <View style={styles.composer}>
      <Input
        autoFocus
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        multiline={multiline}
        onSubmitEditing={multiline ? undefined : submit}
        returnKeyType={multiline ? undefined : 'done'}
        onBlur={() => (text.trim() ? submit() : onCancel())}
        style={styles.composerInput}
      />
      <View style={styles.composerRow}>
        <IconButton name="plus" label="إضافة" onPress={submit} disabled={!text.trim()} />
        <IconButton name="close" label="إلغاء" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    width: LIST_WIDTH,
    marginHorizontal: LIST_GAP / 2,
    backgroundColor: colors.list,
    borderRadius: 14,
    // Undo the board's mirroring so the column's content reads normally.
    transform: [{ scaleX: -1 }],
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
    paddingBottom: 4,
    paddingRight: 12,
    paddingLeft: 4,
  },
  titleBox: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: '700' },
  count: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, backgroundColor: colors.surface },
  countText: { fontSize: 11.5, color: colors.textSubtle, fontWeight: '700' },
  cards: { flexGrow: 0, flexShrink: 1 },
  // The drag arithmetic adds these up card by card, so they have to be the board's own constants.
  cardsContent: { paddingHorizontal: CARDS_PADDING_H, paddingTop: CARDS_PADDING_TOP, paddingBottom: 4 },
  cardsTargeted: {
    backgroundColor: colors.placeholder,
    borderRadius: 10,
    // An empty column still has to be somewhere a meeting can be dropped.
    minHeight: 56,
  },
  recordWrap: {
    marginBottom: CARD_GAP,
    // Stop the browser from selecting text while a card is long-pressed.
    ...(Platform.OS === 'web' ? { userSelect: 'none' as const } : null),
  },
  recordHidden: { height: 0, marginBottom: 0, opacity: 0, overflow: 'hidden' },
  placeholder: { borderRadius: 10, backgroundColor: colors.placeholder, marginBottom: CARD_GAP },
  // The footprint the icon button it replaced had, so the card's foot keeps its height.
  moveTarget: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 10, borderRadius: 10, backgroundColor: colors.surface, gap: 5 },
  lifted: {
    shadowColor: '#091E42',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pressed: { opacity: 0.75 },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 6 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 23 },
  cardFoot: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  cardMeta: { flex: 1, fontSize: 11, color: colors.textFaint },
  held: { paddingVertical: 1, paddingHorizontal: 6, borderRadius: 5 },
  heldOn: { backgroundColor: colors.successBg },
  heldOff: { backgroundColor: colors.list },
  heldText: { fontSize: 10, fontWeight: '700' },
  heldTextOn: { color: colors.success },
  heldTextOff: { color: colors.textFaint },
  bar: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  barTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.list, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: colors.warning },
  barFillDone: { backgroundColor: colors.success },
  barText: { fontSize: 10, color: colors.textFaint },
  barTextDone: { color: colors.success, fontWeight: '700' },
  editInput: { fontSize: 15, minHeight: 44 },
  agendaNote: { fontSize: 13, color: colors.textSubtle, lineHeight: 24, paddingVertical: 10 },
  agendaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: colors.list,
    marginBottom: 6,
  },
  agendaTitle: { flex: 1, fontSize: 14 },
  agendaAdd: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 8 },
  agendaInput: { flex: 1, fontSize: 14 },
  topicSheet: { maxHeight: 440, paddingHorizontal: 16, paddingBottom: 16 },
  addRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  addText: { fontSize: 13, color: colors.textSubtle, fontWeight: '700' },
  composer: { padding: 8, gap: 6 },
  composerInput: { fontSize: 14, backgroundColor: colors.surface },
  composerRow: { flexDirection: 'row-reverse', gap: 4 },
  remove: { padding: 16, gap: 10 },
  removeLead: { fontSize: 14, lineHeight: 26 },
  removeChoice: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.list,
  },
  removeMove: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.primary },
  removeDelete: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.danger },
  removeDanger: { backgroundColor: colors.danger },
  removeDangerText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.surface },
  removeWarn: { fontSize: 12, color: colors.textFaint, textAlign: 'center' },
});
