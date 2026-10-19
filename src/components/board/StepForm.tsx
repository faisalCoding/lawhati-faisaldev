import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { describeDays } from '../../lib/buttonSteps';
import { toLatinDigits } from '../../lib/text';
import { colors, COVER_COLORS } from '../../lib/theme';
import { asAssignee, useMemberSession } from '../../members/session';
import { assigneesOf } from '../../shared/cards';
import type { Assignee, Board, ButtonStep } from '../../shared/types';
import { Avatar } from '../ui/Avatar';
import { Button, Chip, Icon } from '../ui/Buttons';
import { ChoiceRow } from '../ui/ChoiceRow';
import { useSheetListHeight } from '../ui/Sheet';
import { Input, Txt } from '../ui/Txt';

const DAY_CHOICES = [0, 1, 2, 7, 14];

/** Sets up one step of a card button. Choices that are complete on their own save at once. */
export function StepForm({
  board,
  kind,
  initial,
  onSave,
}: {
  board: Board;
  kind: ButtonStep['type'];
  initial?: ButtonStep;
  onSave: (step: ButtonStep) => void;
}) {
  switch (kind) {
    case 'replace':
      return <ReplaceStep initial={initial?.type === 'replace' ? initial : undefined} onSave={onSave} />;
    case 'move':
      return <MoveStep board={board} initial={initial?.type === 'move' ? initial : undefined} onSave={onSave} />;
    case 'done':
      return (
        <View>
          <ChoiceRow icon="circle-check" label="تعليمها منجزة" onPress={() => onSave({ type: 'done', done: true })} />
          <ChoiceRow icon="radio-off" label="إعادة فتحها" onPress={() => onSave({ type: 'done', done: false })} />
        </View>
      );
    case 'due':
      return <DueStep onSave={onSave} />;
    case 'assign':
      return <AssignStep board={board} onSave={onSave} />;
    case 'label':
      return <LabelStep board={board} onSave={onSave} />;
    case 'cover':
      return (
        <View style={styles.swatches}>
          {COVER_COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() => onSave({ type: 'cover', color })}
              accessibilityRole="button"
              accessibilityLabel="لون الغلاف"
              style={[styles.swatch, { backgroundColor: color }]}
            />
          ))}
          <Chip label="إزالة الغلاف" onPress={() => onSave({ type: 'cover', color: null })} />
        </View>
      );
    case 'tasks':
      return <TasksStep initial={initial?.type === 'tasks' ? initial : undefined} onSave={onSave} />;
  }
}

function ReplaceStep({
  initial,
  onSave,
}: {
  initial?: Extract<ButtonStep, { type: 'replace' }>;
  onSave: (step: ButtonStep) => void;
}) {
  const [find, setFind] = useState(initial?.find ?? '');
  const [replace, setReplace] = useState(initial?.replace ?? '');
  return (
    <View style={styles.form}>
      <Input value={find} onChangeText={setFind} placeholder="النص الموجود في العنوان" autoFocus />
      <Input value={replace} onChangeText={setReplace} placeholder="النص الجديد (فارغ = حذفه)" />
      <Button title="حفظ الخطوة" disabled={!find} onPress={() => onSave({ type: 'replace', find, replace })} />
    </View>
  );
}

