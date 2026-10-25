import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type TextInputContentSizeChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityRow } from '../../../../components/board/ActivityRow';
import { LinkedBoardSection } from '../../../../components/board/LinkedBoardSection';
import { PeoplePicker } from '../../../../components/board/PeoplePicker';
import { Avatar, Person } from '../../../../components/ui/Avatar';
import { Button, Chip, Icon, IconButton } from '../../../../components/ui/Buttons';
import { CheckCircle } from '../../../../components/ui/CheckCircle';
import { EditableText } from '../../../../components/ui/EditableText';
import { KeyboardScrollView } from '../../../../components/ui/Keyboard';
import { ModalHeader, Section } from '../../../../components/ui/Layout';
import { ConfirmForm, Sheet } from '../../../../components/ui/Sheet';
import { Input, Txt } from '../../../../components/ui/Txt';
import { addDays, describeDistance, describeDue, formatLongDate, todayISO } from '../../../../lib/dates';
import { uid } from '../../../../lib/ids';
import { goBack } from '../../../../lib/nav';
import { useNow } from '../../../../lib/useNow';
import { colors, COVER_COLORS } from '../../../../lib/theme';
import { asAssignee, useMe } from '../../../../members/session';
import { useWatching } from '../../../../notifications/prefs';
import { offerReminders } from '../../../../notifications/scheduler';
import { toggleWatching, useBoardFocus } from '../../../../notifications/team';
import { isCardDone } from '../../../../shared/cards';
import type { Board, Card, ChecklistItem } from '../../../../shared/types';
import { dispatch } from '../../../../store/actions';
import { pressButton } from '../../../../store/buttons';
import { useAppState, useBoard } from '../../../../store/store';

