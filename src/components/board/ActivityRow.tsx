import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { actorName, describeEntry, describeWhen } from '../../lib/activityText';
import { colors } from '../../lib/theme';
import { useAssigneeName } from '../../members/session';
import { isUndone, revertDepth } from '../../shared/activity';
import type { ActivityEntry, Board } from '../../shared/types';
import { entryAction, tipOf, toggleEntry } from '../../store/activity';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Buttons';
import { Txt } from '../ui/Txt';

/**
 * One line of a board's activity: who, when, what, and a button that undoes the change (or redoes it
 * once undone). Undos and redos are lines of their own, marked with their arrow.
 */
export function ActivityRow({
  board,
  log,
  entry,
  now,
  linkCard = true,
}: {
  board: Board;
  log: readonly ActivityEntry[];
  entry: ActivityEntry;
  now: number;
  /** A line about one card still on the board opens it. */
  linkCard?: boolean;
}) {
  const action = entryAction(log, entry);
  const undone = !entry.reverts && isUndone(log, entry);
  const undoneBy = undone ? tipOf(log, entry) : null;
  const depth = entry.reverts ? revertDepth(log, entry).depth : 0;
  const cardId = linkCard && entry.cards.length === 1 && board.cards[entry.cards[0]] ? entry.cards[0] : null;

  return (
    <View style={styles.row}>
      <ActorAvatar entry={entry} />
      <View style={styles.body}>
        <View style={styles.meta}>
          <ActorName entry={entry} />
          <Txt style={styles.when}>{describeWhen(entry.at, now)}</Txt>
        </View>
        <Pressable
          onPress={cardId ? () => router.push(`/board/${board.id}/card/${cardId}`) : undefined}
          disabled={!cardId}
          accessibilityRole={cardId ? 'link' : undefined}
          style={({ pressed }) => [styles.textRow, pressed && styles.pressed]}
        >
          {depth ? <Icon name={depth % 2 ? 'undo' : 'redo'} size={15} color={colors.textSubtle} /> : null}
          <Txt style={[styles.text, undone && styles.undone]}>{describeEntry(log, entry)}</Txt>
        </Pressable>
        {undoneBy ? (
          <Txt style={styles.note}>تم التراجع عنه{undoneBy.by ? ` — ${actorName(undoneBy)}` : ''}</Txt>
        ) : null}
        {!entry.reverts && !entry.undo ? <Txt style={styles.note}>لا يمكن التراجع عنه.</Txt> : null}
      </View>
      {action ? (
        <Pressable
          // A new button when its word changes: Android keeps the old width for the new word.
          key={action}
          onPress={() => toggleEntry(board.id, tipOf(log, entry).id)}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Icon name={action} size={15} color={colors.primary} />
          <Txt style={styles.actionText}>{action === 'undo' ? 'تراجع' : 'إعادة'}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

const isGuest = (entry: ActivityEntry) => !entry.by?.id || entry.by.id.startsWith('g:');

/** An employee's avatar (with their latest name); a plain one for anyone without a name. */
function ActorAvatar({ entry }: { entry: ActivityEntry }) {
  if (!entry.by?.name.trim()) {
    return (
      <View style={styles.anon}>
        <Icon name="user" size={16} color={colors.textSubtle} />
      </View>
    );
  }
  return <Avatar person={{ id: entry.by.id || entry.by.name, name: entry.by.name }} size={32} />;
}

function ActorName({ entry }: { entry: ActivityEntry }) {
  const latest = useAssigneeName({ id: entry.by?.id ?? '', name: actorName(entry) });
  return (
    <Txt style={styles.name} numberOfLines={1}>
      {isGuest(entry) ? actorName(entry) : latest}
    </Txt>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  anon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutralBtn,
  },
  body: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 8 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '700' },
  when: { fontSize: 12, color: colors.textFaint },
  textRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 6, borderRadius: 6 },
  pressed: { opacity: 0.6 },
  text: { flex: 1, fontSize: 15, color: colors.text },
  undone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  note: { fontSize: 12, color: colors.textFaint },
  action: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexShrink: 0,
    minWidth: 76,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.neutralBtn,
  },
  actionPressed: { backgroundColor: colors.neutralBtnPressed },
  actionText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
