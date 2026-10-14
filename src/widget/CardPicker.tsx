import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BoardBadge, Icon } from '../components/ui/Icon';
import { Txt } from '../components/ui/Txt';
import { colors } from '../lib/theme';
import type { Board } from '../shared/types';
import type { WidgetTarget } from './model';

/** Every card of every board, grouped by board and list, to pick one from. */
export function CardPicker({
  boards,
  selected,
  onChoose,
  bottomInset = 0,
}: {
  boards: Board[];
  selected?: WidgetTarget;
  onChoose: (target: WidgetTarget) => void;
  bottomInset?: number;
}) {
  if (boards.every((b) => Object.keys(b.cards).length === 0)) {
    return (
      <View style={styles.empty}>
        <Icon name="kanban" size={36} color={colors.textFaint} />
        <Txt style={styles.emptyText}>لا توجد بطاقات بعد. أضف بطاقات من التطبيق أولًا.</Txt>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 24 }]}>
      {boards.map((board) =>
        board.lists.some((l) => l.cardIds.length > 0) ? (
          <View key={board.id} style={styles.board}>
            <View style={styles.boardHeader}>
              <BoardBadge icon={board.icon} size={30} tint={board.color} />
              <Txt style={styles.boardTitle}>{board.title}</Txt>
            </View>
            {board.lists.map((list) =>
              list.cardIds.length > 0 ? (
                <View key={list.id} style={styles.list}>
                  <Txt style={styles.listTitle}>{list.title}</Txt>
                  {list.cardIds.map((cardId) => {
                    const card = board.cards[cardId];
                    if (!card) return null;
                    const isSelected = selected?.boardId === board.id && selected.cardId === cardId;
                    const tasks = card.checklist.length;
                    return (
                      <Pressable
                        key={cardId}
                        onPress={() => onChoose({ boardId: board.id, cardId })}
                        accessibilityRole="button"
                        aria-selected={isSelected}
                        style={({ pressed }) => [styles.card, isSelected && styles.cardSelected, pressed && styles.pressed]}
                      >
                        <View style={styles.flex}>
                          <Txt style={styles.cardTitle} numberOfLines={2}>
                            {card.title}
                          </Txt>
                          {tasks > 0 ? (
                            <Txt style={styles.cardMeta}>
                              {`${card.checklist.filter((i) => i.done).length}/${tasks} مهام`}
                            </Txt>
                          ) : null}
                        </View>
                        {isSelected ? <Icon name="check" size={18} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null,
            )}
          </View>
        ) : null,
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { alignItems: 'center', gap: 12, padding: 32 },
  emptyText: { fontSize: 15, color: colors.textSubtle, textAlign: 'center' },
  content: { padding: 16, gap: 20 },
  board: { gap: 10 },
  boardHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  boardTitle: { flex: 1, fontSize: 17, fontWeight: '700' },
  list: { backgroundColor: colors.list, borderRadius: 14, padding: 10, gap: 8 },
  listTitle: { fontSize: 13, fontWeight: '700', color: colors.textSubtle, paddingHorizontal: 4 },
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 2,
    borderColor: 'transparent',
    boxShadow: '0px 1px 1px rgba(9,30,66,0.2)',
  },
  cardSelected: { borderColor: colors.primary },
  pressed: { opacity: 0.7 },
  cardTitle: { fontSize: 15 },
  cardMeta: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
});