export default function CardScreen() {
  const { id, cardId } = useLocalSearchParams<{ id: string; cardId: string }>();
  const insets = useSafeAreaInsets();
  const board = useBoard(id);
  const shared = useAppState((s) => s.boards[id]?.sync != null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Choosing people for the card (itemId null) or for one of its tasks.
  const [picker, setPicker] = useState<{ itemId: string | null } | null>(null);
  useBoardFocus(id);

  // Keeps showing the card while the sheet closes after it was deleted.
  const [deletedCard, setDeletedCard] = useState<Card | null>(null);
  const card = board?.cards[cardId] ?? deletedCard;

  if (!board || !card) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="بطاقة" onClose={goBack} />
        <View style={styles.missing}>
          <Txt style={styles.missingText}>هذه البطاقة لم تعد موجودة، ربما حذفها أحد أعضاء الفريق.</Txt>
        </View>
      </View>
    );
  }

  const list = board.lists.find((l) => l.cardIds.includes(card.id));
  const pu = board.powerUps;
  const update = (
    patch: Partial<Pick<Card, 'title' | 'description' | 'due' | 'dueDone' | 'cover' | 'link' | 'assignees'>>,
  ) => dispatch(board.id, { type: 'card/update', cardId: card.id, patch });
  const assignees = card.assignees ?? [];
  const pickerItem = picker?.itemId ? card.checklist.find((i) => i.id === picker.itemId) : undefined;
  const allOn = pu.labels && pu.dueDates && pu.covers;
  const done = isCardDone(card);

  return (
    <View style={styles.screen}>
      <ModalHeader title={list ? `في قائمة «${list.title}»` : 'بطاقة'} onClose={goBack} />
      <KeyboardScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {pu.covers && card.cover ? <View style={[styles.cover, { backgroundColor: card.cover }]} /> : null}

        <View style={styles.titleRow}>
          <Pressable
            onPress={() => update({ dueDone: !done })}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityLabel="البطاقة منجزة"
            aria-checked={done}
            style={styles.titleCheck}
          >
            <CheckCircle done={done} size={24} />
          </Pressable>
          <EditableText
            value={card.title}
            onCommit={(title) => update({ title })}
            required
            multiline
            placeholder="عنوان البطاقة"
            style={styles.titleInput}
            submitBehavior="blurAndSubmit"
          />
        </View>

        {shared ? <WatchToggle boardId={board.id} cardId={card.id} /> : null}

        <Section title="الأزرار" icon="zap">
          <View style={styles.wrapRow}>
            {(board.buttons ?? []).map((button) => (
              <Chip
                key={button.id}
                label={button.name}
                icon="zap"
                onPress={() => pressButton(board.id, [card.id], button)}
              />
            ))}
            <Chip label="زر جديد" icon="plus" onPress={() => router.push(`/board/${board.id}/button`)} />
          </View>
        </Section>

        <Section title="المسؤولون" icon="users">
          <View style={styles.wrapRow}>
            {assignees.map((a) => (
              <View key={a.id} style={styles.personChip}>
                <Person person={a} />
              </View>
            ))}
            <Chip
              label={assignees.length ? 'تعديل' : 'إسناد البطاقة'}
              icon="user-plus"
              onPress={() => setPicker({ itemId: null })}
            />
          </View>
        </Section>

        <LinkedBoardSection board={board} card={card} shared={shared} onChange={(link) => update({ link })} />

        {pu.labels ? (
          <Section title="التسميات" icon="tag">
            <View style={styles.wrapRow}>
              {board.labels.map((label) => {
                const on = card.labelIds.includes(label.id);
                return (
                  <Chip
                    key={label.id}
                    label={label.name || 'بلا اسم'}
                    color={label.color}
                    selected={on}
                    onPress={() =>
                      dispatch(board.id, { type: 'card/setLabel', cardId: card.id, labelId: label.id, on: !on })
                    }
                  />
                );
              })}
            </View>
          </Section>
        ) : null}

        {pu.dueDates ? (
          <DueDateSection
            due={card.due}
            done={done}
            onChange={(due) => {
              if (due === card.due) return;
              update({ due });
              if (due && !card.due) offerReminders();
            }}
          />
        ) : null}

        <ChecklistSection board={board} card={card} onAssign={(itemId) => setPicker({ itemId })} />

        <Section title="الوصف" icon="description">
          <EditableText
            value={card.description}
            onCommit={(description) => update({ description })}
            multiline
            placeholder="أضف وصفًا أكثر تفصيلًا…"
            style={styles.description}
            textAlignVertical="top"
          />
        </Section>

        {pu.covers ? (
          <Section title="غلاف البطاقة" icon="palette">
            <View style={styles.wrapRow}>
              {COVER_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => update({ cover: color })}
                  accessibilityRole="button"
                  accessibilityLabel="لون الغلاف"
                  aria-selected={card.cover === color}
                  style={[styles.swatch, { backgroundColor: color }, card.cover === color && styles.swatchOn]}
                >
                  {card.cover === color ? <Icon name="check" size={18} color="#172B4D" /> : null}
                </Pressable>
              ))}
              <Chip label="بدون غلاف" selected={!card.cover} onPress={() => update({ cover: null })} />
            </View>
          </Section>
        ) : null}

        <Section title="نقل إلى قائمة" icon="move">
          <View style={styles.wrapRow}>
            {board.lists.map((l) => (
              <Chip
                key={l.id}
                label={l.title}
                selected={l.id === list?.id}
                onPress={() => {
                  if (l.id === list?.id) return;
                  dispatch(board.id, {
                    type: 'card/move',
                    cardId: card.id,
                    toListId: l.id,
                    toIndex: l.cardIds.length,
                  });
                }}
              />
            ))}
          </View>
        </Section>

        {!allOn ? (
          <Pressable
            onPress={() => router.push(`/board/${board.id}/settings`)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.tip, pressed && { opacity: 0.7 }]}
          >
            <Icon name="puzzle" size={20} color={colors.primary} />
            <Txt style={styles.tipText}>
              تحتاج مواعيد أو تسميات أو أغلفة؟ فعّلها من «الإضافات» في إعدادات اللوحة.
            </Txt>
          </Pressable>
        ) : null}

        <CardActivity board={board} cardId={card.id} />

        {confirmDelete ? (
          <ConfirmForm
            message="ستُحذف هذه البطاقة نهائيًا."
            confirmLabel="حذف البطاقة"
            onConfirm={() => {
              setDeletedCard(card);
              dispatch(board.id, { type: 'card/remove', cardId: card.id });
              goBack();
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        ) : (
          <Button title="حذف البطاقة" icon="trash" variant="danger" onPress={() => setConfirmDelete(true)} />
        )}
      </KeyboardScrollView>

      <Sheet
        visible={picker !== null}
        onClose={() => setPicker(null)}
        title={picker?.itemId ? 'إسناد المهمة' : 'إسناد البطاقة'}
      >
        <PeoplePicker
          members={board.members ?? []}
          single={picker?.itemId != null}
          shared={shared}
          selected={
            picker?.itemId ? (pickerItem?.assignee ? [pickerItem.assignee.id] : []) : assignees.map((a) => a.id)
          }
          onChange={(member, on) => {
            if (picker?.itemId) {
              dispatch(board.id, {
                type: 'check/update',
                cardId: card.id,
                itemId: picker.itemId,
                patch: { assignee: member ? asAssignee(member) : null },
              });
              setPicker(null);
            } else if (member) {
              const others = assignees.filter((a) => a.id !== member.id);
              update({ assignees: on ? [...others, asAssignee(member)] : others });
            }
          }}
          onSignIn={() => {
            setPicker(null);
            router.push('/sign-in');
          }}
        />
      </Sheet>
    </View>
  );
}

