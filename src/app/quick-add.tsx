import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, IconButton } from '../components/ui/Buttons';
import { BoardBadge } from '../components/ui/Icon';
import { AvoidKeyboard } from '../components/ui/Keyboard';
import { Input, Txt } from '../components/ui/Txt';
import { uid } from '../lib/ids';
import { leaveScreen } from '../lib/nav';
import { colors } from '../lib/theme';
import { dispatch, waitForServer } from '../store/actions';
import { store, useAppState } from '../store/store';
import { CardPicker } from '../widget/CardPicker';
import type { WidgetTarget } from '../widget/model';
import { redrawWidgets } from '../widget/updates';

/**
 * Quick "add a task" sheet, opened by the widget's add button (a widget cannot hold a text field).
 * The widget's card is preselected; the task can go to any other card instead.
 */
export default function QuickAddScreen() {
  const params = useLocalSearchParams<{ boardId?: string; cardId?: string; from?: string }>();
  const fromWidget = params.from === 'widget';
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const ready = useAppState((s) => s.ready);
  const entries = useAppState((s) => s.boards);
  const boards = useMemo(
    () => Object.values(entries).map((e) => e.board).sort((a, b) => b.updatedAt - a.updatedAt),
    [entries],
  );

  const [target, setTarget] = useState<WidgetTarget | null>(
    params.boardId && params.cardId ? { boardId: params.boardId, cardId: params.cardId } : null,
  );
  const board = target ? entries[target.boardId]?.board : undefined;
  const card = target ? board?.cards[target.cardId] : undefined;
  const [picking, setPicking] = useState(false);
  const [text, setText] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [closing, setClosing] = useState(false);

  const add = () => {
    const value = text.trim();
    if (!value || !board || !card) return;
    dispatch(board.id, { type: 'check/add', cardId: card.id, item: { id: uid(), text: value, done: false } });
    setAdded((list) => [...list, value]);
    setText('');
  };

  const close = async () => {
    if (closing) return;
    setClosing(true);
    if (board && added.length > 0) await waitForServer(board.id, 2500);
    await redrawWidgets();
    await store.flush();
    leaveScreen(fromWidget);
  };

  const showPicker = picking || (ready && !card);

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="إغلاق" />
      <AvoidKeyboard style={styles.avoider}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }, showPicker && { height: windowHeight * 0.8 }]}>
          <View style={styles.header}>
            <Txt style={styles.title}>{showPicker ? 'اختر البطاقة' : 'مهمة جديدة'}</Txt>
            <IconButton name="close" label="إغلاق" size={24} onPress={close} />
          </View>

          {!ready ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : showPicker ? (
            <View style={styles.pickerBox}>
              <CardPicker
                boards={boards}
                selected={target ?? undefined}
                onChoose={(next) => {
                  setTarget(next);
                  setPicking(false);
                }}
              />
            </View>
          ) : board && card ? (
            <View style={styles.body}>
              <Pressable
                onPress={() => setPicking(true)}
                accessibilityRole="button"
                accessibilityHint="تغيير البطاقة التي تُضاف إليها المهمة"
                style={({ pressed }) => [styles.target, pressed && styles.pressed]}
              >
                <BoardBadge icon={board.icon} size={34} tint={board.color} />
                <View style={styles.flex}>
                  <Txt style={styles.targetCaption}>إلى البطاقة</Txt>
                  <Txt style={styles.targetTitle} numberOfLines={1}>
                    {card.title}
                  </Txt>
                </View>
                <Txt style={styles.change}>تغيير</Txt>
              </Pressable>

              <View style={styles.row}>
                <Input
                  autoFocus
                  value={text}
                  onChangeText={setText}
                  placeholder="اكتب المهمة…"
                  onSubmitEditing={add}
                  submitBehavior="submit"
                  returnKeyType="done"
                  style={styles.flex}
                />
                <Button title="إضافة" onPress={add} disabled={!text.trim()} />
              </View>

              {added.length > 0 ? (
                <View style={styles.added}>
                  {added.map((task, i) => (
                    <View key={`${task}-${i}`} style={styles.addedRow}>
                      <Icon name="check" size={16} color={colors.success} />
                      <Txt style={styles.addedText} numberOfLines={1}>
                        {task}
                      </Txt>
                    </View>
                  ))}
                </View>
              ) : null}

              <Button title="تم" variant={added.length ? 'primary' : 'secondary'} onPress={close} loading={closing} />
            </View>
          ) : null}
        </View>
      </AvoidKeyboard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.backdrop },
  avoider: { width: '100%', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.page,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
  },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  loading: { marginVertical: 32 },
  pickerBox: { flex: 1 },
  body: { gap: 12, paddingHorizontal: 16, paddingTop: 4 },
  target: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    boxShadow: '0px 1px 2px rgba(9,30,66,0.12)',
  },
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  targetCaption: { fontSize: 12, color: colors.textFaint },
  targetTitle: { fontSize: 15, fontWeight: '600' },
  change: { fontSize: 14, fontWeight: '600', color: colors.primary },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  added: { gap: 6, paddingHorizontal: 4 },
  addedRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  addedText: { flex: 1, fontSize: 14, color: colors.textSubtle },
});
