import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { formatLongDate, todayISO } from '../../lib/dates';
import { uid } from '../../lib/ids';
import { filingProgress, isHeld } from '../../lib/meetings';
import { pluralPolicies, pluralTopics } from '../../lib/text';
import { colors, LIST_GAP, LIST_WIDTH } from '../../lib/theme';
import type { Board, BoardColumn, Meeting, Policy } from '../../shared/types';
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
  const [sheet, setSheet] = useState<'menu' | 'remove' | null>(null);
  const [composing, setComposing] = useState(false);

  const siblings = (board.columns ?? []).filter((c) => c.kind === column.kind && c.id !== column.id);
  const items =
    column.kind === 'meetings'
      ? mine(board.meetings ?? [], column, board)
      : mine(board.policies ?? [], column, board);

  const menu: SheetAction[] = [
    {
      label: 'إعادة التسمية',
      icon: 'pencil',
      onPress: () => {
        setSheet(null);
        setComposing(false);
      },
    },
  ];
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
          ? (items as Meeting[]).map((m) => <MeetingCard key={m.id} board={board} meeting={m} />)
          : (items as Policy[]).map((p) => <PolicyCard key={p.id} board={board} policy={p} />)}
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
    </View>
  );
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

function MeetingCard({ board, meeting }: { board: Board; meeting: Meeting }) {
  const held = isHeld(meeting);
  const { filed, total } = filingProgress(board, meeting);

  return (
    <Pressable
      onPress={() => router.push(`/board/${board.id}/meeting/${meeting.id}`)}
      accessibilityRole="button"
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

      <Txt style={styles.cardMeta}>
        {formatLongDate(meeting.date)} · {pluralTopics(meeting.topics.length)}
        {meeting.attendees.length ? ` · ${meeting.attendees.length} حضورًا` : ''}
      </Txt>

      {total > 0 ? (
        <View style={styles.bar}>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.round((filed / total) * 100)}%` },
                filed === total && styles.barFillDone,
              ]}
            />
          </View>
          <Txt style={[styles.barText, filed === total && styles.barTextDone]}>
            {filed === total ? 'فُرِّغ' : `${filed}/${total}`}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

function PolicyCard({ board, policy }: { board: Board; policy: Policy }) {
  const meeting = policy.meetingId ? board.meetings?.find((m) => m.id === policy.meetingId) : undefined;
  return (
    <Pressable
      onPress={() => router.push(`/board/${board.id}/policies`)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Txt style={styles.policyText}>{policy.text}</Txt>
      {meeting ? (
        <View style={styles.from}>
          <Icon name="calendar" size={11} color={colors.textFaint} />
          <Txt style={styles.fromText} numberOfLines={1}>
            {meeting.title}
          </Txt>
        </View>
      ) : null}
    </Pressable>
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
  cardMeta: { fontSize: 11, color: colors.textFaint },
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
  from: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
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
});