/** The latest changes to this card and who made them, with the way to the rest. */
function CardActivity({ board, cardId }: { board: Board; cardId: string }) {
  const now = useNow();
  const log = board.activity ?? [];
  const about = log.filter((e) => e.cards.includes(cardId));
  if (about.length === 0) return null;
  const latest = about.slice(-3).reverse();
  return (
    <Section title="النشاط" icon="history">
      {latest.map((entry) => (
        <ActivityRow key={entry.id} board={board} log={log} entry={entry} now={now} linkCard={false} />
      ))}
      {about.length > latest.length ? (
        <Button
          title={`كل نشاط البطاقة (${about.length})`}
          icon="history"
          variant="secondary"
          compact
          onPress={() => router.push({ pathname: '/board/[id]/activity', params: { id: board.id, card: cardId } })}
        />
      ) : null}
    </Section>
  );
}

/** On a shared board: get a notification when a teammate edits this card. */
function WatchToggle({ boardId, cardId }: { boardId: string; cardId: string }) {
  const watching = useWatching(boardId, cardId);
  return (
    <View style={styles.watchRow}>
      <Chip
        label={watching ? 'تتابعها' : 'متابعة البطاقة'}
        icon="bell"
        selected={watching}
        onPress={() => toggleWatching(boardId, cardId, !watching)}
      />
      <Txt style={styles.watchHint}>
        {watching ? 'يصلك إشعار حين يعدّلها أحد من فريقك.' : 'تابعها ليصلك إشعار حين يعدّلها أحد من فريقك.'}
      </Txt>
    </View>
  );
}

function DueDateSection({
  due,
  done,
  onChange,
}: {
  due: string | null;
  /** The card is done: its date shows in green, as met. */
  done: boolean;
  onChange: (due: string | null) => void;
}) {
  const today = todayISO();
  const tone = due ? describeDue(due, done) : null;
  return (
    <Section title="تاريخ الاستحقاق" icon="calendar">
      {due && tone ? (
        <View style={styles.dueRow}>
          <IconButton name="chevron-right" label="اليوم السابق" onPress={() => onChange(addDays(due, -1))} />
          <View
            style={[
              styles.dueBox,
              tone.tone === 'done' && { backgroundColor: colors.successBg },
              tone.tone === 'overdue' && { backgroundColor: colors.dangerBg },
              tone.tone === 'soon' && { backgroundColor: colors.warningBg },
            ]}
          >
            <Txt style={styles.dueDate}>{formatLongDate(due)}</Txt>
            <Txt
              style={[
                styles.dueHint,
                tone.tone === 'done' && { color: colors.success },
                tone.tone === 'overdue' && { color: colors.danger },
                tone.tone === 'soon' && { color: colors.warning },
              ]}
            >
              {done ? 'مكتمل' : describeDistance(due)}
            </Txt>
          </View>
          <IconButton name="chevron-left" label="اليوم التالي" onPress={() => onChange(addDays(due, 1))} />
        </View>
      ) : null}
      <View style={styles.wrapRow}>
        <Chip label="اليوم" selected={due === today} onPress={() => onChange(today)} />
        <Chip label="غدًا" selected={due === addDays(today, 1)} onPress={() => onChange(addDays(today, 1))} />
        <Chip label="بعد أسبوع" selected={due === addDays(today, 7)} onPress={() => onChange(addDays(today, 7))} />
        {due ? <Chip label="إزالة الموعد" icon="close" onPress={() => onChange(null)} /> : null}
      </View>
    </Section>
  );
}

