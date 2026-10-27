import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { formatLongDate, toISODate, todayISO } from '../../lib/dates';
import { uid } from '../../lib/ids';
import { isHeld, movedProgress } from '../../lib/meetings';
import { pluralPolicies, pluralTopics } from '../../lib/text';
import { colors, LIST_GAP, LIST_WIDTH } from '../../lib/theme';
import type { Board, BoardColumn, Meeting, Policy, PolicyEvent } from '../../shared/types';
import { dispatch, startMeeting } from '../../store/actions';
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
}: {
  board: Board;
  column: BoardColumn;
  index: number;
  /** How many columns there are, for the move actions. */
  count: number;
  maxHeight: number;
}) {
  const [sheet, setSheet] = useState<'menu' | 'remove' | 'rename' | 'agenda' | null>(null);
  const [moving, setMoving] = useState<{ id: string; text: string } | null>(null);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [composing, setComposing] = useState(false);

  const siblings = (board.columns ?? []).filter((c) => c.kind === column.kind && c.id !== column.id);
  const items =
    column.kind === 'meetings'
      ? mine(board.meetings ?? [], column, board)
      // A repealed rule leaves the board and keeps its record; it is read from its own history.
      : mine((board.policies ?? []).filter((x) => !x.repealedAt), column, board);

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
      type: 'policy/add',
      policy: { id: uid(), text, columnId: column.id, meetingId: null, at: Date.now() },
    });
  };

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

      <ScrollView style={styles.cards} contentContainerStyle={styles.cardsContent} keyboardShouldPersistTaps="handled">
        {column.kind === 'meetings'
          ? (items as Meeting[]).map((m) => (
              <MeetingCard
                key={m.id}
                board={board}
                meeting={m}
                onMove={siblings.length ? () => setMoving({ id: m.id, text: m.title }) : undefined}
              />
            ))
          : (items as Policy[]).map((p, i) => (
              <PolicyCard
                key={p.id}
                board={board}
                policy={p}
                onEdit={() => setEditing(p)}
                onMove={siblings.length ? () => setMoving({ id: p.id, text: p.text }) : undefined}
                onShift={(delta) => shiftPolicy(board, p, i, items as Policy[], delta)}
                first={i === 0}
                last={i === items.length - 1}
              />
            ))}
      </ScrollView>

      {composing ? (
        <Composer
          placeholder={column.kind === 'meetings' ? 'عنوان الاجتماع' : 'نصّ السياسة'}
          multiline={column.kind === 'policies'}
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
          <Txt style={styles.addText}>{column.kind === 'meetings' ? 'اجتماع جديد' : 'سياسة جديدة'}</Txt>
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
                    : { type: 'policy/update', policyId: moving.id, patch: { columnId: sib.id } },
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

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title="السياسة">
        {editing ? <EditPolicy board={board} policy={editing} onDone={() => setEditing(null)} /> : null}
      </Sheet>
    </View>
  );
}

/**
 * Moves a policy one place within its column.
 *
 * The board holds every policy in one array, so a neighbour in the column may be many places away
 * in it. The swap is made against the neighbour's real index, not the one on screen.
 */
function shiftPolicy(board: Board, policy: Policy, index: number, column: Policy[], delta: number) {
  const neighbour = column[index + delta];
  if (!neighbour) return;
  const to = (board.policies ?? []).findIndex((p) => p.id === neighbour.id);
  if (to < 0) return;
  dispatch(board.id, { type: 'policy/move', policyId: policy.id, toIndex: to });
}

/** Everything filed here — including anything with no column at all, which the first one adopts. */
function mine<T extends { columnId?: string | null }>(all: T[], column: BoardColumn, board: Board): T[] {
  const first = (board.columns ?? []).find((c) => c.kind === column.kind);
  const isFirst = first?.id === column.id;
  return all.filter((x) => (x.columnId ?? null) === column.id || (isFirst && !x.columnId));
}

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

function MeetingCard({
  board,
  meeting,
  onMove,
}: {
  board: Board;
  meeting: Meeting;
  /** Absent when there is nowhere else of this kind to move it to. */
  onMove?: () => void;
}) {
  const held = isHeld(meeting);
  const { moved, total } = movedProgress(board, meeting);

  return (
    <Pressable
      onPress={() => router.push(`/board/${board.id}/meeting/${meeting.id}`)}
      onLongPress={onMove}
      accessibilityRole="button"
      accessibilityHint={onMove ? 'اضغط مطوّلًا لنقله إلى عمود آخر' : undefined}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
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

function PolicyCard({
  board,
  policy,
  onEdit,
  onMove,
  onShift,
  first,
  last,
}: {
  board: Board;
  policy: Policy;
  onEdit: () => void;
  onMove?: () => void;
  onShift: (delta: number) => void;
  first: boolean;
  last: boolean;
}) {
  const meeting = policy.meetingId ? board.meetings?.find((m) => m.id === policy.meetingId) : undefined;
  return (
    <Pressable
      onPress={onEdit}
      onLongPress={onMove}
      accessibilityRole="button"
      accessibilityHint={onMove ? 'اضغط مطوّلًا لنقلها إلى عمود آخر' : undefined}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Txt style={styles.policyText}>{policy.text}</Txt>
      <View style={styles.policyFoot}>
        {meeting ? (
          <View style={styles.from}>
            <Icon name="calendar" size={11} color={colors.textFaint} />
            <Txt style={styles.fromText} numberOfLines={1}>
              {meeting.title}
            </Txt>
          </View>
        ) : (
          <View style={styles.from} />
        )}
        {/* A rule's order is a choice, unlike a meeting's, so it can be put where it reads best. */}
        {onMove ? <IconButton name="move" label="نقل إلى عمود آخر" size={16} onPress={onMove} /> : null}
        <IconButton name="chevron-up" label="أعلى" size={16} onPress={() => onShift(-1)} disabled={first} />
        <IconButton name="chevron-down" label="أسفل" size={16} onPress={() => onShift(1)} disabled={last} />
      </View>
    </Pressable>
  );
}

/**
 * The subjects these meetings keep returning to. Every new meeting starts from them.
 *
 * It lives in the meetings column's own menu rather than on a screen of its own: it is set once
 * and read rarely, and it belongs to the column it shapes.
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
    <ScrollView style={styles.agendaSheet} keyboardShouldPersistTaps="handled">
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

function EditPolicy({ board, policy, onDone }: { board: Board; policy: Policy; onDone: () => void }) {
  const [text, setText] = useState(policy.text);
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
  cards: { flexGrow: 0 },
  cardsContent: { paddingHorizontal: 8, paddingBottom: 4, gap: 8 },
  card: { padding: 10, borderRadius: 10, backgroundColor: colors.surface, gap: 5 },
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
