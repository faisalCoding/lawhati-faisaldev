import { memo, type ComponentRef, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { describeDistance, describeDue } from '../../lib/dates';
import { boardProgress } from '../../lib/progress';
import { colors } from '../../lib/theme';
import { isCardDone } from '../../shared/cards';
import type { Card, CardLink, Label, PowerUps } from '../../shared/types';
import { useBoard } from '../../store/store';
import { Avatar, AvatarStack } from '../ui/Avatar';
import { Icon } from '../ui/Buttons';
import { CheckCircle } from '../ui/CheckCircle';
import { Txt } from '../ui/Txt';

export type ViewRef = ComponentRef<typeof View>;

/** Where the listed tasks sit, for taps: each task's circle and row, by task id. */
export interface TaskTargets {
  checks: Record<string, ViewRef | null>;
  rows: Record<string, ViewRef | null>;
}

const DUE_TONES = {
  done: { bg: colors.successBg, fg: colors.success },
  overdue: { bg: colors.dangerBg, fg: colors.danger },
  soon: { bg: colors.warningBg, fg: colors.warning },
  normal: { bg: 'transparent', fg: colors.textSubtle },
} as const;

/** How a card looks on the board. Power-Ups that are switched off are simply not shown. */
export const CardFace = memo(function CardFace({
  card,
  labels,
  powerUps,
  lifted,
  expanded,
  rootRef,
  checkRef,
  buttonsRef,
  linkButtonRef,
  tasksButtonRef,
  taskTargets,
  addTaskRef,
  selected,
}: {
  card: Card;
  labels: Label[];
  powerUps: PowerUps;
  lifted?: boolean;
  /** The card's tasks are listed under it, to tick them without opening the card. */
  expanded?: boolean;
  /** The card, its round checkbox and its "open the linked board" button, so a tap can tell which was hit. */
  rootRef?: RefObject<ViewRef | null>;
  checkRef?: RefObject<ViewRef | null>;
  /** Given when the board has card buttons: the card shows a button that lists them. */
  buttonsRef?: RefObject<ViewRef | null>;
  linkButtonRef?: RefObject<ViewRef | null>;
  /** The tasks' counter, with the arrow that lists them, the tasks listed, and the row that adds one. */
  tasksButtonRef?: RefObject<ViewRef | null>;
  taskTargets?: RefObject<TaskTargets>;
  addTaskRef?: RefObject<ViewRef | null>;
  /** Picked while cards are being selected. */
  selected?: boolean;
}) {
  const done = isCardDone(card);
  const cardLabels = powerUps.labels ? labels.filter((l) => card.labelIds.includes(l.id)) : [];
  const due = powerUps.dueDates && card.due ? describeDue(card.due, done) : null;
  const tasks = card.checklist;
  const doneCount = tasks.filter((i) => i.done).length;
  const allDone = tasks.length > 0 && doneCount === tasks.length;
  const tasksTone = allDone ? colors.success : expanded ? colors.primary : colors.textSubtle;
  const hasDescription = card.description.trim().length > 0;
  const cover = powerUps.covers ? card.cover : null;
  const assignees = card.assignees ?? [];

  return (
    <View ref={rootRef} collapsable={false} style={[styles.card, lifted && styles.lifted]}>
      {cover ? <View style={[styles.cover, { backgroundColor: cover }]} /> : null}
      <View style={styles.body}>
        {cardLabels.length > 0 ? (
          <View style={styles.labels}>
            {cardLabels.map((l) => (
              <View key={l.id} style={[styles.label, { backgroundColor: l.color }]}>
                {l.name ? (
                  <Txt style={styles.labelText} numberOfLines={1}>
                    {l.name}
                  </Txt>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.titleRow}>
          <CheckCircle ref={checkRef} done={done} />
          <Txt style={styles.title}>{card.title}</Txt>
          {buttonsRef ? (
            <View ref={buttonsRef} collapsable={false} style={styles.buttons}>
              <Icon name="zap" size={14} color={colors.textSubtle} />
            </View>
          ) : null}
        </View>
        {card.link ? <LinkedBoard link={card.link} buttonRef={linkButtonRef} /> : null}
        {due || tasks.length > 0 || hasDescription || assignees.length > 0 ? (
          <View style={styles.badges}>
            {due ? (
              <View style={[styles.badge, { backgroundColor: DUE_TONES[due.tone].bg }]}>
                <Icon name={due.tone === 'done' ? 'circle-check' : 'clock'} size={14} color={DUE_TONES[due.tone].fg} />
                <Txt style={[styles.badgeText, { color: DUE_TONES[due.tone].fg }]}>{due.text}</Txt>
              </View>
            ) : null}
            {tasks.length > 0 ? (
              <View
                ref={tasksButtonRef}
                collapsable={false}
                style={[
                  styles.badge,
                  styles.tasksButton,
                  expanded && styles.tasksButtonOpen,
                  allDone && styles.tasksButtonDone,
                ]}
              >
                <Icon name="checklist" size={14} color={tasksTone} />
                <Txt style={[styles.badgeText, { color: tasksTone }]}>{`${doneCount}/${tasks.length}`}</Txt>
                <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={tasksTone} />
              </View>
            ) : null}
            {hasDescription ? (
              <View style={styles.badge}>
                <Icon name="description" size={14} color={colors.textSubtle} />
              </View>
            ) : null}
            {assignees.length > 0 ? (
              <View style={styles.assignees}>
                <AvatarStack people={assignees} />
              </View>
            ) : null}
          </View>
        ) : null}
        {expanded && tasks.length > 0 ? (
          <View style={styles.tasks}>
            {tasks.map((item) => (
              <View
                key={item.id}
                ref={(view) => {
                  if (taskTargets) taskTargets.current.rows[item.id] = view;
                }}
                collapsable={false}
                accessibilityLabel={item.done ? `${item.text}، منجزة` : item.text}
                style={styles.task}
              >
                <View
                  ref={(view) => {
                    if (taskTargets) taskTargets.current.checks[item.id] = view;
                  }}
                  collapsable={false}
                  style={styles.taskCheck}
                >
                  <CheckCircle done={item.done} size={18} />
                </View>
                <View style={styles.taskBody}>
                  <Txt style={[styles.taskText, item.done && styles.taskDone]} numberOfLines={3}>
                    {item.text}
                  </Txt>
                  {/* Its own date, not the card's: a card is often a week and its tasks are days. */}
                  {item.due ? (
                    <Txt
                      style={[
                        styles.taskDue,
                        !item.done && describeDue(item.due).tone === 'overdue' && styles.taskDueLate,
                      ]}
                    >
                      {describeDistance(item.due)}
                    </Txt>
                  ) : null}
                </View>
                {item.assignee ? <Avatar person={item.assignee} size={20} /> : null}
              </View>
            ))}
            <View ref={addTaskRef} collapsable={false} style={styles.addTask}>
              <View style={styles.addTaskIcon}>
                <Icon name="plus" size={16} color={colors.textSubtle} />
              </View>
              <Txt style={styles.addTaskText}>إضافة مهمة</Txt>
            </View>
          </View>
        ) : null}
      </View>
      {selected ? (
        <View pointerEvents="none" style={styles.selected}>
          <View style={styles.selectedBadge}>
            <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />
          </View>
        </View>
      ) : null}
    </View>
  );
});

/** A light wash of a board's color, for the strip that stands for it. */
const tint = (color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? `${color}1F` : colors.list);

/**
 * The board a card stands for: its name, how many of its cards are done, and a button that opens
 * it. Teammates who don't have the board see its name, and can join it when it is shared.
 */
function LinkedBoard({ link, buttonRef }: { link: CardLink; buttonRef?: RefObject<ViewRef | null> }) {
  const board = useBoard(link.boardId);
  const progress = board ? boardProgress(board) : null;
  const complete = progress?.done != null && progress.total > 0 && progress.done === progress.total;
  return (
    <View style={[styles.link, { backgroundColor: board ? tint(board.color) : colors.list }]}>
      <Icon name="link" size={14} color={board ? colors.primary : colors.textFaint} />
      <Txt style={[styles.linkTitle, !board && styles.linkMissing]} numberOfLines={1}>
        {board?.title ?? link.title}
      </Txt>
      {progress?.done != null && progress.total > 0 ? (
        <View style={[styles.linkCount, complete && styles.linkCountDone]}>
          <Icon name="circle-check" size={12} color={complete ? colors.success : colors.textSubtle} />
          <Txt style={[styles.linkCountText, complete && styles.linkCountTextDone]}>
            {`${progress.done}/${progress.total}`}
          </Txt>
        </View>
      ) : null}
      {board || link.code ? (
        <View ref={buttonRef} collapsable={false} style={styles.linkOpen}>
          <Icon name="arrow-left" size={16} color={colors.primary} />
        </View>
      ) : (
        <Txt style={styles.linkMissing}>غير متاحة</Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    boxShadow: '0px 1px 1px rgba(9,30,66,0.25), 0px 0px 1px rgba(9,30,66,0.31)',
    overflow: 'hidden',
  },
  lifted: {
    boxShadow: '0px 10px 24px rgba(9,30,66,0.28), 0px 0px 1px rgba(9,30,66,0.31)',
  },
  cover: { height: 32 },
  body: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  labels: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 4 },
  label: {
    minWidth: 40,
    minHeight: 18,
    paddingVertical: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  labelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#172B4D',
    textAlign: 'center',
  },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8 },
  buttons: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.list,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: colors.primary,
    backgroundColor: 'rgba(12,102,228,0.06)',
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 15 },
  badges: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { fontSize: 12, color: colors.textSubtle },
  tasksButton: { backgroundColor: colors.list, borderRadius: 6, paddingVertical: 3 },
  tasksButtonOpen: { backgroundColor: '#E9F2FF' },
  tasksButtonDone: { backgroundColor: colors.successBg },
  tasks: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 2,
  },
  task: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2 },
  // Reaches the card's edge, so the circle is easy to hit; the rest of the row edits the task.
  taskCheck: { paddingVertical: 5, paddingLeft: 6, paddingRight: 12, marginRight: -12 },
  taskBody: { flex: 1, gap: 1 },
  taskDue: { fontSize: 10.5, color: colors.textFaint },
  taskDueLate: { color: colors.danger, fontWeight: '700' },
  taskText: { flex: 1, fontSize: 13, paddingVertical: 4 },
  taskDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  addTask: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 6 },
  addTaskIcon: { width: 18, alignItems: 'center' },
  addTaskText: { fontSize: 13, color: colors.textSubtle },
  // The people sit at the far end of the row, the way Trello shows members.
  assignees: { marginRight: 'auto' },
  link: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingRight: 8,
    paddingLeft: 4,
    paddingVertical: 4,
  },
  linkTitle: { flex: 1, fontSize: 13, fontWeight: '600' },
  linkMissing: { fontSize: 12, color: colors.textSubtle },
  linkCount: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  linkCountDone: { backgroundColor: colors.successBg },
  linkCountText: { fontSize: 12, color: colors.textSubtle },
  linkCountTextDone: { color: colors.success },
  linkOpen: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