function ChecklistSection({ board, card, onAssign }: { board: Board; card: Card; onAssign: (itemId: string) => void }) {
  const [text, setText] = useState('');
  const done = card.checklist.filter((i) => i.done).length;
  const total = card.checklist.length;

  const add = () => {
    const value = text.trim();
    if (!value) return;
    dispatch(board.id, { type: 'check/add', cardId: card.id, item: { id: uid(), text: value, done: false } });
    setText('');
  };

  return (
    <Section
      title="قائمة التحقق"
      icon="checklist"
      right={total > 0 ? <Txt style={styles.progressText}>{`${done}/${total}`}</Txt> : null}
    >
      {total > 0 ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round((done / total) * 100)}%` },
              done === total && { backgroundColor: colors.online },
            ]}
          />
        </View>
      ) : null}
      {card.checklist.map((item) => (
        <View key={item.id} style={styles.checkRow}>
          <Pressable
            onPress={() =>
              dispatch(board.id, {
                type: 'check/update',
                cardId: card.id,
                itemId: item.id,
                patch: { done: !item.done },
              })
            }
            hitSlop={8}
            accessibilityRole="checkbox"
            aria-checked={item.done}
            accessibilityLabel={item.text}
            style={styles.checkHit}
          >
            <CheckCircle done={item.done} size={22} />
          </Pressable>
          <TaskText
            item={item}
            onCommit={(text) =>
              dispatch(board.id, { type: 'check/update', cardId: card.id, itemId: item.id, patch: { text } })
            }
          />
          <ItemAssignee item={item} onPress={() => onAssign(item.id)} />
          <IconButton
            name="close"
            label="حذف العنصر"
            size={18}
            color={colors.textFaint}
            onPress={() => dispatch(board.id, { type: 'check/remove', cardId: card.id, itemId: item.id })}
          />
        </View>
      ))}
      <View style={styles.addRow}>
        <Input
          value={text}
          onChangeText={setText}
          placeholder="أضف خطوة…"
          onSubmitEditing={add}
          submitBehavior="submit"
          returnKeyType="done"
          style={styles.flex}
        />
        <Button title="إضافة" compact onPress={add} disabled={!text.trim()} />
      </View>
    </Section>
  );
}

/** A task's text, edited in place like the card's title; it shows as a field only while being edited. */
function TaskText({ item, onCommit }: { item: ChecklistItem; onCommit: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  // The web draws a multiline field two lines tall: there it starts at one line and grows with the text.
  const [webHeight, setWebHeight] = useState<number | null>(null);
  const onContentSizeChange = useCallback(
    (e: TextInputContentSizeChangeEvent) => setWebHeight(e.nativeEvent.contentSize.height),
    [],
  );
  // The highlight is on a wrapper: Android shifts a field's text when its own background changes.
  return (
    <View style={[styles.checkField, editing && styles.checkFieldEditing]}>
      <EditableText
        value={item.text}
        onCommit={onCommit}
        required
        multiline
        submitBehavior="blurAndSubmit"
        accessibilityLabel="نص المهمة"
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        {...(Platform.OS === 'web' ? { rows: 1, onContentSizeChange } : null)}
        style={[styles.checkInput, webHeight != null && { height: webHeight }, item.done && !editing && styles.checkDone]}
      />
    </View>
  );
}

/** Who does a task: their avatar, or (signed in) a button to choose someone. */
function ItemAssignee({ item, onPress }: { item: ChecklistItem; onPress: () => void }) {
  const me = useMe();
  if (item.assignee) {
    return (
      <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel="المسؤول عن المهمة">
        <Avatar person={item.assignee} size={26} />
      </Pressable>
    );
  }
  if (!me) return null;
  return <IconButton name="user-plus" label="إسناد المهمة" size={18} color={colors.textFaint} onPress={onPress} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: { padding: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  missingText: { fontSize: 16, textAlign: 'center', color: colors.textSubtle },
  cover: { height: 64, borderRadius: 12, marginBottom: 14 },
  watchRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: -10, marginBottom: 22 },
  watchHint: { flex: 1, fontSize: 13, color: colors.textSubtle },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, marginBottom: 22 },
  titleCheck: { paddingTop: 12 },
  titleInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    borderWidth: 0,
    backgroundColor: colors.page,
  },
  description: { minHeight: 110, fontSize: 15 },
  wrapRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  personChip: {
    maxWidth: '100%',
    paddingVertical: 4,
    paddingRight: 4,
    paddingLeft: 12,
    borderRadius: 999,
    backgroundColor: colors.list,
  },
  swatch: {
    width: 40,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchOn: { borderWidth: 2, borderColor: colors.text },
  dueRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  dueBox: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.page,
  },
  dueDate: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  dueHint: { fontSize: 13, color: colors.textSubtle, textAlign: 'center', marginTop: 2 },
  progressText: { fontSize: 13, color: colors.textSubtle },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.list,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  checkRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  checkHit: { paddingVertical: 6 },
  checkField: { flex: 1, borderRadius: 10 },
  checkFieldEditing: { backgroundColor: colors.page },
  checkInput: {
    fontSize: 15,
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  checkDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  addRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  tip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#E9F2FF',
    marginBottom: 18,
  },
  tipText: { flex: 1, fontSize: 14, color: colors.primary },
});