function MoveStep({
  board,
  initial,
  onSave,
}: {
  board: Board;
  initial?: Extract<ButtonStep, { type: 'move' }>;
  onSave: (step: ButtonStep) => void;
}) {
  const [position, setPosition] = useState<'top' | 'bottom'>(initial?.position ?? 'bottom');
  const listHeight = useSheetListHeight();
  return (
    <View style={styles.form}>
      <View style={styles.chips}>
        <Chip label="أسفل القائمة" selected={position === 'bottom'} onPress={() => setPosition('bottom')} />
        <Chip label="أعلى القائمة" selected={position === 'top'} onPress={() => setPosition('top')} />
      </View>
      <ScrollView style={[styles.list, { maxHeight: listHeight }]}>
        {board.lists.map((list) => (
          <ChoiceRow
            key={list.id}
            icon="kanban"
            label={list.title}
            state={initial?.listId === list.id ? 'on' : undefined}
            onPress={() => onSave({ type: 'move', listId: list.id, position })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function DueStep({ onSave }: { onSave: (step: ButtonStep) => void }) {
  const [days, setDays] = useState('');
  const n = parseInt(toLatinDigits(days), 10);
  return (
    <View style={styles.form}>
      {DAY_CHOICES.map((d) => (
        <ChoiceRow key={d} icon="calendar" label={describeDays(d)} onPress={() => onSave({ type: 'due', days: d })} />
      ))}
      <View style={styles.daysRow}>
        <Txt style={styles.daysLabel}>بعد</Txt>
        <Input
          value={days}
          onChangeText={setDays}
          keyboardType="number-pad"
          placeholder="10"
          style={styles.daysInput}
        />
        <Txt style={styles.daysLabel}>يوم من الضغط</Txt>
        <Button
          title="حفظ"
          compact
          disabled={!Number.isFinite(n) || n < 0 || n > 365}
          onPress={() => onSave({ type: 'due', days: n })}
        />
      </View>
      <ChoiceRow icon="close" label="إزالة الموعد" onPress={() => onSave({ type: 'due', days: null })} />
    </View>
  );
}

function AssignStep({ board, onSave }: { board: Board; onSave: (step: ButtonStep) => void }) {
  const { me, team } = useMemberSession();
  const listHeight = useSheetListHeight();
  // The team when signed in; otherwise the people already on this board's cards.
  const onBoard = assigneesOf(Object.values(board.cards));
  const people: Assignee[] = me
    ? [asAssignee(me), ...team.filter((m) => m.id !== me.id && m.active).map(asAssignee)]
    : onBoard;
  return (
    <ScrollView style={[styles.list, { maxHeight: listHeight }]}>
      <ChoiceRow
        icon="user-check"
        label="من يضغط الزر"
        hint="تُسند إلى الموظف الذي ضغطه"
        onPress={() => onSave({ type: 'assign', to: 'me' })}
      />
      <ChoiceRow icon="close" label="إزالة كل المسؤولين" onPress={() => onSave({ type: 'assign', to: 'nobody' })} />
      {people.map((person) => (
        <ChoiceRow
          key={person.id}
          leading={<Avatar person={person} size={28} />}
          label={person.name}
          onPress={() => onSave({ type: 'assign', to: person })}
        />
      ))}
      {!me ? <Txt style={styles.note}>ادخل بحسابك لتُسند الخطوات.</Txt> : null}
    </ScrollView>
  );
}

function LabelStep({ board, onSave }: { board: Board; onSave: (step: ButtonStep) => void }) {
  const [on, setOn] = useState(true);
  const listHeight = useSheetListHeight();
  return (
    <View style={styles.form}>
      <View style={styles.chips}>
        <Chip label="إضافة التسمية" selected={on} onPress={() => setOn(true)} />
        <Chip label="إزالتها" selected={!on} onPress={() => setOn(false)} />
      </View>
      <ScrollView style={[styles.list, { maxHeight: listHeight }]}>
        {board.labels.map((label) => (
          <ChoiceRow
            key={label.id}
            leading={<View style={[styles.dot, { backgroundColor: label.color }]} />}
            label={label.name || 'بلا اسم'}
            onPress={() => onSave({ type: 'label', labelId: label.id, on })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function TasksStep({
  initial,
  onSave,
}: {
  initial?: Extract<ButtonStep, { type: 'tasks' }>;
  onSave: (step: ButtonStep) => void;
}) {
  const [text, setText] = useState(initial?.items.join('\n') ?? '');
  const items = text
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
  return (
    <View style={styles.form}>
      <Input
        value={text}
        onChangeText={setText}
        placeholder={'مهمة في كل سطر، مثل:\nمراجعة\nاعتماد\nنشر'}
        multiline
        textAlignVertical="top"
        style={styles.tasks}
        autoFocus
      />
      <View style={styles.hintRow}>
        <Icon name="checklist" size={16} color={colors.textSubtle} />
        <Txt style={styles.note}>تُضاف إلى قائمة التحقق في البطاقة.</Txt>
      </View>
      <Button title="حفظ الخطوة" disabled={items.length === 0} onPress={() => onSave({ type: 'tasks', items })} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10, paddingVertical: 4 },
  list: { maxHeight: 360 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  swatches: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingVertical: 8 },
  swatch: { width: 44, height: 32, borderRadius: 8 },
  dot: { width: 22, height: 14, borderRadius: 4 },
  daysRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
  daysLabel: { fontSize: 15 },
  daysInput: { width: 70, textAlign: 'center' },
  tasks: { minHeight: 110 },
  hintRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  note: { fontSize: 13, color: colors.textSubtle },
});
