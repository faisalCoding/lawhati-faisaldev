import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, type ScrollView as RNScrollView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { addDays, formatLongDate, toISODate, todayISO } from '../../lib/dates';
import { uid } from '../../lib/ids';
import { inColumn, isHeld, movedProgress } from '../../lib/meetings';
import { pluralPolicies, pluralTopics } from '../../lib/text';
import { colors, LIST_GAP, LIST_WIDTH } from '../../lib/theme';
import type { Board, BoardColumn, BoardColumnKind, Meeting, Policy, PolicyEvent, PolicyTopic } from '../../shared/types';
import { dispatch, startMeeting } from '../../store/actions';
import { CARD_GAP, CARDS_PADDING_H, CARDS_PADDING_TOP, LONG_PRESS_MS, type BoardApi } from './boardApi';
import { Chip, Icon, IconButton } from '../ui/Buttons';
import { EditableText } from '../ui/EditableText';
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
  const [editing, setEditing] = useState<PolicyTopic | null>(null);
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
  /** A press that was really the end of a drag opens nothing. */
  const afterDrag = (run: () => void) => () => {
    if (api.activeId.value === '') run();
  };

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
        kind={column.kind}
        itemId={item.id}
        columnId={column.id}
        hidden={dragged}
        movable={movable}
      >
        {column.kind === 'meetings' ? (
          <MeetingCard
            board={board}
            meeting={item as Meeting}
            onOpen={afterDrag(() => router.push(`/board/${board.id}/meeting/${item.id}`))}
            onMove={siblings.length ? () => setMoving({ id: item.id, text: item.title }) : undefined}
          />
        ) : (
          <TopicCard
            board={board}
            topic={item as PolicyTopic}
            onOpen={afterDrag(() => setEditing(item as PolicyTopic))}
            onMove={siblings.length ? () => setMoving({ id: item.id, text: item.title }) : undefined}
          />
        )}
      </DraggableRecord>,
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

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing?.title ?? ''}>
        {editing ? <TopicSheet board={board} topic={editing} /> : null}
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
 */
function DraggableRecord({
  api,
  kind,
  itemId,
  columnId,
  hidden,
  movable,
  children,
}: {
  api: BoardApi;
  kind: BoardColumnKind;
  itemId: string;
  columnId: string;
  /** Being dragged: it keeps the gesture and gives up its space. */
  hidden: boolean;
  /** False when there is nowhere it could go, so the long press is left to do nothing. */
  movable: boolean;
  children: ReactNode;
}) {
  const { activeId, tx, ty, startRecordDrag, moveRecordDrag, endRecordDrag, reportCard } = api;

  // Only the drag is a gesture. The card underneath keeps its own press, so the button on it stays
  // a button; what a press must not do is open a card that the same finger just dragged.
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(movable)
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
        }),
    [activeId, tx, ty, startRecordDrag, moveRecordDrag, endRecordDrag, kind, itemId, columnId, movable],
  );

  return (
    <View
      collapsable={false}
      onLayout={(e) => reportCard(itemId, e.nativeEvent.layout)}
      style={[styles.recordWrap, hidden && styles.recordHidden]}
    >
      <GestureDetector gesture={gesture}>
        <View collapsable={false}>{children}</View>
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
  if (kind === 'meetings') {
    const meeting = (board.meetings ?? []).find((m) => m.id === itemId);
    return meeting ? <MeetingCard board={board} meeting={meeting} lifted /> : null;
  }
  const topic = (board.policyTopics ?? []).find((t) => t.id === itemId);
  return topic ? <TopicCard board={board} topic={topic} lifted /> : null;
}

