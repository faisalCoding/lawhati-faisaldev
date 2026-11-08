import { useRef, useState } from 'react';
import { Platform, StyleSheet, View, type TextInput } from 'react-native';

import { addDays, describeDistance, formatLongDate, todayISO } from '../../lib/dates';
import { uid } from '../../lib/ids';
import { pluralTasks } from '../../lib/text';
import { colors } from '../../lib/theme';
import type { Board, ChecklistItem } from '../../shared/types';
import { dispatch } from '../../store/actions';
import { Button, Chip, IconButton } from '../ui/Buttons';
import { useModalAutoFocus } from '../ui/Keyboard';
import { PromptForm } from '../ui/Sheet';
import { MonthPicker } from '../ui/MonthPicker';
import { Input, Txt } from '../ui/Txt';

/** What a task listed on a card's face opens: its text to change, or (no task) a field that adds tasks. */
export function TaskSheet({
  board,
  cardId,
  itemId,
  onClose,
}: {
  board: Board;
  cardId: string;
  itemId: string | null;
  onClose: () => void;
}) {
  // As the sheet opened: deleting the task closes the sheet, which keeps showing it while it fades out.
  const [found] = useState(() => {
    const card = board.cards[cardId];
    return { card: card != null, item: itemId ? (card?.checklist.find((i) => i.id === itemId) ?? null) : null };
  });
  const { item } = found;
  if (!found.card || (itemId && !item)) {
    return (
      <View style={styles.form}>
        <Txt style={styles.muted}>
          {found.card ? 'هذه المهمة لم تعد موجودة' : 'هذه البطاقة لم تعد موجودة'}، ربما حذفها أحد أعضاء الفريق.
        </Txt>
        <Button title="إغلاق" variant="secondary" onPress={onClose} />
      </View>
    );
  }
  if (!item) return <AddTasks boardId={board.id} cardId={cardId} onClose={onClose} />;
  return (
    <View style={styles.form}>
      <PromptForm
        initial={item.text}
        placeholder="نص المهمة"
        onSubmit={(text) => {
          if (text !== item.text) {
            dispatch(board.id, { type: 'check/update', cardId, itemId: item.id, patch: { text } });
          }
          onClose();
        }}
        onCancel={onClose}
      />
      <TaskDueEditor board={board} cardId={cardId} itemId={item.id} />

      <Button
        title="حذف المهمة"
        icon="trash"
        variant="danger"
        onPress={() => {
          dispatch(board.id, { type: 'check/remove', cardId, itemId: item.id });
          onClose();
        }}
      />
    </View>
  );
}

/**
 * When this one task is due — from the board's card face and from inside the card alike.
 *
 * A card often stands for a week of work, and one date on it could only ever be the latest of the
 * tasks inside. Each task carries its own: today, tomorrow, a week out, or any day from the month
 * picker. The task is read from the board as it is now, not as it was when the sheet opened, so a
 * date just chosen shows at once.
 */
export function TaskDueEditor({ board, cardId, itemId }: { board: Board; cardId: string; itemId: string }) {
  const today = todayISO();
  const [custom, setCustom] = useState(false);
  const item: ChecklistItem | undefined = board.cards[cardId]?.checklist.find((i) => i.id === itemId);
  if (!item) return null;
  const set = (due: string | null) => dispatch(board.id, { type: 'check/update', cardId, itemId, patch: { due } });

  return (
    <View style={styles.due}>
      {item.due ? (
        <View style={styles.dueRow}>
          <IconButton name="chevron-right" label="اليوم السابق" onPress={() => set(addDays(item.due!, -1))} />
          <View style={styles.dueBox}>
            <Txt style={styles.dueText}>{formatLongDate(item.due)}</Txt>
            <Txt style={styles.dueHint}>{describeDistance(item.due)}</Txt>
          </View>
          <IconButton name="chevron-left" label="اليوم التالي" onPress={() => set(addDays(item.due!, 1))} />
        </View>
      ) : null}
      <View style={styles.dueChips}>
        <Chip label="اليوم" selected={item.due === today} onPress={() => set(today)} />
        <Chip label="غدًا" selected={item.due === addDays(today, 1)} onPress={() => set(addDays(today, 1))} />
        <Chip label="بعد أسبوع" selected={item.due === addDays(today, 7)} onPress={() => set(addDays(today, 7))} />
        <Chip label="تاريخ مخصص" icon="calendar" selected={custom} onPress={() => setCustom((on) => !on)} />
        {item.due ? <Chip label="إزالة الموعد" icon="close" onPress={() => set(null)} /> : null}
      </View>
      {custom ? (
        <MonthPicker
          value={item.due ?? null}
          onPick={(due) => {
            set(due);
            setCustom(false);
          }}
        />
      ) : null}
    </View>
  );
}

/** Adds tasks to a card one after another: the field stays open after each. */
function AddTasks({ boardId, cardId, onClose }: { boardId: string; cardId: string; onClose: () => void }) {
  const [text, setText] = useState('');
  const [added, setAdded] = useState(0);
  const inputRef = useRef<TextInput>(null);
  useModalAutoFocus(inputRef);

  const add = () => {
    const value = text.trim();
    if (!value) return;
    dispatch(boardId, { type: 'check/add', cardId, item: { id: uid(), text: value, done: false } });
    setAdded((n) => n + 1);
    setText('');
  };

  return (
    <View style={styles.form}>
      <Input
        ref={inputRef}
        autoFocus={Platform.OS !== 'android'}
        value={text}
        onChangeText={setText}
        placeholder="اكتب المهمة…"
        onSubmitEditing={add}
        submitBehavior="submit"
        returnKeyType="done"
      />
      <Txt style={styles.muted}>
        {added
          ? `أُضيفت ${pluralTasks(added)}. اكتب التالية، أو اضغط «تم».`
          : 'تبقى الخانة مفتوحة بعد كل مهمة لتكتب التالية.'}
      </Txt>
      <View style={styles.row}>
        <Button title="إضافة" icon="plus" onPress={add} disabled={!text.trim()} style={styles.flex} />
        <Button title="تم" variant="secondary" onPress={onClose} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12, paddingTop: 4 },
  row: { flexDirection: 'row-reverse', gap: 10 },
  flex: { flex: 1 },
  muted: { fontSize: 13, color: colors.textFaint },
  due: { gap: 8 },
  dueRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  dueBox: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: colors.list },
  dueText: { fontSize: 14.5, fontWeight: '700' },
  dueHint: { fontSize: 11.5, color: colors.textSubtle },
  dueChips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
});
