import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addDays, formatLongDate, todayISO } from '../../lib/dates';
import { pluralCards } from '../../lib/text';
import { colors, COVER_COLORS } from '../../lib/theme';
import { setUndoLift } from '../../lib/undo';
import { asAssignee, useMemberSession } from '../../members/session';
import { assigneesOf, isAssignedTo, isCardDone } from '../../shared/cards';
import type { Assignee, Board, Card } from '../../shared/types';
import {
  clearCardsAssignees,
  countTitlesWith,
  deleteCards,
  moveCards,
  replaceInTitles,
  setCardsAssignee,
  setCardsCover,
  setCardsDone,
  setCardsDue,
  setCardsLabel,
} from '../../store/bulk';
import { pressButton } from '../../store/buttons';
import { changeWithUndo } from '../../store/cardOps';
import { Avatar } from '../ui/Avatar';
import { Button, Icon, IconButton, type IconName } from '../ui/Buttons';
import { ChoiceRow } from '../ui/ChoiceRow';
import { ConfirmForm, Sheet, useSheetListHeight } from '../ui/Sheet';
import { Input, Txt } from '../ui/Txt';
import { ButtonsList } from './ButtonsList';

type SheetKind = 'smart' | 'move' | 'done' | 'due' | 'assign' | 'label' | 'cover' | 'replace' | 'buttons' | 'delete';

const ACTIONS: { kind: SheetKind; icon: IconName; label: string }[] = [
  { kind: 'move', icon: 'move', label: 'نقل' },
  { kind: 'done', icon: 'circle-check', label: 'إنجاز' },
  { kind: 'due', icon: 'calendar', label: 'موعد' },
  { kind: 'assign', icon: 'user-plus', label: 'مسؤول' },
  { kind: 'label', icon: 'tag', label: 'تسمية' },
  { kind: 'cover', icon: 'palette', label: 'غلاف' },
  { kind: 'replace', icon: 'replace', label: 'استبدال' },
  { kind: 'buttons', icon: 'zap', label: 'أزرار' },
  { kind: 'delete', icon: 'trash', label: 'حذف' },
];

const TITLES: Record<SheetKind, string> = {
  smart: 'تحديد ذكي',
  move: 'نقل إلى قائمة',
  done: 'الإنجاز',
  due: 'موعد التسليم',
  assign: 'المسؤولون',
  label: 'التسميات',
  cover: 'الغلاف',
  replace: 'استبدال نص في العناوين',
  buttons: 'تشغيل زر',
  delete: 'حذف البطاقات',
};

/** Whether something applies to all, some or none of the selected cards. */
function stateOf(cards: Card[], has: (card: Card) => boolean): 'on' | 'some' | 'off' {
  const n = cards.filter(has).length;
  return n === 0 ? 'off' : n === cards.length ? 'on' : 'some';
}

/**
 * The bar at the bottom of a board while cards are being selected: how many, a smart selection,
 * and what to do with them. Every change says what it did, with «تراجع».
 */