function MeetingCard({
  board,
  meeting,
  onOpen,
  onMove,
  lifted = false,
}: {
  board: Board;
  meeting: Meeting;
  onOpen?: () => void;
  /** Absent when there is nowhere else of this kind to move it to. */
  onMove?: () => void;
  /** Drawn under the finger rather than in its column. */
  lifted?: boolean;
}) {
  const held = isHeld(meeting);
  const { moved, total } = movedProgress(board, meeting);

  return (
    <Pressable
      onPress={onOpen}
      disabled={lifted}
      accessibilityRole="button"
      accessibilityHint={onMove ? 'اضغط مطوّلًا واسحبه إلى عمود آخر' : undefined}
      style={({ pressed }) => [styles.card, lifted && styles.lifted, pressed && styles.pressed]}
    >
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
        {onMove ? <IconButton name="move" label="نقل إلى عمود آخر" size={16} onPress={onMove} /> : null}
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
    </Pressable>
  );
}

function TopicCard({
  board,
  topic,
  onOpen,
  onMove,
  lifted = false,
}: {
  board: Board;
  topic: PolicyTopic;
  onOpen?: () => void;
  onMove?: () => void;
  lifted?: boolean;
}) {
  const clauses = livingClauses(board, topic.id);
  return (
    <Pressable
      onPress={onOpen}
      disabled={lifted}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, lifted && styles.lifted, pressed && styles.pressed]}
    >
      <Txt style={styles.cardTitle} numberOfLines={2}>
        {topic.title}
      </Txt>
      <View style={styles.cardFoot}>
        <Txt style={styles.cardMeta} numberOfLines={1}>
          {topic.subtopics.length ? `${topic.subtopics.length} موضوعًا فرعيًّا · ` : ''}
          {pluralPolicies(clauses.length)}
        </Txt>
        {onMove ? <IconButton name="move" label="نقل إلى عمود آخر" size={16} onPress={onMove} /> : null}
      </View>
    </Pressable>
  );
}

/** The rules still in force under a topic. A repealed one keeps its record and leaves the board. */
function livingClauses(board: Board, topicId: string, subtopicId?: string | null): Policy[] {
  return (board.policies ?? []).filter(
    (p) =>
      !p.repealedAt &&
      (p.topicId ?? null) === topicId &&
      (subtopicId === undefined || (p.subtopicId ?? null) === subtopicId),
  );
}

/**
 * One policy subject: its sub-headings, and the rules under each.
 *
 * Three levels, because the minutes are written in three: «ضوابط وإجراءات الرحلات», then
 * «الانضباط والمواعيد», then the rule itself. A flat list would lose the reading.
 */
function TopicSheet({ board, topic }: { board: Board; topic: PolicyTopic }) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<Policy | null>(null);
  const loose = livingClauses(board, topic.id, null);

  return (
    <ScrollView style={styles.topicSheet} keyboardShouldPersistTaps="handled">
      {topic.subtopics.map((sub, i) => (
        <View key={sub.id} style={styles.sub}>
          <View style={styles.subHead}>
            <EditableText
              value={sub.title}
              onCommit={(title) =>
                dispatch(board.id, { type: 'subtopic/update', topicId: topic.id, subtopicId: sub.id, patch: { title } })
              }
              required
              placeholder="الموضوع الفرعي"
              style={styles.subTitle}
            />
            <IconButton
              name="chevron-up"
              label="أعلى"
              size={16}
              disabled={i === 0}
              onPress={() =>
                dispatch(board.id, { type: 'subtopic/move', topicId: topic.id, subtopicId: sub.id, toIndex: i - 1 })
              }
            />
            <IconButton
              name="chevron-down"
              label="أسفل"
              size={16}
              disabled={i === topic.subtopics.length - 1}
              onPress={() =>
                dispatch(board.id, { type: 'subtopic/move', topicId: topic.id, subtopicId: sub.id, toIndex: i + 1 })
              }
            />
            <IconButton
              name="trash"
              label="حذف الموضوع الفرعي"
              size={16}
              onPress={() => dispatch(board.id, { type: 'subtopic/remove', topicId: topic.id, subtopicId: sub.id })}
            />
          </View>
          <Clauses board={board} topic={topic} subtopicId={sub.id} onEdit={setEditing} />
        </View>
      ))}

      {loose.length ? (
        <View style={styles.sub}>
          <Txt style={styles.subLoose}>بلا موضوع فرعي</Txt>
          <Clauses board={board} topic={topic} subtopicId={null} onEdit={setEditing} />
        </View>
      ) : null}

      <View style={styles.agendaAdd}>
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder="موضوع فرعي جديد"
          onSubmitEditing={() => {
            const title = draft.trim();
            if (!title) return;
            dispatch(board.id, { type: 'subtopic/add', topicId: topic.id, subtopic: { id: uid(), title } });
            setDraft('');
          }}
          returnKeyType="done"
          style={styles.agendaInput}
        />
        <IconButton
          name="plus"
          label="إضافة موضوع فرعي"
          disabled={!draft.trim()}
          onPress={() => {
            const title = draft.trim();
            if (!title) return;
            dispatch(board.id, { type: 'subtopic/add', topicId: topic.id, subtopic: { id: uid(), title } });
            setDraft('');
          }}
        />
      </View>

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title="البند">
        {editing ? <EditClause board={board} clause={editing} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </ScrollView>
  );
}

