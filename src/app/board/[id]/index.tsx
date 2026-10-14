import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BoardCanvas } from '../../../components/board/BoardCanvas';
import { ButtonsList } from '../../../components/board/ButtonsList';
import { FilterPanel } from '../../../components/board/FilterPanel';
import { SelectionBar } from '../../../components/board/SelectionBar';
import { TaskSheet } from '../../../components/board/TaskSheet';
import { Button, Icon, IconButton } from '../../../components/ui/Buttons';
import { BoardBadge } from '../../../components/ui/Icon';
import { AvoidKeyboard } from '../../../components/ui/Keyboard';
import { Sheet } from '../../../components/ui/Sheet';
import { Txt } from '../../../components/ui/Txt';
import { cardMatcher, countChoices, EMPTY_FILTER, type BoardFilter } from '../../../lib/filter';
import { goBack } from '../../../lib/nav';
import { pluralCards } from '../../../lib/text';
import { colors } from '../../../lib/theme';
import { useMe } from '../../../members/session';
import { useBoardFocus } from '../../../notifications/team';
import { assigneesOf } from '../../../shared/cards';
import type { Card, CardLink } from '../../../shared/types';
import { redoMine, undoMine } from '../../../store/activity';
import { pressButton } from '../../../store/buttons';
import { inBoardOrder } from '../../../store/cardOps';
import { store, useAppState, useBoardEntry } from '../../../store/store';