export function SelectionBar({
  board,
  selected,
  visible,
  onSelect,
  onClose,
  onHeight,
}: {
  board: Board;
  /** The selected cards, in board order. */
  selected: string[];
  /** Cards shown on the board now (a person filter hides the others). */
  visible: (card: Card) => boolean;
  onSelect: (ids: string[]) => void;
  onClose: () => void;
  /** How tall the bar is, so the board can end above it. */
  onHeight: (height: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const listHeight = useSheetListHeight();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [height, setHeight] = useState(0);
  // The undo message sits above the bar while it is on screen.
  useEffect(() => {
    setUndoLift(height);
    return () => setUndoLift(0);
  }, [height]);

  const cards = selected.map((id) => board.cards[id]).filter(Boolean);
  const count = cards.length;
  const close = () => setSheet(null);
  const apply = (run: () => number, describe: (n: number) => string) => {
    close();
    changeWithUndo(board.id, run, describe);
  };

  return (
    <View
      onLayout={(e) => {
        setHeight(e.nativeEvent.layout.height);
        onHeight(e.nativeEvent.layout.height);
      }}
      style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}
    >
      <View style={styles.top}>
        <Txt style={styles.count} numberOfLines={1}>
          {count ? `المحددة: ${pluralCards(count)}` : 'اضغط البطاقات لتحديدها'}
        </Txt>
        <Pressable
          onPress={() => setSheet('smart')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.smart, pressed && styles.pressed]}
        >
          <Icon name="wand" size={16} color={colors.primary} />
          <Txt style={styles.smartText}>تحديد ذكي</Txt>
        </Pressable>
        <IconButton name="close" label="إنهاء التحديد" onPress={onClose} />
      </View>
      <View style={styles.actions}>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.kind}
            onPress={() => setSheet(a.kind)}
            disabled={count === 0}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed && styles.pressed, count === 0 && styles.disabled]}
          >
            <Icon name={a.icon} size={20} color={a.kind === 'delete' ? colors.danger : colors.text} />
            <Txt style={[styles.actionText, a.kind === 'delete' && { color: colors.danger }]}>{a.label}</Txt>
          </Pressable>
        ))}
      </View>

      <Sheet visible={sheet !== null} onClose={close} title={sheet ? TITLES[sheet] : undefined}>
        {sheet === 'smart' ? (
          <SmartSelect
            board={board}
            visible={visible}
            onSelect={(ids) => {
              onSelect(ids);
              close();
            }}
          />
        ) : null}

        {sheet === 'move' ? (
          <ScrollView style={[styles.list, { maxHeight: listHeight }]}>
            {board.lists.map((list) => (
              <ChoiceRow
                key={list.id}
                icon="kanban"
                label={list.title}
                hint={pluralCards(list.cardIds.length)}
                onPress={() =>
                  apply(
                    () => moveCards(board.id, selected, list.id),
                    (n) => `نُقلت ${pluralCards(n)} إلى «${list.title}»`,
                  )
                }
              />
            ))}
          </ScrollView>
        ) : null}

        {sheet === 'done' ? (
          <View>
            <ChoiceRow
              icon="circle-check"
              label="تعليمها منجزة"
              onPress={() =>
                apply(
                  () => setCardsDone(board.id, selected, true),
                  (n) => `أُنجزت ${pluralCards(n)}`,
                )
              }
            />
            <ChoiceRow
              icon="radio-off"
              label="إعادة فتحها"
              onPress={() =>
                apply(
                  () => setCardsDone(board.id, selected, false),
                  (n) => `أُعيد فتح ${pluralCards(n, true)}`,
                )
              }
            />
          </View>
        ) : null}

        {sheet === 'due' ? (
          <DueChooser
            onPick={(due) =>
              apply(
                () => setCardsDue(board.id, selected, due),
                (n) =>
                  due ? `موعد ${pluralCards(n, true)}: ${formatLongDate(due)}` : `أُزيل موعد ${pluralCards(n, true)}`,
              )
            }
          />
        ) : null}

        {sheet === 'assign' ? (
          <BulkPeople
            cards={cards}
            onToggle={(person, on) =>
              changeWithUndo(
                board.id,
                () => setCardsAssignee(board.id, selected, person, on),
                (n) =>
                  on
                    ? `أُسندت ${pluralCards(n)} إلى ${person.name}`
                    : `لم تعد ${pluralCards(n)} مسندة إلى ${person.name}`,
              )
            }
            onClear={() =>
              apply(
                () => clearCardsAssignees(board.id, selected),
                (n) => `أُزيل مسؤولو ${pluralCards(n, true)}`,
              )
            }
            onSignIn={() => {
              close();
              router.push('/sign-in');
            }}
          />
        ) : null}

        {sheet === 'label' ? (
          <ScrollView style={[styles.list, { maxHeight: listHeight }]}>
            {board.labels.map((label) => {
              const state = stateOf(cards, (c) => c.labelIds.includes(label.id));
              const name = label.name || 'بلا اسم';
              return (
                <ChoiceRow
                  key={label.id}
                  leading={<View style={[styles.dot, { backgroundColor: label.color }]} />}
                  label={name}
                  state={state}
                  onPress={() => {
                    const on = state !== 'on';
                    changeWithUndo(
                      board.id,
                      () => setCardsLabel(board.id, selected, label.id, on),
                      (n) =>
                        on
                          ? `أُضيفت «${name}» إلى ${pluralCards(n, true)}`
                          : `أُزيلت «${name}» من ${pluralCards(n, true)}`,
                    );
                  }}
                />
              );
            })}
          </ScrollView>
        ) : null}

        {sheet === 'cover' ? (
          <View style={styles.swatches}>
            {COVER_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() =>
                  apply(
                    () => setCardsCover(board.id, selected, color),
                    (n) => `تلوّن غلاف ${pluralCards(n, true)}`,
                  )
                }
                accessibilityRole="button"
                accessibilityLabel="لون الغلاف"
                style={[styles.swatch, { backgroundColor: color }]}
              />
            ))}
            <Button
              title="بدون غلاف"
              variant="secondary"
              compact
              onPress={() =>
                apply(
                  () => setCardsCover(board.id, selected, null),
                  (n) => `أُزيل غلاف ${pluralCards(n, true)}`,
                )
              }
            />
          </View>
        ) : null}

        {sheet === 'replace' ? (
          <ReplaceForm
            titles={cards.map((c) => c.title)}
            onReplace={(find, replace) =>
              apply(
                () => replaceInTitles(board.id, selected, find, replace),
                (n) => `تغيّر عنوان ${pluralCards(n, true)}`,
              )
            }
          />
        ) : null}

        {sheet === 'buttons' ? (
          <ButtonsList
            board={board}
            onPress={(button) => {
              close();
              pressButton(board.id, selected, button);
            }}
            onCreate={() => {
              close();
              router.push(`/board/${board.id}/button`);
            }}
          />
        ) : null}

        {sheet === 'delete' ? (
          <ConfirmForm
            message={`ستُحذف ${pluralCards(count)}. يمكنك التراجع خلال ثوانٍ بعد الحذف.`}
            confirmLabel="حذف"
            onConfirm={() =>
              apply(
                () => deleteCards(board.id, selected),
                (n) => `حُذفت ${pluralCards(n)}`,
              )
            }
            onCancel={close}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

/** Selects the cards that match: late ones, done ones, someone's, a label's… */
function SmartSelect({
  board,
  visible,
  onSelect,
}: {
  board: Board;
  visible: (card: Card) => boolean;
  onSelect: (ids: string[]) => void;
}) {
  const { me } = useMemberSession();
  const listHeight = useSheetListHeight();
  const options = useMemo(() => {
    const today = todayISO();
    const cards = board.lists.flatMap((l) => l.cardIds.map((id) => board.cards[id])).filter((c) => c && visible(c));
    const found: { key: string; label: string; icon?: IconName; person?: Assignee; match: (c: Card) => boolean }[] = [
      { key: 'all', label: 'كل البطاقات', icon: 'select', match: () => true },
      { key: 'late', label: 'المتأخرة', icon: 'clock', match: (c) => !!c.due && c.due < today && !isCardDone(c) },
      { key: 'today', label: 'موعدها اليوم', icon: 'calendar', match: (c) => c.due === today },
      { key: 'done', label: 'المنجزة', icon: 'circle-check', match: (c) => isCardDone(c) },
      { key: 'open', label: 'غير المنجزة', icon: 'radio-off', match: (c) => !isCardDone(c) },
    ];
    if (me)
      found.push({ key: 'me', label: 'المسندة إليّ', person: asAssignee(me), match: (c) => isAssignedTo(c, me.id) });
    for (const person of assigneesOf(cards)) {
      if (person.id === me?.id) continue;
      found.push({
        key: `p:${person.id}`,
        label: `المسندة إلى ${person.name}`,
        person,
        match: (c) => isAssignedTo(c, person.id),
      });
    }
    found.push({ key: 'nobody', label: 'بلا مسؤول', icon: 'user', match: (c) => !(c.assignees ?? []).length });
    for (const label of board.labels) {
      if (!cards.some((c) => c.labelIds.includes(label.id))) continue;
      found.push({
        key: `l:${label.id}`,
        label: `بتسمية «${label.name || 'بلا اسم'}»`,
        icon: 'tag',
        match: (c) => c.labelIds.includes(label.id),
      });
    }
    return found.map((o) => ({ ...o, ids: cards.filter(o.match).map((c) => c.id) }));
  }, [board, visible, me]);

  return (
    <ScrollView style={[styles.list, { maxHeight: listHeight }]}>
      {options.map((o) => (
        <ChoiceRow
          key={o.key}
          icon={o.icon}
          leading={o.person ? <Avatar person={o.person} size={26} /> : undefined}
          label={o.label}
          hint={pluralCards(o.ids.length)}
          disabled={o.ids.length === 0}
          onPress={() => onSelect(o.ids)}
        />
      ))}
    </ScrollView>
  );
}

/** A day to set: quick choices, or any day with the arrows. */
function DueChooser({ onPick }: { onPick: (due: string | null) => void }) {
  const today = todayISO();
  const [day, setDay] = useState(today);
  return (
    <View style={styles.form}>
      <View style={styles.chips}>
        <Button title="اليوم" variant="secondary" compact onPress={() => onPick(today)} />
        <Button title="غدًا" variant="secondary" compact onPress={() => onPick(addDays(today, 1))} />
        <Button title="بعد أسبوع" variant="secondary" compact onPress={() => onPick(addDays(today, 7))} />
      </View>
      <View style={styles.dayRow}>
        <IconButton name="chevron-right" label="اليوم السابق" onPress={() => setDay(addDays(day, -1))} />
        <Txt style={styles.day}>{formatLongDate(day)}</Txt>
        <IconButton name="chevron-left" label="اليوم التالي" onPress={() => setDay(addDays(day, 1))} />
      </View>
      <Button title="تعيين هذا الموعد" icon="calendar" onPress={() => onPick(day)} />
      <Button title="إزالة الموعد" variant="ghost" onPress={() => onPick(null)} />
    </View>
  );
}

/** The team, each marked by whether they are on all, some or none of the selected cards. */
function BulkPeople({
  cards,
  onToggle,
  onClear,
  onSignIn,
}: {
  cards: Card[];
  onToggle: (person: Assignee, on: boolean) => void;
  onClear: () => void;
  onSignIn: () => void;
}) {
  const { me, team } = useMemberSession();
  const listHeight = useSheetListHeight();
  if (!me) {
    return (
      <View style={styles.form}>
        <Txt style={styles.note}>ادخل بحسابك أولًا، لتُسند البطاقات.</Txt>
        <Button title="الدخول بحسابك" icon="user" onPress={onSignIn} />
      </View>
    );
  }
  const onCards = assigneesOf(cards);
  const people: Assignee[] = [
    asAssignee(me),
    ...team.filter((m) => m.id !== me.id && m.active).map(asAssignee),
    ...onCards.filter((p) => p.id !== me.id && !team.some((m) => m.id === p.id && m.active)),
  ];
  return (
    <ScrollView style={[styles.list, { maxHeight: listHeight }]}>
      {people.map((person) => {
        const state = stateOf(cards, (c) => (c.assignees ?? []).some((a) => a.id === person.id));
        return (
          <ChoiceRow
            key={person.id}
            leading={<Avatar person={person} size={30} />}
            label={person.id === me.id ? `${person.name} (أنا)` : person.name}
            state={state}
            onPress={() => onToggle(person, state !== 'on')}
          />
        );
      })}
      <ChoiceRow icon="close" label="إزالة كل المسؤولين" onPress={onClear} />
    </ScrollView>
  );
}

/** Replaces a text in the selected cards' titles, showing how many titles have it. */
function ReplaceForm({ titles, onReplace }: { titles: string[]; onReplace: (find: string, replace: string) => void }) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const matches = countTitlesWith(titles, find);
  return (
    <View style={styles.form}>
      <Input value={find} onChangeText={setFind} placeholder="النص الموجود" autoFocus />
      <Input value={replace} onChangeText={setReplace} placeholder="النص الجديد (فارغ = حذفه)" />
      <Txt style={styles.note}>
        {find
          ? `النص موجود في ${matches} من البطاقات المحددة، وعددها ${titles.length}.`
          : 'يُستبدل في كل مكان يظهر فيه من العنوان.'}
      </Txt>
      <Button title="استبدال" icon="replace" disabled={matches === 0} onPress={() => onReplace(find, replace)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: '0px -6px 20px rgba(9,30,66,0.18)',
  },
  top: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingRight: 16, paddingLeft: 6 },
  count: { flex: 1, fontSize: 15, fontWeight: '700' },
  smart: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#E9F2FF',
  },
  smartText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  // Wrapped rather than scrolled sideways: every action stays in sight, on any width.
  actions: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  action: { alignItems: 'center', gap: 3, minWidth: 58, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 10 },
  actionText: { fontSize: 12, color: colors.text },
  pressed: { backgroundColor: colors.neutralBtn },
  disabled: { opacity: 0.4 },
  list: { maxHeight: 420 },
  dot: { width: 22, height: 14, borderRadius: 4 },
  swatches: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingVertical: 8 },
  swatch: { width: 44, height: 32, borderRadius: 8 },
  form: { gap: 12, paddingVertical: 4 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  dayRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  day: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  note: { fontSize: 14, color: colors.textSubtle, textAlign: 'center' },
});
