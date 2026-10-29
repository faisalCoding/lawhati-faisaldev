import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ScrollView as RNScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { pluralCards, toLatinDigits } from '../../lib/text';
import { newCard } from '../../lib/templates';
import { colors, LIST_GAP, LIST_WIDTH } from '../../lib/theme';
import type { Card, Label, List, PowerUps } from '../../shared/types';
import { batch } from '../../store/actions';
import { Button, Icon, IconButton } from '../ui/Buttons';
import { ActionList, ConfirmForm, PromptForm, Sheet, type SheetAction } from '../ui/Sheet';
import { Input, Txt } from '../ui/Txt';
import { CARD_GAP, CARDS_PADDING_H, CARDS_PADDING_TOP, LONG_PRESS_MS, type BoardApi } from './boardApi';
import { CardFace } from './CardFace';
import { DraggableCard } from './DraggableCard';

type SheetMode = 'menu' | 'rename' | 'wip' | 'delete';

export const Column = memo(function Column({
  list,
  cards,
  labels,
  powerUps,
  index,
  listCount,
  maxHeight,
  dragCardId,
  dragging,
  collapsed,
  placeholderIndex,
  placeholderHeight,
  cardFilter,
  selection,
  hasButtons,
  openTasks,
  api,
}: {
  list: List;
  cards: Record<string, Card>;
  labels: Label[];
  powerUps: PowerUps;
  index: number;
  listCount: number;
  maxHeight: number;
  dragCardId: string | null;
  /** Something (a card or a list) is being dragged on the board. */
  dragging: boolean;
  /** This list is being dragged: it stays mounted (it owns the gesture) but takes no space. */
  collapsed: boolean;
  /** Where the drop placeholder goes in this list, or -1. */
  placeholderIndex: number;
  placeholderHeight: number;
  /** Only the cards it lets through are shown; cards cannot be moved meanwhile. */
  cardFilter: ((card: Card) => boolean) | null;
  /** The selected cards while cards are being selected, or null. */
  selection: ReadonlySet<string> | null;
  /** The board has card buttons, so cards show a button for them. */
  hasButtons: boolean;
  /** The cards whose tasks are listed under them. */
  openTasks: ReadonlySet<string>;
  api: BoardApi;
}) {
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const scrollRef = useRef<RNScrollView | null>(null);
  const scrollToEndNext = useRef(false);
  // On the web, the "+" between two cards opens a field for a new card above this one.
  const [insertBefore, setInsertBefore] = useState<string | null>(null);
  const openInsert = useCallback((cardId: string) => setInsertBefore(cardId), []);

  // Long-press the list's title to drag the whole list; a tap renames it.
  const listId = list.id;
  const { activeId, tx, ty, startListDrag, moveListDrag, endListDrag } = api;
  const openRename = useCallback(() => setSheet('rename'), []);
  const headerGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activateAfterLongPress(LONG_PRESS_MS)
      .onStart((e) => {
        'worklet';
        if (activeId.value !== '') return;
        activeId.set(`list:${listId}`);
        tx.set(0);
        ty.set(0);
        scheduleOnRN(startListDrag, listId, e.x, e.y);
      })
      .onUpdate((e) => {
        'worklet';
        if (activeId.value !== `list:${listId}`) return;
        tx.set(e.translationX);
        ty.set(e.translationY);
        scheduleOnRN(moveListDrag, e.translationX, e.translationY);
      })
      .onFinalize(() => {
        'worklet';
        if (activeId.value === `list:${listId}`) scheduleOnRN(endListDrag);
      });
    const tap = Gesture.Tap().onEnd((_e, success) => {
      'worklet';
      if (success && activeId.value === '') scheduleOnRN(openRename);
    });
    return Gesture.Exclusive(pan, tap);
  }, [listId, activeId, tx, ty, startListDrag, moveListDrag, endListDrag, openRename]);

  const count = list.cardIds.length;
  const wip = powerUps.wipLimits ? list.wipLimit : null;
  const overLimit = wip !== null && count > wip;
  const incoming = dragCardId !== null && placeholderIndex >= 0 && !list.cardIds.includes(dragCardId);
  const dropExceedsLimit = wip !== null && incoming && count + 1 > wip;

  const close = () => setSheet(null);
  const update = (patch: Partial<Pick<List, 'title' | 'wipLimit'>>) =>
    api.dispatch({ type: 'list/update', listId: list.id, patch });

  const placeholder = (
    <View
      key="drop-placeholder"
      style={[styles.placeholder, { height: placeholderHeight }, dropExceedsLimit && styles.placeholderOver]}
    />
  );
  // The drag logic places cards from their heights alone, so nothing else sits between them while dragging.
  // With a filter, the gaps between the cards shown are not the list's real gaps.
  const selecting = selection !== null;
  const canInsert = Platform.OS === 'web' && !dragging && !cardFilter && !selecting;
  // The cards shown in this list, for «select all».
  const shownIds = list.cardIds.filter((id) => cards[id] && (!cardFilter || cardFilter(cards[id])));
  const allSelected = selecting && shownIds.length > 0 && shownIds.every((id) => selection.has(id));
  const insertIndex = canInsert && insertBefore ? list.cardIds.indexOf(insertBefore) : -1;
  const items: ReactNode[] = [];
  let visible = 0;
  for (const id of list.cardIds) {
    const card = cards[id];
    if (!card) continue;
    if (cardFilter && !cardFilter(card)) continue;
    const dragged = id === dragCardId;
    if (!dragged && visible === placeholderIndex) items.push(placeholder);
    if (id === insertBefore && insertIndex >= 0) {
      items.push(
        <ComposerForm
          key="insert-composer"
          style={styles.insertComposer}
          onAdd={(title) => {
            // Cards are always added at the end of a list; this one then moves up into place, and
            // the activity shows both as adding it.
            const added = newCard(title);
            batch(() => {
              api.dispatch({ type: 'card/add', listId: list.id, card: added });
              api.dispatch({ type: 'card/move', cardId: added.id, toListId: list.id, toIndex: insertIndex });
            });
          }}
          onCancel={() => setInsertBefore(null)}
        />,
      );
    }
    items.push(
      <DraggableCard
        key={id}
        card={card}
        listId={list.id}
        labels={labels}
        powerUps={powerUps}
        hidden={dragged}
        movable={!cardFilter && !selecting}
        selecting={selecting}
        selected={selection?.has(id) ?? false}
        hasButtons={hasButtons}
        expanded={openTasks.has(id)}
        api={api}
        onInsert={canInsert && visible > 0 && id !== insertBefore ? openInsert : undefined}
      />,
    );
    if (!dragged) visible++;
  }
  if (placeholderIndex >= visible) items.push(placeholder);

  const menu: SheetAction[] = [
    {
      label: 'تحديد بطاقات القائمة',
      hint: 'لنقلها أو حذفها أو تعديلها معًا',
      icon: 'select',
      onPress: () => {
        close();
        api.selectList(list.id, true);
      },
    },
    {
      label: 'إعادة تسمية القائمة',
      icon: 'pencil',
      onPress: () => setSheet('rename'),
    },
  ];
  if (index > 0) {
    menu.push({
      label: 'نقل القائمة يمينًا',
      icon: 'arrow-right',
      onPress: () => {
        api.dispatch({
          type: 'list/move',
          listId: list.id,
          toIndex: index - 1,
        });
        close();
      },
    });
  }
  if (index < listCount - 1) {
    menu.push({
      label: 'نقل القائمة يسارًا',
      icon: 'arrow-left',
      onPress: () => {
        api.dispatch({
          type: 'list/move',
          listId: list.id,
          toIndex: index + 1,
        });
        close();
      },
    });
  }
  if (powerUps.wipLimits) {
    menu.push({
      label: 'حد العمل (WIP)',
      hint: wip ? `الحد الحالي: ${wip}` : 'بلا حد',
      icon: 'gauge',
      onPress: () => setSheet('wip'),
    });
  }
  menu.push({
    label: 'حذف القائمة',
    icon: 'trash',
    destructive: true,
    onPress: () => setSheet('delete'),
  });

  return (
    <View
      style={[styles.column, { maxHeight }, collapsed && styles.collapsed]}
      onLayout={(e) => api.reportColumn(list.id, e.nativeEvent.layout)}
    >
      <View style={styles.header}>
        {/* Measured from outside the GestureDetector: on the web it adds a wrapper element. */}
        <View style={styles.grabArea} onLayout={(e) => api.reportGrabArea(listId, e.nativeEvent.layout)}>
          {/* Without this the detector sets touch-action: none, and a finger landing on the
          title stops the browser scrolling the board under it. The list only lifts after a
          long press, so the two never want the same touch. */}
          <GestureDetector gesture={headerGesture} touchAction="manipulation">
            <View
              collapsable={false}
              accessibilityRole="button"
              accessibilityLabel={list.title}
              accessibilityHint="اضغط لإعادة التسمية، أو اضغط مطولًا واسحب لنقل القائمة"
              style={styles.titleBox}
            >
              <Txt style={styles.title} numberOfLines={2}>
                {list.title}
              </Txt>
              <View style={[styles.count, overLimit && styles.countOver]}>
                <Txt style={[styles.countText, overLimit && styles.countTextOver]}>
                  {wip !== null ? `${count}/${wip}` : String(count)}
                </Txt>
              </View>
            </View>
          </GestureDetector>
        </View>
        {selecting ? (
          <Pressable
            onPress={() => api.selectList(list.id, !allSelected)}
            disabled={shownIds.length === 0}
            accessibilityRole="button"
            style={({ pressed }) => [styles.selectAll, pressed && styles.addCardPressed]}
          >
            <Icon name={allSelected ? 'close' : 'checks'} size={16} color={colors.primary} />
            <Txt style={styles.selectAllText}>{allSelected ? 'إلغاء' : 'تحديد الكل'}</Txt>
          </Pressable>
        ) : (
          <IconButton name="more" label="خيارات القائمة" size={20} onPress={() => setSheet('menu')} />
        )}
      </View>

      <ScrollView
        ref={(r: RNScrollView | null) => {
          scrollRef.current = r;
          api.registerList(list.id, r);
        }}
        style={styles.cards}
        contentContainerStyle={styles.cardsContent}
        scrollEnabled={!dragging}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onLayout={(e) => api.reportListViewport(list.id, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => {
          api.reportListContent(list.id, h);
          if (scrollToEndNext.current) {
            scrollToEndNext.current = false;
            scrollRef.current?.scrollToEnd({ animated: true });
          }
        }}
        onScroll={(e) => api.reportListScroll(list.id, e.nativeEvent.contentOffset.y)}
      >
        {items}
      </ScrollView>

      <CardComposer
        onAdd={(title) => {
          scrollToEndNext.current = true;
          api.dispatch({
            type: 'card/add',
            listId: list.id,
            card: newCard(title),
          });
        }}
      />

      <Sheet
        visible={sheet !== null}
        onClose={close}
        title={sheet === 'wip' ? 'حد العمل (WIP)' : sheet === 'rename' ? 'إعادة تسمية القائمة' : list.title}
      >
        {sheet === 'menu' ? <ActionList actions={menu} /> : null}
        {sheet === 'rename' ? (
          <PromptForm
            initial={list.title}
            placeholder="اسم القائمة"
            onSubmit={(title) => {
              update({ title });
              close();
            }}
            onCancel={close}
          />
        ) : null}
        {sheet === 'wip' ? (
          <PromptForm
            initial={wip ? String(wip) : ''}
            placeholder="مثال: 3"
            keyboardType="number-pad"
            allowEmpty
            hint="أقصى عدد من البطاقات في هذه القائمة في الوقت نفسه. اتركه فارغًا لإلغاء الحد."
            onSubmit={(value) => {
              const n = parseInt(toLatinDigits(value), 10);
              update({ wipLimit: Number.isFinite(n) && n > 0 ? n : null });
              close();
            }}
            onCancel={close}
          />
        ) : null}
        {sheet === 'delete' ? (
          <ConfirmForm
            message={
              count > 0
                ? `ستُحذف القائمة «${list.title}» ومعها ${pluralCards(count)}.`
                : `ستُحذف القائمة «${list.title}».`
            }
            confirmLabel="حذف القائمة"
            onConfirm={() => {
              api.dispatch({ type: 'list/remove', listId: list.id });
              close();
            }}
            onCancel={close}
          />
        ) : null}
      </Sheet>
    </View>
  );
});