function Clauses({
  board,
  topic,
  subtopicId,
  onEdit,
}: {
  board: Board;
  topic: PolicyTopic;
  subtopicId: string | null;
  onEdit: (clause: Policy) => void;
}) {
  const [draft, setDraft] = useState('');
  const clauses = livingClauses(board, topic.id, subtopicId);

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    dispatch(board.id, {
      type: 'policy/add',
      policy: { id: uid(), text, topicId: topic.id, subtopicId, meetingId: null, at: Date.now() },
    });
    setDraft('');
  };

  return (
    <View style={styles.clauses}>
      {clauses.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          onPress={() => onEdit(c)}
          style={({ pressed }) => [styles.clause, pressed && styles.pressed]}
        >
          <Txt style={styles.clauseText}>{c.text}</Txt>
          {c.effectiveFrom ? <Txt style={styles.clauseFrom}>سارٍ من {formatLongDate(c.effectiveFrom)}</Txt> : null}
        </Pressable>
      ))}
      <View style={styles.clauseAdd}>
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder="بند جديد"
          multiline
          style={styles.clauseInput}
        />
        <IconButton name="plus" label="إضافة بند" size={18} onPress={add} disabled={!draft.trim()} />
      </View>
    </View>
  );
}

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

function EditClause({ board, clause: policy, onDone }: { board: Board; clause: Policy; onDone: () => void }) {
  const [text, setText] = useState(policy.text);
  const today = todayISO();
  const meeting = policy.meetingId ? board.meetings?.find((m) => m.id === policy.meetingId) : undefined;
  return (
    <View style={styles.remove}>
      <Input autoFocus multiline value={text} onChangeText={setText} placeholder="نصّ السياسة" style={styles.editInput} />
      {meeting ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onDone();
            router.push(`/board/${board.id}/meeting/${meeting.id}`);
          }}
          style={({ pressed }) => [styles.from, pressed && styles.pressed]}
        >
          <Icon name="calendar" size={12} color={colors.textFaint} />
          <Txt style={styles.fromText}>من {meeting.title}</Txt>
        </Pressable>
      ) : null}
      <View style={styles.wrapChips}>
        <Chip
          label={policy.effectiveFrom ? `سارٍ من ${formatLongDate(policy.effectiveFrom)}` : 'بلا تاريخ سريان'}
          icon="calendar"
          selected={!!policy.effectiveFrom}
          onPress={() =>
            dispatch(board.id, {
              type: 'policy/update',
              policyId: policy.id,
              patch: { effectiveFrom: policy.effectiveFrom ? null : today },
            })
          }
        />
        {policy.effectiveFrom ? (
          <>
            <IconButton
              name="chevron-right"
              label="اليوم السابق"
              onPress={() =>
                dispatch(board.id, {
                  type: 'policy/update',
                  policyId: policy.id,
                  patch: { effectiveFrom: addDays(policy.effectiveFrom!, -1) },
                })
              }
            />
            <IconButton
              name="chevron-left"
              label="اليوم التالي"
              onPress={() =>
                dispatch(board.id, {
                  type: 'policy/update',
                  policyId: policy.id,
                  patch: { effectiveFrom: addDays(policy.effectiveFrom!, 1) },
                })
              }
            />
          </>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!text.trim() || text.trim() === policy.text}
        onPress={() => {
          dispatch(board.id, { type: 'policy/update', policyId: policy.id, patch: { text: text.trim() } });
          onDone();
        }}
        style={({ pressed }) => [styles.removeChoice, pressed && styles.pressed]}
      >
        <Icon name="check" size={16} color={colors.primary} />
        <Txt style={styles.removeMove}>حفظ</Txt>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          dispatch(board.id, { type: 'policy/repeal', policyId: policy.id });
          onDone();
        }}
        style={({ pressed }) => [styles.removeChoice, pressed && styles.pressed]}
      >
        <Icon name="archive" size={16} color={colors.danger} />
        <Txt style={styles.removeDelete}>إلغاء العمل بها</Txt>
      </Pressable>
      <Txt style={styles.removeWarn}>تخرج من اللوحة ويبقى سجلّها.</Txt>

      <PolicyHistory policy={policy} />
    </View>
  );
}

