import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/ui/Avatar';
import { Button, Icon } from '../components/ui/Buttons';
import { CheckCircle } from '../components/ui/CheckCircle';
import { ModalHeader, Section } from '../components/ui/Layout';
import { Txt } from '../components/ui/Txt';
import { describeDue } from '../lib/dates';
import { goBack } from '../lib/nav';
import { colors } from '../lib/theme';
import { findAssigned, type Found, type Priority } from '../members/assigned';
import { asAssignee, useMe } from '../members/session';
import { isCardDone } from '../shared/cards';
import type { ChecklistItem, Label } from '../shared/types';
import { dispatch } from '../store/actions';
import { useAppState } from '../store/store';

export default function AssignedScreen() {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const boards = useAppState((s) => s.boards);
  const order = useAppState((s) => s.order);
  const found = useMemo(() => (me ? findAssigned(boards, order, me) : null), [boards, order, me]);
  // The cards whose tasks are listed under them, by board and card.
  const [openTasks, setOpenTasks] = useState<ReadonlySet<string>>(() => new Set());
  const toggleTasks = useCallback(
    (key: string) =>
      setOpenTasks((open) => {
        const next = new Set(open);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    [],
  );

  const open = (f: Found) => router.push(`/board/${f.board.id}/card/${f.card.id}`);
  const toggleTask = (f: Found, item: ChecklistItem) =>
    dispatch(f.board.id, { type: 'check/update', cardId: f.card.id, itemId: item.id, patch: { done: !item.done } });

  return (
    <View style={styles.screen}>
      <ModalHeader title="المسندة إليّ" onClose={goBack} />
      {!me || !found ? (
        <View style={styles.center}>
          <Txt style={styles.lead}>ادخل برمز الموظف لترى البطاقات والمهام المسندة إليك.</Txt>
          <Button title="الدخول برمز الموظف" icon="user" onPress={() => router.push('/sign-in')} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.meRow}>
            <Avatar person={asAssignee(me)} size={40} />
            <View style={styles.meText}>
              <Txt style={styles.meName}>{me.name}</Txt>
              {me.role ? <Txt style={styles.meRole}>{me.role}</Txt> : null}
            </View>
          </View>

          {found.cards.length === 0 && found.tasks.length === 0 ? (
            <Txt style={styles.empty}>لا شيء مسند إليك الآن. حين يُسند إليك أحد بطاقة أو مهمة تظهر هنا.</Txt>
          ) : null}

          {found.cards.length > 0 ? (
            <Section title={`البطاقات (${found.cards.length})`} icon="kanban">
              {found.cards.map((f) => {
                const key = `${f.board.id}:${f.card.id}`;
                const done = isCardDone(f.card);
                return (
                  <Row
                    key={key}
                    done={done}
                    title={f.card.title}
                    where={`${f.board.title} · ${f.list.title}`}
                    due={f.board.powerUps.dueDates ? f.card.due : null}
                    priority={f.priority}
                    onToggle={() =>
                      dispatch(f.board.id, { type: 'card/update', cardId: f.card.id, patch: { dueDone: !done } })
                    }
                    onOpen={() => open(f)}
                    tasks={f.card.checklist}
                    tasksOpen={openTasks.has(key)}
                    onToggleTasks={() => toggleTasks(key)}
                    onToggleTask={(item) => toggleTask(f, item)}
                  />
                );
              })}
            </Section>
          ) : null}

          {found.tasks.length > 0 ? (
            <Section title={`المهام (${found.tasks.length})`} icon="checklist">
              {found.tasks.map((f) => (
                <Row
                  key={`${f.board.id}:${f.card.id}:${f.item!.id}`}
                  done={f.item!.done}
                  title={f.item!.text}
                  where={`${f.card.title} · ${f.board.title}`}
                  due={null}
                  priority={f.priority}
                  onToggle={() => toggleTask(f, f.item!)}
                  onOpen={() => open(f)}
                />
              ))}
            </Section>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Row({
  done,
  title,
  where,
  due,
  priority,
  onToggle,
  onOpen,
  tasks = [],
  tasksOpen = false,
  onToggleTasks,
  onToggleTask,
}: {
  done: boolean;
  title: string;
  where: string;
  due: string | null;
  priority: Priority;
  onToggle: () => void;
  onOpen: () => void;
  /** A card's tasks, listed under it with the arrow next to their count. */
  tasks?: ChecklistItem[];
  tasksOpen?: boolean;
  onToggleTasks?: () => void;
  onToggleTask?: (item: ChecklistItem) => void;
}) {
  const dueInfo = due ? describeDue(due, done) : null;
  const tasksDone = tasks.filter((i) => i.done).length;
  const allDone = tasks.length > 0 && tasksDone === tasks.length;
  const tasksTone = allDone ? colors.success : tasksOpen ? colors.primary : colors.textSubtle;
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Pressable
          onPress={onToggle}
          hitSlop={8}
          accessibilityRole="checkbox"
          aria-checked={done}
          accessibilityLabel={title}
          style={styles.rowCheck}
        >
          <CheckCircle done={done} size={22} />
        </Pressable>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          style={({ pressed }) => [styles.rowBody, pressed && styles.rowPressed]}
        >
          <Txt style={[styles.rowTitle, done && styles.rowDone]} numberOfLines={2}>
            {title}
          </Txt>
          <View style={styles.rowMeta}>
            {priority.urgent ? <PriorityLabel label={priority.urgent} /> : null}
            {priority.important ? <PriorityLabel label={priority.important} /> : null}
            <Txt style={styles.rowWhere} numberOfLines={1}>
              {where}
            </Txt>
            {dueInfo ? (
              <View
                style={[
                  styles.due,
                  dueInfo.tone === 'overdue' && { backgroundColor: colors.dangerBg },
                  dueInfo.tone === 'soon' && { backgroundColor: colors.warningBg },
                  dueInfo.tone === 'done' && { backgroundColor: colors.successBg },
                ]}
              >
                <Icon
                  name="clock"
                  size={12}
                  color={
                    dueInfo.tone === 'overdue'
                      ? colors.danger
                      : dueInfo.tone === 'soon'
                        ? colors.warning
                        : dueInfo.tone === 'done'
                          ? colors.success
                          : colors.textSubtle
                  }
                />
                <Txt style={styles.dueText}>{dueInfo.text}</Txt>
              </View>
            ) : null}
          </View>
        </Pressable>
        {tasks.length > 0 && onToggleTasks ? (
          <Pressable
            onPress={onToggleTasks}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={tasksOpen ? 'إخفاء المهام' : 'إظهار المهام'}
            aria-expanded={tasksOpen}
            style={({ pressed }) => [
              styles.tasksButton,
              tasksOpen && styles.tasksButtonOpen,
              allDone && styles.tasksButtonDone,
              pressed && styles.rowPressed,
            ]}
          >
            <Icon name="checklist" size={14} color={tasksTone} />
            <Txt style={[styles.tasksCount, { color: tasksTone }]}>{`${tasksDone}/${tasks.length}`}</Txt>
            <Icon name={tasksOpen ? 'chevron-up' : 'chevron-down'} size={14} color={tasksTone} />
          </Pressable>
        ) : null}
        <Icon name="chevron-left" size={18} color={colors.textFaint} />
      </View>
      {tasksOpen && tasks.length > 0 ? (
        <View style={styles.tasks}>
          {tasks.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onToggleTask?.(item)}
              accessibilityRole="checkbox"
              aria-checked={item.done}
              accessibilityLabel={item.text}
              style={({ pressed }) => [styles.task, pressed && styles.rowPressed]}
            >
              <CheckCircle done={item.done} size={20} />
              <Txt style={[styles.taskText, item.done && styles.taskDone]}>{item.text}</Txt>
              {item.assignee ? <Avatar person={item.assignee} size={22} /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** «عاجل» or «مهم», in its label's color, as on the board. */
function PriorityLabel({ label }: { label: Label }) {
  return (
    <View style={[styles.label, { backgroundColor: label.color }]}>
      <Txt style={styles.labelText} numberOfLines={1}>
        {label.name}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  lead: { fontSize: 16, color: colors.textSubtle, textAlign: 'center' },
  content: { padding: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  meRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 20 },
  meText: { flex: 1 },
  meName: { fontSize: 18, fontWeight: '700' },
  meRole: { fontSize: 14, color: colors.textSubtle },
  empty: { fontSize: 15, color: colors.textSubtle, textAlign: 'center', paddingVertical: 32 },
  item: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  rowCheck: { paddingVertical: 4 },
  rowBody: { flex: 1, gap: 4, borderRadius: 8 },
  rowPressed: { opacity: 0.6 },
  rowTitle: { fontSize: 15 },
  rowDone: { color: colors.textFaint },
  rowMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowWhere: { flexShrink: 1, fontSize: 13, color: colors.textSubtle },
  label: {
    minWidth: 40,
    minHeight: 18,
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 4,
    justifyContent: 'center',
  },
  labelText: { fontSize: 11, fontWeight: '700', color: '#172B4D', textAlign: 'center' },
  due: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dueText: { fontSize: 12, color: colors.textSubtle },
  tasksButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.list,
  },
  tasksButtonOpen: { backgroundColor: '#E9F2FF' },
  tasksButtonDone: { backgroundColor: colors.successBg },
  tasksCount: { fontSize: 12, fontWeight: '600' },
  // Under the title, past the card's circle.
  tasks: { paddingRight: 32, paddingBottom: 8, gap: 2 },
  task: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 6, borderRadius: 8 },
  taskText: { flex: 1, fontSize: 14 },
  taskDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
});
