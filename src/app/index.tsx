import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppLogo } from '../components/ui/AppLogo';
import { Avatar } from '../components/ui/Avatar';
import { Button, Icon, IconButton } from '../components/ui/Buttons';
import { BoardBadge } from '../components/ui/Icon';
import { ActionList, ConfirmForm, Sheet } from '../components/ui/Sheet';
import { Txt } from '../components/ui/Txt';
import { pluralCards, pluralLists, pluralTasks } from '../lib/text';
import { colors } from '../lib/theme';
import { countOpenAssigned, findAssigned } from '../members/assigned';
import { asAssignee, useMe } from '../members/session';
import { deleteBoard } from '../store/actions';
import { useAppState, type BoardEntry } from '../store/store';

const MAX_WIDTH = 960;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const ready = useAppState((s) => s.ready);
  const boardsById = useAppState((s) => s.boards);
  const order = useAppState((s) => s.order);
  const presence = useAppState((s) => s.presence);
  const entries = useMemo(() => order.map((id) => boardsById[id]).filter(Boolean), [order, boardsById]);

  const [menuFor, setMenuFor] = useState<BoardEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeMenu = () => {
    setMenuFor(null);
    setConfirmDelete(false);
  };

  const contentWidth = Math.min(width, MAX_WIDTH) - 32;
  const columns = contentWidth >= 820 ? 4 : contentWidth >= 560 ? 3 : 2;
  const tileWidth = (contentWidth - (columns - 1) * 12) / columns;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.inner}>
          <View style={styles.headerRow}>
            <AppLogo size={52} />
            <View style={styles.headerText}>
              <Txt style={styles.h1}>لوحاتي</Txt>
              <Txt style={styles.subtitle}>نظّم أي شيء بالقوائم والبطاقات</Txt>
            </View>
            <AccountButton />
            <IconButton name="settings" label="الإعدادات" size={24} onPress={() => router.push('/settings')} />
          </View>

          <View style={styles.actions}>
            <Button title="لوحة جديدة" icon="plus" onPress={() => router.push('/new-board')} style={styles.flex} />
            <Button
              title="انضمام برمز"
              icon="join"
              variant="secondary"
              onPress={() => router.push('/join')}
              style={styles.flex}
            />
          </View>

          <AssignedSummary />

          {!ready ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : entries.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="kanban" size={36} color={colors.primary} />
              </View>
              <Txt style={styles.emptyTitle}>لا توجد لوحات بعد</Txt>
              <Txt style={styles.emptyText}>أنشئ لوحة من قالب جاهز، أو انضم إلى لوحة فريقك برمزها.</Txt>
            </View>
          ) : (
            <View style={styles.grid}>
              {entries.map((entry) => (
                <BoardTile
                  key={entry.board.id}
                  entry={entry}
                  width={tileWidth}
                  online={entry.sync ? presence[entry.sync.code] : undefined}
                  onLongPress={() => setMenuFor(entry)}
                />
              ))}
            </View>
          )}

          <View style={styles.freeNote}>
            <Icon name="sparkles" size={16} color={colors.textFaint} />
            <Txt style={styles.freeNoteText}>مجاني بالكامل: لوحات وقوائم وبطاقات بلا حدود.</Txt>
          </View>
        </View>
      </ScrollView>

      <Sheet visible={menuFor !== null} onClose={closeMenu} title={menuFor?.board.title}>
        {menuFor && !confirmDelete ? (
          <ActionList
            actions={[
              {
                label: 'فتح اللوحة',
                icon: 'kanban',
                onPress: () => {
                  const id = menuFor.board.id;
                  closeMenu();
                  router.push(`/board/${id}`);
                },
              },
              {
                label: 'إعدادات اللوحة',
                icon: 'settings',
                onPress: () => {
                  const id = menuFor.board.id;
                  closeMenu();
                  router.push(`/board/${id}/settings`);
                },
              },
              {
                label: 'حذف اللوحة',
                icon: 'trash',
                destructive: true,
                hint: menuFor.sync ? 'تُحذف من هذا الجهاز فقط، وتبقى لدى فريقك' : undefined,
                onPress: () => setConfirmDelete(true),
              },
            ]}
          />
        ) : null}
        {menuFor && confirmDelete ? (
          <ConfirmForm
            message={
              menuFor.sync
                ? 'ستُحذف اللوحة من هذا الجهاز، ويبقى بإمكانك الانضمام إليها مجددًا برمزها.'
                : 'ستُحذف اللوحة وكل ما فيها نهائيًا.'
            }
            confirmLabel="حذف"
            onConfirm={() => {
              deleteBoard(menuFor.board.id);
              closeMenu();
            }}
            onCancel={closeMenu}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

function BoardTile({
  entry,
  width,
  online,
  onLongPress,
}: {
  entry: BoardEntry;
  width: number;
  online: number | undefined;
  onLongPress: () => void;
}) {
  const { board, sync } = entry;
  const cardCount = Object.keys(board.cards).length;
  return (
    <Pressable
      onPress={() => router.push(`/board/${board.id}`)}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={board.title}
      style={({ pressed }) => [styles.tile, { width, backgroundColor: board.color }, pressed && styles.tilePressed]}
    >
      <View style={styles.tileTop}>
        <BoardBadge icon={board.icon} />
        {sync ? (
          <View style={styles.liveBadge}>
            <View style={[styles.liveDot, { backgroundColor: online ? '#7EE2B8' : 'rgba(255,255,255,0.6)' }]} />
            <Txt style={styles.liveText}>{online ? `مباشر · ${online}` : 'مشتركة'}</Txt>
          </View>
        ) : null}
      </View>
      <View>
        <Txt style={styles.tileTitle} numberOfLines={2}>
          {board.title}
        </Txt>
        <Txt style={styles.tileMeta}>
          {pluralLists(board.lists.length)} · {pluralCards(cardCount)}
        </Txt>
      </View>
    </Pressable>
  );
}

/** Signed in: the employee's avatar, which opens what is assigned to them. Otherwise: sign in. */
function AccountButton() {
  const me = useMe();
  if (!me) {
    return <IconButton name="user" label="الدخول برمز الموظف" size={24} onPress={() => router.push('/sign-in')} />;
  }
  return (
    <Pressable
      onPress={() => router.push('/assigned')}
      accessibilityRole="button"
      accessibilityLabel={`${me.name}: المسندة إليّ`}
      hitSlop={6}
      style={({ pressed }) => [styles.account, pressed && { opacity: 0.6 }]}
    >
      <Avatar person={asAssignee(me)} size={32} />
    </Pressable>
  );
}

/** What is still open among the cards and tasks assigned to the signed-in employee. */
function AssignedSummary() {
  const me = useMe();
  const boards = useAppState((s) => s.boards);
  const order = useAppState((s) => s.order);
  const open = useMemo(() => (me ? countOpenAssigned(findAssigned(boards, order, me)) : null), [boards, order, me]);
  if (!open) return null;
  const parts = [open.cards ? pluralCards(open.cards) : null, open.tasks ? pluralTasks(open.tasks) : null].filter(
    Boolean,
  );
  return (
    <Pressable
      onPress={() => router.push('/assigned')}
      accessibilityRole="button"
      style={({ pressed }) => [styles.assigned, pressed && { opacity: 0.7 }]}
    >
      <Icon name="user-check" size={20} color={colors.primary} />
      <Txt style={styles.assignedText}>
        {parts.length ? `المسندة إليّ: ${parts.join('، ')}` : 'لا شيء مسند إليك الآن'}
      </Txt>
      <Icon name="chevron-left" size={18} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  account: { padding: 2 },
  assigned: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#E9F2FF',
  },
  assignedText: { flex: 1, fontSize: 15, color: colors.primary, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.page },
  scroll: { paddingHorizontal: 16, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_WIDTH - 32 },
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 18 },
  headerText: { flex: 1 },
  h1: { fontSize: 30, fontWeight: '800' },
  subtitle: { fontSize: 15, color: colors.textSubtle, marginTop: 2 },
  actions: { flexDirection: 'row-reverse', gap: 10, marginBottom: 22 },
  loading: { marginTop: 40 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 },
  tile: {
    minHeight: 118,
    gap: 10,
    borderRadius: 16,
    padding: 14,
    justifyContent: 'space-between',
    boxShadow: '0px 2px 6px rgba(9,30,66,0.18)',
  },
  tilePressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  tileTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  tileTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  tileMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  liveBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#E9F2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 15, color: colors.textSubtle, textAlign: 'center' },
  freeNote: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 28 },
  freeNoteText: { fontSize: 13, color: colors.textFaint },
});