const EVENT_WORDS: Record<PolicyEvent['kind'], string> = {
  added: 'أُقرّت',
  edited: 'عُدّلت',
  repealed: 'أُلغي العمل بها',
  restored: 'أُعيد العمل بها',
};

/**
 * Everything that has happened to this rule, newest first.
 *
 * It lives on the rule and not in the board's activity, which keeps the last hundred entries and
 * drops the rest — a rule set in September and amended in October would have lost September.
 */
function PolicyHistory({ policy }: { policy: Policy }) {
  const history = [...(policy.history ?? [])].reverse();
  if (history.length === 0) return null;

  return (
    <View style={styles.history}>
      <Txt style={styles.historyHead}>السجلّ</Txt>
      {history.map((event, i) => (
        <View key={`${event.at}-${i}`} style={styles.historyRow}>
          <Txt style={styles.historyWhen}>{formatLongDate(toISODate(new Date(event.at)))}</Txt>
          <View style={styles.historyBody}>
            <Txt style={styles.historyWhat}>
              {EVENT_WORDS[event.kind]}
              {event.by?.name ? ` — ${event.by.name}` : ''}
            </Txt>
            {event.kind === 'edited' && event.text ? (
              <Txt style={styles.historyWas} numberOfLines={3}>
                كانت: {event.text}
              </Txt>
            ) : null}
          </View>
        </View>
      ))}
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
  policyText: { fontSize: 13.5, lineHeight: 24 },
  policyFoot: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2 },
  from: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  editInput: { fontSize: 15, minHeight: 44 },
  agendaSheet: { maxHeight: 420, paddingHorizontal: 16, paddingBottom: 16 },
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
  sub: { marginTop: 12, gap: 6 },
  subHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2 },
  subTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  subLoose: { fontSize: 13, fontWeight: '700', color: colors.textFaint },
  clauses: { gap: 6, paddingStart: 8 },
  clause: { padding: 10, borderRadius: 8, backgroundColor: colors.list, gap: 3 },
  clauseText: { fontSize: 13.5, lineHeight: 24 },
  clauseFrom: { fontSize: 10.5, color: colors.textFaint },
  clauseAdd: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  clauseInput: { flex: 1, fontSize: 13 },
  wrapChips: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  fromText: { flex: 1, fontSize: 10.5, color: colors.textFaint },
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
  history: { gap: 6, marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  historyHead: { fontSize: 12, fontWeight: '700', color: colors.textSubtle },
  historyRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  historyWhen: { width: 96, fontSize: 11, color: colors.textFaint },
  historyBody: { flex: 1, gap: 2 },
  historyWhat: { fontSize: 12.5 },
  historyWas: { fontSize: 11.5, color: colors.textFaint, lineHeight: 21 },
});
