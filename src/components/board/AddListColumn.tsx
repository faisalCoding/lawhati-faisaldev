import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, LIST_GAP, LIST_WIDTH } from '../../lib/theme';
import type { BoardColumnKind } from '../../shared/types';
import { Button, Icon, IconButton } from '../ui/Buttons';
import type { IconName } from '../ui/iconData';
import { Input, Txt } from '../ui/Txt';

/**
 * Adds a column at the end of the board.
 *
 * With meetings on, it asks what kind first — one button that asks beats three buttons that do
 * not, and the three kinds are rarely wanted at the same moment.
 */
export function AddListColumn({
  onAdd,
  onAddColumn,
}: {
  onAdd: (title: string) => void;
  /** Absent when the board has meetings off: then only a task list can be added. */
  onAddColumn?: (title: string, kind: BoardColumnKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'list' | BoardColumnKind>('list');
  const [text, setText] = useState('');

  const submit = () => {
    const title = text.trim();
    if (!title) return;
    if (kind === 'list') onAdd(title);
    else onAddColumn?.(title, kind);
    setText('');
  };
  const cancel = () => {
    setOpen(false);
    setKind('list');
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
        <Txt style={styles.closedText}>{onAddColumn ? 'إضافة عمود' : 'إضافة قائمة'}</Txt>
      </Pressable>
    );
  }

  return (
    <View style={[styles.column, styles.open]}>
      {onAddColumn ? (
        <View style={styles.kinds}>
          {KINDS.map((k) => (
            <Pressable
              key={k.value}
              accessibilityRole="button"
              aria-selected={kind === k.value}
              onPress={() => setKind(k.value)}
              style={({ pressed }) => [styles.kind, kind === k.value && styles.kindOn, pressed && styles.kindPressed]}
            >
              <Icon name={k.icon} size={14} color={kind === k.value ? colors.surface : colors.textSubtle} />
              <Txt style={[styles.kindText, kind === k.value && styles.kindTextOn]}>{k.label}</Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Input
        autoFocus
        value={text}
        onChangeText={setText}
        placeholder={kind === 'list' ? 'اسم القائمة…' : 'اسم العمود…'}
        onSubmitEditing={submit}
        submitBehavior="submit"
        returnKeyType="done"
        style={styles.input}
        onBlur={() => {
          if (!text.trim()) cancel();
        }}
      />
      <View style={styles.row}>
        <Button title={kind === 'list' ? 'إضافة القائمة' : 'إضافة العمود'} compact onPress={submit} disabled={!text.trim()} />
        <IconButton name="close" label="إلغاء" onPress={cancel} />
      </View>
    </View>
  );
}

const KINDS: { value: 'list' | BoardColumnKind; label: string; icon: IconName }[] = [
  { value: 'list', label: 'مهام', icon: 'kanban' },
  { value: 'meetings', label: 'اجتماعات', icon: 'calendar' },
  { value: 'policies', label: 'سياسات', icon: 'book' },
];

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
  kinds: { flexDirection: 'row-reverse', gap: 6, marginBottom: 8 },
  kind: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: colors.list,
  },
  kindOn: { backgroundColor: colors.primary },
  kindPressed: { opacity: 0.75 },
  kindText: { fontSize: 12, fontWeight: '700', color: colors.textSubtle },
  kindTextOn: { color: colors.surface },
  open: { backgroundColor: colors.list, padding: 8, gap: 8 },
  input: { fontSize: 15, borderColor: colors.primary },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
});
