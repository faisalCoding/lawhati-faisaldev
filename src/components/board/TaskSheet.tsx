import { useRef, useState } from 'react';
import { Platform, StyleSheet, View, type TextInput } from 'react-native';

import { uid } from '../../lib/ids';
import { pluralTasks } from '../../lib/text';
import { colors } from '../../lib/theme';
import type { Board } from '../../shared/types';
import { dispatch } from '../../store/actions';
import { Button } from '../ui/Buttons';
import { useModalAutoFocus } from '../ui/Keyboard';
import { PromptForm } from '../ui/Sheet';
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
});