export default function BoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const narrow = useWindowDimensions().width < 480;
  const ready = useAppState((s) => s.ready);
  const entry = useBoardEntry(id);
  const code = entry?.sync?.code;
  const connection = useAppState((s) => s.connection);
  const online = useAppState((s) => (code ? s.presence[code] : undefined));
  // No team notifications about this board while it is open.
  useBoardFocus(id);
  // The board's filters, as in Trello.
  const me = useMe();
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);
  const [filtering, setFiltering] = useState(false);
  const current = entry?.board;
  const cards = current?.cards;
  const labels = current?.labels;
  const powerUps = current?.powerUps;
  const people = useMemo(() => (cards ? assigneesOf(Object.values(cards)) : []), [cards]);
  // Rebuilt when what it reads changes (the labels and Power-Ups), not on every card edit.
  const matcher = useMemo(
    () => (labels && powerUps ? cardMatcher(filter, { labels, powerUps }, me?.id ?? null) : null),
    [filter, labels, powerUps, me?.id],
  );
  const visible = useCallback((card: Card) => !matcher || matcher(card), [matcher]);
  const counts = useMemo(() => {
    const all = current
      ? current.lists.flatMap((l) => l.cardIds.map((cardId) => current.cards[cardId]).filter(Boolean))
      : [];
    return { total: all.length, shown: matcher ? all.filter(matcher).length : all.length };
  }, [current, matcher]);
  const choices = countChoices(filter);

  // Selecting cards (null when not selecting), to act on them together.
  const [selection, setSelection] = useState<Set<string> | null>(null);
  // The selection bar's height: the board ends above it, so no card hides behind it.
  const [barHeight, setBarHeight] = useState(0);
  const toggleSelect = useCallback(
    (cardId: string) =>
      setSelection((s) => {
        if (!s) return s;
        const next = new Set(s);
        if (!next.delete(cardId)) next.add(cardId);
        return next;
      }),
    [],
  );
  const selectList = useCallback(
    (listId: string, on: boolean) => {
      const board = store.get().boards[id]?.board;
      const list = board?.lists.find((l) => l.id === listId);
      if (!board || !list) return;
      const ids = list.cardIds.filter((cardId) => board.cards[cardId] && visible(board.cards[cardId]));
      setSelection((s) => {
        const next = new Set(s ?? []);
        for (const cardId of ids) {
          if (on) next.add(cardId);
          else next.delete(cardId);
        }
        return next;
      });
    },
    [id, visible],
  );
  // Android's back button ends the selection before it leaves the board.
  useEffect(() => {
    if (!selection) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelection(null);
      return true;
    });
    return () => sub.remove();
  }, [selection]);

  // On the web, Ctrl+Z (⌘Z) undoes my latest change on this board, and Ctrl+Shift+Z or Ctrl+Y redoes
  // it; while typing in a field, they stay the field's own.
  useEffect(() => {
    const doc = Platform.OS === 'web' ? globalThis.document : undefined;
    if (!doc || !id) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoMine(id);
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redoMine(id);
      }
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [id]);

  // The card whose buttons are listed, from the button on its face.
  const [buttonsFor, setButtonsFor] = useState<string | null>(null);
  const openButtons = useCallback((cardId: string) => setButtonsFor(cardId), []);
  // A task listed on a card's face being edited, or (itemId null) tasks being added to the card. It
  // stays set while the sheet fades out, so the sheet does not empty first.
  const [taskFor, setTaskFor] = useState<{ cardId: string; itemId: string | null } | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const openTask = useCallback((cardId: string, itemId: string | null) => {
    setTaskFor({ cardId, itemId });
    setTaskOpen(true);
  }, []);

  const openCard = useCallback((cardId: string) => router.push(`/board/${id}/card/${cardId}`), [id]);
  // A linked board this phone doesn't have yet can be joined with its code.
  const openLink = useCallback((link: CardLink) => {
    if (store.get().boards[link.boardId]) router.push(`/board/${link.boardId}`);
    else if (link.code) router.push({ pathname: '/join', params: { code: link.code } });
  }, []);

  if (!entry) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        {ready ? (
          <>
            <Txt style={styles.missing}>هذه اللوحة غير موجودة على هذا الجهاز.</Txt>
            <Button title="العودة إلى لوحاتي" onPress={() => router.replace('/')} />
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const { board } = entry;
  // On a phone the header is short of room: just the number of people here.
  const live = code
    ? connection === 'online'
      ? narrow
        ? String(online ?? 1)
        : `مباشر · ${online ?? 1}`
      : narrow
        ? null
        : 'غير متصل'
    : null;

  return (
    <View style={[styles.screen, { backgroundColor: board.color }]}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <IconButton name="chevron-right" label="رجوع" color="#FFFFFF" size={26} onPress={goBack} />
        <Pressable
          style={styles.titleBox}
          onPress={() => router.push(`/board/${id}/settings`)}
          accessibilityRole="button"
          accessibilityHint="يفتح إعدادات اللوحة"
        >
          <BoardBadge icon={board.icon} size={30} />
          <Txt style={styles.title} numberOfLines={1}>
            {board.title}
          </Txt>
          {code ? (
            <View
              style={styles.live}
              accessibilityLabel={connection === 'online' ? `مباشر، ${online ?? 1} هنا` : 'غير متصل'}
            >
              <Icon name={connection === 'online' ? 'users' : 'cloud-off'} size={14} color="#FFFFFF" />
              {live ? <Txt style={styles.liveText}>{live}</Txt> : null}
            </View>
          ) : null}
        </Pressable>
        <IconButton
          name="history"
          label="سجل الأحداث"
          color="#FFFFFF"
          onPress={() => router.push(`/board/${id}/activity`)}
        />
        <IconButton
          name={selection ? 'close' : 'select'}
          label={selection ? 'إنهاء التحديد' : 'تحديد بطاقات'}
          color="#FFFFFF"
          onPress={() => setSelection((s) => (s ? null : new Set()))}
        />
        <View>
          <IconButton
            name="filter"
            label={choices ? `الفلاتر: ${choices}` : 'الفلاتر'}
            color="#FFFFFF"
            style={choices ? styles.filterOn : undefined}
            onPress={() => setFiltering(true)}
          />
          {choices ? (
            <View style={styles.filterCount} pointerEvents="none">
              <Txt style={styles.filterCountText}>{choices}</Txt>
            </View>
          ) : null}
        </View>
        <IconButton
          name="settings"
          label="إعدادات اللوحة والإضافات"
          color="#FFFFFF"
          onPress={() => router.push(`/board/${id}/settings`)}
        />
      </View>
      {matcher ? (
        <View style={styles.filterBar}>
          <Pressable
            style={({ pressed }) => [styles.filterOpen, pressed && styles.filterOpenPressed]}
            onPress={() => setFiltering(true)}
            accessibilityRole="button"
            accessibilityHint="يفتح الفلاتر"
          >
            <Icon name="filter" size={16} color="#FFFFFF" />
            <Txt style={styles.filterText} numberOfLines={1}>
              {counts.shown
                ? `تطابق ${pluralCards(counts.shown)} من ${counts.total} · السحب متوقف`
                : 'لا بطاقات تطابق الفلاتر'}
            </Txt>
          </Pressable>
          <Pressable
            onPress={() => setFilter(EMPTY_FILTER)}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.clear, pressed && styles.clearPressed]}
          >
            <Txt style={styles.clearText}>مسح</Txt>
          </Pressable>
        </View>
      ) : null}
      <AvoidKeyboard style={styles.flex}>
        <View style={[styles.flex, selection && { paddingBottom: barHeight }]}>
          <BoardCanvas
            board={board}
            onOpenCard={openCard}
            onOpenLink={openLink}
            onOpenButtons={openButtons}
            onOpenTask={openTask}
            cardFilter={matcher}
            selection={selection}
            onToggleSelect={toggleSelect}
            onSelectList={selectList}
          />
        </View>
      </AvoidKeyboard>

      {selection ? (
        <SelectionBar
          board={board}
          selected={inBoardOrder(board, selection)}
          visible={visible}
          onSelect={(ids) => setSelection(new Set(ids))}
          onClose={() => setSelection(null)}
          onHeight={setBarHeight}
        />
      ) : null}

      <Sheet visible={buttonsFor !== null} onClose={() => setButtonsFor(null)} title="أزرار البطاقة">
        <ButtonsList
          board={board}
          onPress={(button) => {
            const cardId = buttonsFor;
            setButtonsFor(null);
            if (cardId) pressButton(board.id, [cardId], button);
          }}
          onCreate={() => {
            setButtonsFor(null);
            router.push(`/board/${id}/button`);
          }}
        />
      </Sheet>

      <Sheet
        visible={taskOpen}
        onClose={() => setTaskOpen(false)}
        title={taskFor?.itemId ? 'تعديل المهمة' : 'مهمة جديدة'}
      >
        {taskFor ? (
          <TaskSheet
            key={`${taskFor.cardId}:${taskFor.itemId}`}
            board={board}
            cardId={taskFor.cardId}
            itemId={taskFor.itemId}
            onClose={() => setTaskOpen(false)}
          />
        ) : null}
      </Sheet>

      <Sheet visible={filtering} onClose={() => setFiltering(false)} title="الفلاتر">
        <FilterPanel
          board={board}
          filter={filter}
          people={people}
          shown={counts.shown}
          total={counts.total}
          onChange={setFilter}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  missing: { fontSize: 16, textAlign: 'center' },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  titleBox: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  title: { flexShrink: 1, color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  live: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  liveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  filterOn: { backgroundColor: 'rgba(255,255,255,0.28)' },
  filterCount: {
    position: 'absolute',
    top: -2,
    left: -2,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  filterCountText: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.primary },
  filterBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingRight: 6,
    paddingLeft: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  filterOpen: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  filterOpenPressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  filterText: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  clear: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.22)' },
  clearPressed: { backgroundColor: 'rgba(255,255,255,0.34)' },
  clearText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