/** Trello-style quick add at the bottom of a list. */
function CardComposer({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.addCard, pressed && styles.addCardPressed]}
      >
        <Icon name="plus" size={20} color={colors.textSubtle} />
        <Txt style={styles.addCardText}>إضافة بطاقة</Txt>
      </Pressable>
    );
  }
  return <ComposerForm style={styles.composer} onAdd={onAdd} onCancel={() => setOpen(false)} />;
}

/** Types a new card's title. It stays open after each card, so several can be typed in a row. */
function ComposerForm({
  onAdd,
  onCancel,
  style,
}: {
  onAdd: (title: string) => void;
  onCancel: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const title = text.trim();
    if (!title) return;
    onAdd(title);
    setText('');
  };

  return (
    <View style={style}>
      <Input
        autoFocus
        value={text}
        onChangeText={setText}
        placeholder="اكتب عنوان البطاقة…"
        style={styles.composerInput}
        onSubmitEditing={submit}
        submitBehavior="submit"
        returnKeyType="done"
        onKeyPress={(e) => {
          if (e.nativeEvent.key === 'Escape') onCancel();
        }}
        onBlur={() => {
          if (!text.trim()) onCancel();
        }}
      />
      <View style={styles.composerRow}>
        <Button title="إضافة" compact onPress={submit} disabled={!text.trim()} />
        <IconButton name="close" label="إلغاء" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    width: LIST_WIDTH,
    marginHorizontal: LIST_GAP / 2,
    backgroundColor: colors.list,
    borderRadius: 14,
    // Undo the board's mirroring so the column's content reads normally.
    transform: [{ scaleX: -1 }],
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
    paddingBottom: 4,
    paddingRight: 12,
    paddingLeft: 4,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  grabArea: { flex: 1 },
  titleBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  title: { flex: 1, fontSize: 15, fontWeight: '700' },
  collapsed: { width: 0, marginHorizontal: 0, opacity: 0, overflow: 'hidden' },
  count: {
    minWidth: 26,
    minHeight: 22,
    paddingVertical: 1,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: 'rgba(9,30,66,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countOver: { backgroundColor: colors.dangerBg },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSubtle,
    textAlign: 'center',
  },
  countTextOver: { color: colors.danger },
  cards: { flexGrow: 0, flexShrink: 1 },
  cardsContent: {
    paddingHorizontal: CARDS_PADDING_H,
    paddingTop: CARDS_PADDING_TOP,
  },
  placeholder: {
    borderRadius: 10,
    backgroundColor: colors.placeholder,
    marginBottom: CARD_GAP,
  },
  placeholderOver: { backgroundColor: colors.placeholderOver },
  addCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 10,
  },
  addCardPressed: { backgroundColor: colors.neutralBtnPressed },
  selectAll: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E9F2FF',
  },
  selectAllText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  addCardText: { fontSize: 15, color: colors.textSubtle },
  composer: { paddingHorizontal: 8, paddingBottom: 8, gap: 8 },
  insertComposer: { marginBottom: CARD_GAP, gap: 8 },
  composerInput: { fontSize: 15, borderColor: colors.primary },
  composerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  preview: {
    width: '100%',
    backgroundColor: colors.list,
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: '0px 12px 28px rgba(9,30,66,0.35)',
  },
  previewMore: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: { marginBottom: CARD_GAP },
});

/** A still copy of a column, drawn under the finger while the list is being dragged. */
export function ColumnPreview({
  list,
  cards,
  labels,
  powerUps,
  openTasks,
  maxHeight,
}: {
  list: List;
  cards: Record<string, Card>;
  labels: Label[];
  powerUps: PowerUps;
  openTasks: ReadonlySet<string>;
  maxHeight: number;
}) {
  return (
    <View style={[styles.preview, { maxHeight }]}>
      <View style={styles.header}>
        <View style={[styles.titleBox, styles.grabArea]}>
          <Txt style={styles.title} numberOfLines={2}>
            {list.title}
          </Txt>
          <View style={styles.count}>
            <Txt style={styles.countText}>{String(list.cardIds.length)}</Txt>
          </View>
        </View>
        <View style={styles.previewMore}>
          <Icon name="more" size={20} color={colors.textSubtle} />
        </View>
      </View>
      <View style={styles.cardsContent}>
        {list.cardIds.map((id) =>
          cards[id] ? (
            <View key={id} style={styles.previewCard}>
              <CardFace card={cards[id]} labels={labels} powerUps={powerUps} expanded={openTasks.has(id)} />
            </View>
          ) : null,
        )}
      </View>
    </View>
  );
}
