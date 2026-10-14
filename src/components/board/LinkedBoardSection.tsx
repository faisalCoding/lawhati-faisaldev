import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { boardProgress } from '../../lib/progress';
import { syncErrorMessage } from '../../lib/syncErrors';
import { pluralCards } from '../../lib/text';
import { colors } from '../../lib/theme';
import type { Board, Card, CardLink } from '../../shared/types';
import { createBoard, shareBoard } from '../../store/actions';
import { store, useAppState, useBoardEntry, type BoardEntry } from '../../store/store';
import { currentServerUrl } from '../../store/sync';
import { Button, Icon, type IconName } from '../ui/Buttons';
import { BoardBadge } from '../ui/Icon';
import { Section } from '../ui/Layout';
import { Sheet } from '../ui/Sheet';
import { Txt } from '../ui/Txt';

/**
 * The board a card stands for (a sub-project, say), in the card screen: its progress and a way to
 * open it, or a way to pick one. On the board the card then shows the same at a glance.
 */
export function LinkedBoardSection({
  board,
  card,
  shared,
  onChange,
}: {
  board: Board;
  card: Card;
  /** The card's own board is shared with a team. */
  shared: boolean;
  onChange: (link: CardLink | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const link = card.link ?? null;
  const linkedEntry = useBoardEntry(link?.boardId);
  const linked = linkedEntry?.board;
  const linkedCode = linkedEntry?.sync?.code ?? null;

  // Keep the stored name and code current: teammates who don't have the board rely on them.
  useEffect(() => {
    if (link && linked && (link.title !== linked.title || link.code !== linkedCode)) {
      onChange({ boardId: linked.id, code: linkedCode, title: linked.title });
    }
  }, [link, linked, linkedCode, onChange]);

  if (!link) {
    return (
      <Section title="لوحة مرتبطة" icon="link">
        <Txt style={styles.hint}>
          اربط البطاقة بلوحة أخرى، كمشروع فرعي، فيظهر على البطاقة اسمها وعدد المنجز فيها وزر ينقلك إليها.
        </Txt>
        <Button title="ربط بلوحة" icon="link" variant="secondary" onPress={() => setPicking(true)} />
        <Sheet visible={picking} onClose={() => setPicking(false)} title="ربط بلوحة">
          <BoardChoices
            current={board}
            card={card}
            onChoose={(next) => {
              setPicking(false);
              onChange(next);
            }}
          />
        </Sheet>
      </Section>
    );
  }

  const progress = linked ? boardProgress(linked) : null;
  const lastList = linked?.lists[linked.lists.length - 1];
  let meta: string;
  if (!linked) {
    meta = link.code ? 'ليست على هذا الجهاز بعد، ويمكنك الانضمام إليها.' : 'غير متاحة على هذا الجهاز.';
  } else if (progress?.done != null && progress.total > 0 && lastList) {
    meta = `المنجز ${progress.done} من ${progress.total} (في «${lastList.title}»)`;
  } else {
    meta = pluralCards(progress?.total ?? 0);
  }

  const open = () => {
    if (linked) router.push(`/board/${linked.id}`);
    else if (link.code) router.push({ pathname: '/join', params: { code: link.code } });
  };

  return (
    <Section title="لوحة مرتبطة" icon="link">
      <View style={styles.box}>
        {linked ? (
          <BoardBadge icon={linked.icon} size={40} tint={linked.color} />
        ) : (
          <View style={styles.missingIcon}>
            <Icon name="link" size={20} color={colors.textFaint} />
          </View>
        )}
        <View style={styles.flex}>
          <Txt style={styles.title} numberOfLines={2}>
            {linked?.title ?? link.title}
          </Txt>
          <Txt style={styles.meta}>{meta}</Txt>
        </View>
      </View>
      <View style={styles.row}>
        {linked || link.code ? (
          <Button
            title={linked ? 'فتح اللوحة' : 'الانضمام إليها'}
            icon={linked ? 'arrow-left' : 'join'}
            onPress={open}
            style={styles.flex}
          />
        ) : null}
        <Button title="إزالة الربط" variant="secondary" onPress={() => onChange(null)} />
      </View>
      {shared && linked && !linkedCode ? <ShareNote boardId={linked.id} /> : null}
    </Section>
  );
}

/** A private board linked from a shared one: the team sees only its name until it is shared too. */
function ShareNote({ boardId }: { boardId: string }) {
  const serverUrl = useAppState((s) => currentServerUrl(s));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      await shareBoard(boardId);
    } catch (e) {
      setError(syncErrorMessage(e, serverUrl));
    }
    setBusy(false);
  };
  return (
    <View style={styles.note}>
      <Txt style={styles.noteText}>هذه اللوحة غير مشتركة، فيرى فريقك اسمها فقط ولا يستطيعون فتحها.</Txt>
      {error ? <Txt style={styles.error}>{error}</Txt> : null}
      <Button title="مشاركة اللوحة مع الفريق" icon="share" variant="secondary" onPress={share} loading={busy} />
    </View>
  );
}

function BoardChoices({ current, card, onChoose }: { current: Board; card: Card; onChoose: (link: CardLink) => void }) {
  const boards = useAppState((s) => s.boards);
  const order = useAppState((s) => s.order);
  const others = order
    .map((id) => boards[id])
    .filter((e): e is BoardEntry => e !== undefined && e.board.id !== current.id);

  const createForCard = () => {
    const id = createBoard({ title: card.title });
    onChoose({ boardId: id, code: null, title: store.get().boards[id]?.board.title ?? card.title });
  };

  return (
    <ScrollView style={styles.choices} contentContainerStyle={styles.choicesContent}>
      <Choice
        icon="plus"
        title={`لوحة جديدة باسم «${card.title}»`}
        meta="بالقوائم: للتنفيذ، قيد العمل، مكتمل"
        onPress={createForCard}
      />
      {others.map((e) => (
        <Pressable
          key={e.board.id}
          onPress={() => onChoose({ boardId: e.board.id, code: e.sync?.code ?? null, title: e.board.title })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
        >
          <BoardBadge icon={e.board.icon} size={34} tint={e.board.color} />
          <View style={styles.flex}>
            <Txt style={styles.choiceTitle} numberOfLines={1}>
              {e.board.title}
            </Txt>
            <Txt style={styles.choiceMeta}>{pluralCards(boardProgress(e.board).total)}</Txt>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Choice({ icon, title, meta, onPress }: { icon: IconName; title: string; meta: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
    >
      <View style={styles.newIcon}>
        <Icon name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Txt style={styles.choiceTitle} numberOfLines={1}>
          {title}
        </Txt>
        <Txt style={styles.choiceMeta}>{meta}</Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hint: { fontSize: 14, color: colors.textSubtle, marginBottom: 10 },
  box: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.page,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  missingIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.list,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13, color: colors.textSubtle, marginTop: 2 },
  row: { flexDirection: 'row-reverse', gap: 10 },
  note: { backgroundColor: '#E9F2FF', borderRadius: 10, padding: 12, gap: 10, marginTop: 10 },
  noteText: { fontSize: 14 },
  error: { fontSize: 13, color: colors.danger },
  choices: { maxHeight: 420 },
  choicesContent: { gap: 8, paddingBottom: 8 },
  choice: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.page,
  },
  pressed: { opacity: 0.6 },
  newIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#E9F2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTitle: { fontSize: 15, fontWeight: '600' },
  choiceMeta: { fontSize: 12, color: colors.textSubtle, marginTop: 2 },
});
