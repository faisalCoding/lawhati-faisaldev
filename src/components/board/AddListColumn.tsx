import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, LIST_GAP, LIST_WIDTH } from '../../lib/theme';
import { Button, Icon, IconButton } from '../ui/Buttons';
import { Input, Txt } from '../ui/Txt';

export function AddListColumn({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const submit = () => {
    const title = text.trim();
    if (!title) return;
    onAdd(title);
    setText('');
  };
  const cancel = () => {
    setOpen(false);
    setText('');
  };

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.column, styles.closed, pressed && styles.closedPressed]}
      >
        <Icon name="plus" size={20} color="#FFFFFF" />
        <Txt style={styles.closedText}>إضافة قائمة</Txt>
      </Pressable>
    );
  }

  return (
    <View style={[styles.column, styles.open]}>
      <Input
        autoFocus
        value={text}
        onChangeText={setText}
        placeholder="اسم القائمة…"
        onSubmitEditing={submit}
        submitBehavior="submit"
        returnKeyType="done"
        style={styles.input}
        onBlur={() => {
          if (!text.trim()) cancel();
        }}
      />
      <View style={styles.row}>
        <Button title="إضافة القائمة" compact onPress={submit} disabled={!text.trim()} />
        <IconButton name="close" label="إلغاء" onPress={cancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    width: LIST_WIDTH,
    marginHorizontal: LIST_GAP / 2,
    borderRadius: 14,
    transform: [{ scaleX: -1 }],
  },
  closed: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  closedPressed: { backgroundColor: 'rgba(255,255,255,0.34)' },
  closedText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  open: { backgroundColor: colors.list, padding: 8, gap: 8 },
  input: { fontSize: 15, borderColor: colors.primary },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
});
