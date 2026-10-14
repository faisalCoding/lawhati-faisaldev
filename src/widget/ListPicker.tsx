import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BoardBadge, Icon } from '../components/ui/Icon';
import { Txt } from '../components/ui/Txt';
import { pluralCards } from '../lib/text';
import { colors } from '../lib/theme';
import type { Board } from '../shared/types';

/** Every list of every board, to pick one for the list widget. */
export function ListPicker({
  boards,
  selected,
  onChoose,
  bottomInset = 0,
}: {
  boards: Board[];
  selected?: { boardId: string; listId: string };
  onChoose: (target: { boardId: string; listId: string }) => void;
  bottomInset?: number;
}) {
  if (boards.every((b) => b.lists.length === 0)) {
    return (
      <View style={styles.empty}>
        <Icon name="kanban" size={36} color={colors.textFaint} />
        <Txt style={styles.emptyText}>لا توجد قوائم بعد. أنشئ لوحة من التطبيق أولًا.</Txt>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 24 }]}>
      {boards.map((board) =>
        board.lists.length > 0 ? (
          <View key={board.id} style={styles.board}>
            <View style={styles.boardHeader}>
              <BoardBadge icon={board.icon} size={30} tint={board.color} />
              <Txt style={styles.boardTitle}>{board.title}</Txt>
            </View>
            <View style={styles.lists}>
              {board.lists.map((list) => {
                const isSelected = selected?.boardId === board.id && selected.listId === list.id;
                return (
                  <Pressable
                    key={list.id}
                    onPress={() => onChoose({ boardId: board.id, listId: list.id })}
                    accessibilityRole="button"
                    aria-selected={isSelected}
                    style={({ pressed }) => [styles.list, isSelected && styles.listSelected, pressed && styles.pressed]}
                  >
                    <View style={styles.flex}>
                      <Txt style={styles.listTitle}>{list.title}</Txt>
                      <Txt style={styles.listMeta}>{pluralCards(list.cardIds.length)}</Txt>
                    </View>
                    {isSelected ? <Icon name="check" size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
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
  lists: { gap: 8 },
  list: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    boxShadow: '0px 1px 1px rgba(9,30,66,0.2)',
  },
  listSelected: { borderColor: colors.primary },
  pressed: { opacity: 0.7 },
  listTitle: { fontSize: 15, fontWeight: '600' },
  listMeta: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
});
