import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityRow } from '../../../components/board/ActivityRow';
import { Button, Chip, Icon } from '../../../components/ui/Buttons';
import { ModalHeader } from '../../../components/ui/Layout';
import { Txt } from '../../../components/ui/Txt';
import { describeDay } from '../../../lib/activityText';
import { goBack } from '../../../lib/nav';
import { useNow } from '../../../lib/useNow';
import { colors } from '../../../lib/theme';
import { useActorId } from '../../../members/actor';
import { MAX_ACTIVITY } from '../../../shared/activity';
import { lastRedoable, lastUndoable, redoMine, undoMine } from '../../../store/activity';
import { useBoard } from '../../../store/store';

/** The board's activity (or one card's, with `card`): who changed what and when, newest first. */
export default function ActivityScreen() {
  const { id, card: cardId } = useLocalSearchParams<{ id: string; card?: string }>();
  const insets = useSafeAreaInsets();
  const board = useBoard(id);
  const me = useActorId();
  const [mine, setMine] = useState(false);
  const now = useNow();

  const log = useMemo(() => board?.activity ?? [], [board?.activity]);
  const rows = useMemo(
    () => [...log].reverse().filter((e) => (!cardId || e.cards.includes(cardId)) && (!mine || e.by?.id === me)),
    [log, cardId, mine, me],
  );
  const title = cardId ? 'نشاط البطاقة' : 'سجل الأحداث';

  if (!board || !id) {
    return (
      <View style={styles.screen}>
        <ModalHeader title={title} onClose={goBack} />
      </View>
    );
  }

  const items: ReactNode[] = [];
  let day = '';
  for (const entry of rows) {
    const heading = describeDay(entry.at, now);
    if (heading !== day) {
      day = heading;
      items.push(
        <Txt key={`day:${entry.id}`} style={styles.day}>
          {heading}
        </Txt>,
      );
    }
    items.push(<ActivityRow key={entry.id} board={board} log={log} entry={entry} now={now} linkCard={!cardId} />);
  }
  const card = cardId ? board.cards[cardId] : undefined;

  return (
    <View style={styles.screen}>
      <ModalHeader title={title} onClose={goBack} />
      <View style={styles.toolbar}>
        {cardId ? (
          <Txt style={styles.cardTitle} numberOfLines={1}>
            {card ? `«${card.title}»` : 'بطاقة محذوفة'}
          </Txt>
        ) : (
          <>
            <Button
              title="تراجع"
              icon="undo"
              variant="secondary"
              compact
              disabled={!lastUndoable(log, me)}
              onPress={() => undoMine(id)}
            />
            <Button
              title="إعادة"
              icon="redo"
              variant="secondary"
              compact
              disabled={!lastRedoable(log, me)}
              onPress={() => redoMine(id)}
            />
            <View style={styles.spacer} />
          </>
        )}
        <Chip label="الكل" selected={!mine} onPress={() => setMine(false)} />
        <Chip label="تغييراتي" selected={mine} onPress={() => setMine(true)} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {cardId ? null : (
          <Txt style={styles.lead}>
            «تراجع» و«إعادة» في الأعلى لآخر تغييراتك على هذه اللوحة، ولكل حدث زرّه. يُحفظ آخر {MAX_ACTIVITY} حدث.
          </Txt>
        )}
        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="history" size={32} color={colors.textFaint} />
            <Txt style={styles.emptyText}>
              {mine ? 'لم تغيّر شيئًا هنا بعد.' : 'لا أحداث بعد. كل تغيير يظهر هنا مع اسم من أجراه ووقته.'}
            </Txt>
          </View>
        ) : (
          items
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  toolbar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  spacer: { flex: 1 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textSubtle },
  content: { padding: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  lead: { fontSize: 13, color: colors.textSubtle, marginBottom: 8 },
  day: { fontSize: 13, fontWeight: '700', color: colors.textSubtle, marginTop: 14, marginBottom: 2 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyText: { fontSize: 15, color: colors.textSubtle, textAlign: 'center' },
});
