import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../../../components/ui/Avatar';
import { PeoplePicker } from '../../../../components/board/PeoplePicker';
import { Button, Chip, Icon, IconButton } from '../../../../components/ui/Buttons';
import { EditableText } from '../../../../components/ui/EditableText';
import { AvoidKeyboard } from '../../../../components/ui/Keyboard';
import { ModalHeader, Section } from '../../../../components/ui/Layout';
import { Sheet } from '../../../../components/ui/Sheet';
import { Input, Txt } from '../../../../components/ui/Txt';
import { addDays, formatLongDate, todayISO } from '../../../../lib/dates';
import { isHeld, movedProgress, stuckBefore } from '../../../../lib/meetings';
import { uid } from '../../../../lib/ids';
import { goBack } from '../../../../lib/nav';
import { OUTCOME_NAMES } from '../../../../lib/activityText';
import { MovedBar } from '../../../../components/board/MovedBar';
import { colors } from '../../../../lib/theme';
import type { IconName } from '../../../../components/ui/iconData';
import type { Board, Meeting, MeetingTopic, Outcome, OutcomeKind } from '../../../../shared/types';
import { cardFromOutcome, checklistFromOutcome, dispatch, policyFromOutcome } from '../../../../store/actions';
import { useBoard } from '../../../../store/store';

/** One meeting: when and where it was, who was there, and its agenda. */
export default function MeetingScreen() {
  const { id, meetingId } = useLocalSearchParams<{ id: string; meetingId: string }>();
  const insets = useSafeAreaInsets();
  const board = useBoard(id);
  const meeting = board?.meetings?.find((m) => m.id === meetingId);

  if (!board || !id || !meeting) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="الاجتماع" onClose={goBack} />
        <Txt style={styles.gone}>هذا الاجتماع لم يعد موجودًا.</Txt>
      </View>
    );
  }

  const update = (patch: Partial<Pick<Meeting, 'title' | 'date' | 'place' | 'held'>>) =>
    dispatch(id, { type: 'meeting/update', meetingId: meeting.id, patch });

  return (
    <View style={styles.screen}>
      <ModalHeader title="الاجتماع" onClose={goBack} />
      <AvoidKeyboard style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <EditableText
            value={meeting.title}
            onCommit={(title) => update({ title })}
            required
            placeholder="عنوان الاجتماع"
            style={styles.title}
            multiline
          />

          <HeldRow board={board} meeting={meeting} onChange={(held) => update({ held })} />
          <WhenSection date={meeting.date} onChange={(date) => update({ date })} />

          <Section title="المكان" icon="target">
            <EditableText
              value={meeting.place ?? ''}
              onCommit={(place) => update({ place })}
              placeholder="قاعة الاجتماعات، أو رابط اللقاء"
              style={styles.place}
            />
          </Section>

          <FollowUpSection board={board} meeting={meeting} />
          <AttendeesSection board={board} meeting={meeting} />
          <TopicsSection board={board} meeting={meeting} />

          <Button
            title="حذف الاجتماع"
            icon="trash"
            variant="danger"
            onPress={() => {
              dispatch(id, { type: 'meeting/remove', meetingId: meeting.id });
              goBack();
            }}
          />
        </ScrollView>
      </AvoidKeyboard>
    </View>
  );
}

/**
 * Whether it took place, and how much of what it decided has been written down where it is
 * followed. Two different questions: a meeting can be held and nothing filed, or every decision
 * filed and none of it done yet.
 */
function HeldRow({ board, meeting, onChange }: { board: Board; meeting: Meeting; onChange: (held: boolean) => void }) {
  const held = isHeld(meeting);
  const { moved, total } = movedProgress(board, meeting);
  return (
    <View style={styles.heldRow}>
      <Chip
        label={held ? 'عُقد' : 'لم يُعقد بعد'}
        icon={held ? 'check' : 'clock'}
        selected={held}
        onPress={() => onChange(!held)}
      />
      {total > 0 ? (
        <View style={styles.heldBar}>
          <MovedBar moved={moved} total={total} />
        </View>
      ) : null}
    </View>
  );
}

function WhenSection({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const today = todayISO();
  return (
    <Section title="التاريخ" icon="calendar">
      <View style={styles.dateRow}>
        <IconButton name="chevron-right" label="اليوم السابق" onPress={() => onChange(addDays(date, -1))} />
        <View style={styles.dateBox}>
          <Txt style={styles.dateText}>{formatLongDate(date)}</Txt>
        </View>
        <IconButton name="chevron-left" label="اليوم التالي" onPress={() => onChange(addDays(date, 1))} />
      </View>
      <View style={styles.wrapRow}>
        <Chip label="اليوم" selected={date === today} onPress={() => onChange(today)} />
        <Chip label="أمس" selected={date === addDays(today, -1)} onPress={() => onChange(addDays(today, -1))} />
      </View>
    </Section>
  );
}

/**
 * Who was in the room, picked from the board's own roster — everyone who has opened this board.
 * A name is kept with each one, so a record of who attended on a day does not change when someone
 * later renames themselves or stops using the board.
 */
function AttendeesSection({ board, meeting }: { board: Board; meeting: Meeting }) {
  const roster = board.members ?? [];
  const here = new Set(meeting.attendees.map((a) => a.id));
  // Someone recorded as present who is no longer on the roster still shows, and stays removable.
  const absent = meeting.attendees.filter((a) => !roster.some((m) => m.id === a.id));

  return (
    <Section title="الحضور" icon="users" right={<Txt style={styles.count}>{meeting.attendees.length}</Txt>}>
      {roster.length === 0 && absent.length === 0 ? (
        <Txt style={styles.note}>
          لا أحد على سجلّ هذه اللوحة بعد. من يفتحها بحسابه يظهر هنا، فتختاره من الحضور.
        </Txt>
      ) : (
        <View style={styles.wrapRow}>
          {[...roster.map((m) => ({ id: m.id, name: m.name })), ...absent].map((person) => (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              aria-selected={here.has(person.id)}
              onPress={() =>
                dispatch(board.id, {
                  type: 'meeting/attend',
                  meetingId: meeting.id,
                  person,
                  on: !here.has(person.id),
                })
              }
              style={({ pressed }) => [
                styles.person,
                here.has(person.id) && styles.personOn,
                pressed && styles.pressed,
              ]}
            >
              <Avatar person={person} size={24} />
              <Txt style={[styles.personName, here.has(person.id) && styles.personNameOn]}>{person.name}</Txt>
              {here.has(person.id) ? <Icon name="check" size={14} color={colors.surface} /> : null}
            </Pressable>
          ))}
        </View>
      )}
    </Section>
  );
}

function TopicsSection({ board, meeting }: { board: Board; meeting: Meeting }) {
  const [draft, setDraft] = useState('');
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const outcomes = meeting.outcomes ?? [];
  // Outcomes not tied to any topic (general outcomes)
  const generalOutcomes = outcomes.filter((o) => !o.topicId || !meeting.topics.some((t) => t.id === o.topicId));

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    dispatch(board.id, { type: 'topic/add', meetingId: meeting.id, topic: { id: uid(), title, notes: '' } });
    setDraft('');
    setIsAddingTopic(false);
  };

  return (
    <Section title="المحاور والتوصيات" icon="checklist" right={<Txt style={styles.count}>{meeting.topics.length}</Txt>}>
      <View style={styles.documentCard}>
        {meeting.topics.length === 0 ? (
          <Txt style={styles.emptyDocText}>لا توجد محاور مسجلة لهذا الاجتماع بعد.</Txt>
        ) : null}

        {meeting.topics.map((topic, index) => (
          <TopicRow
            key={topic.id}
            board={board}
            meeting={meeting}
            topic={topic}
            outcomes={outcomes.filter((o) => o.topicId === topic.id)}
            index={index}
            last={index === meeting.topics.length - 1}
          />
        ))}

        {isAddingTopic ? (
          <View style={styles.addTopicInline}>
            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder="اكتب عنوان المحور..."
              onSubmitEditing={add}
              returnKeyType="done"
              autoFocus
              style={styles.cleanTopicInput}
            />
            <View style={styles.addInlineActions}>
              <Button title="إضافة" compact onPress={add} disabled={!draft.trim()} />
              <Button title="إلغاء" variant="ghost" compact onPress={() => { setDraft(''); setIsAddingTopic(false); }} />
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsAddingTopic(true)}
            style={({ pressed }) => [styles.addTopicBtn, pressed && styles.pressed]}
          >
            <Icon name="plus" size={16} color={colors.primary} />
            <Txt style={styles.addTopicBtnText}>إضافة محور جديد</Txt>
          </Pressable>
        )}

        {/* General outcomes not tied to any topic */}
        {generalOutcomes.length > 0 ? (
          <View style={styles.generalOutcomesBlock}>
            <View style={styles.generalDocHeader}>
              <Icon name="target" size={15} color={colors.textSubtle} />
              <Txt style={styles.generalDocTitle}>توصيات وقرارات عامة</Txt>
            </View>
            <View style={styles.docOutcomesList}>
              {generalOutcomes.map((outcome) => (
                <OutcomeRow key={outcome.id} board={board} meeting={meeting} outcome={outcome} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Section>
  );
}

function TopicRow({
  board,
  meeting,
  topic,
  outcomes,
  index,
  last,
}: {
  board: Board;
  /** Passed down rather than looked up again: the parent already holds it, and looking it up here
      meant asserting it exists — which it may not, if a teammate deletes it mid-render. */
  meeting: Meeting;
  topic: MeetingTopic;
  outcomes: Outcome[];
  index: number;
  last: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<OutcomeKind>('task');
  const [isAdding, setIsAdding] = useState(false);
  const boardId = board.id;
  const meetingId = meeting.id;

  const move = (to: number) => dispatch(boardId, { type: 'topic/move', meetingId, topicId: topic.id, toIndex: to });

  const addOutcome = () => {
    const text = draft.trim();
    if (!text) return;
    dispatch(boardId, {
      type: 'outcome/add',
      meetingId,
      outcome: {
        id: uid(),
        kind,
        text,
        topicId: topic.id,
        assignee: null,
        due: null,
        cardId: null,
      },
    });
    setDraft('');
    setIsAdding(false);
  };

  return (
    <View style={[styles.docTopicSection, last && styles.docTopicSectionLast]}>
      {/* Header of the topic as a clean document heading */}
      <View style={styles.docTopicHeader}>
        <View style={styles.docTopicNumberBadge}>
          <Txt style={styles.docTopicNumberText}>{index + 1}</Txt>
        </View>

        <View style={styles.docTopicTitleWrapper}>
          <EditableText
            value={topic.title}
            onCommit={(title) => dispatch(boardId, { type: 'topic/update', meetingId, topicId: topic.id, patch: { title } })}
            required
            placeholder="عنوان المحور"
            style={styles.docTopicTitleInput}
            multiline
          />
        </View>

        <View style={styles.docTopicActions}>
          {topic.subjectId ? (
            <IconButton
              name="history"
              size={18}
              label={`كل ما تقرّر عن ${topic.title}`}
              onPress={() => router.push(`/board/${boardId}/subject/${topic.subjectId}`)}
            />
          ) : null}
          <IconButton name="chevron-up" size={17} label="أعلى" onPress={() => move(index - 1)} disabled={index === 0} />
          <IconButton name="chevron-down" size={17} label="أسفل" onPress={() => move(index + 1)} disabled={last} />
          <IconButton
            name="trash"
            size={17}
            label="حذف المحور"
            onPress={() => dispatch(boardId, { type: 'topic/remove', meetingId, topicId: topic.id })}
          />
        </View>
      </View>

      {/* Decisions/Outcomes under this topic - clean document list */}
      <View style={styles.docOutcomesList}>
        {outcomes.map((outcome) => (
          <OutcomeRow key={outcome.id} board={board} meeting={meeting} outcome={outcome} />
        ))}

        {/* Inline add outcome button / form */}
        {isAdding ? (
          <View style={styles.docAddOutcomeBox}>
            <View style={styles.docKindsRow}>
              {KINDS.map((k) => (
                <Pressable
                  key={k.kind}
                  onPress={() => setKind(k.kind)}
                  style={[styles.docKindOption, kind === k.kind && styles.docKindOptionSelected]}
                >
                  <Icon name={k.icon} size={12} color={kind === k.kind ? colors.primary : colors.textSubtle} />
                  <Txt style={[styles.docKindOptionText, kind === k.kind && styles.docKindOptionTextSelected]}>
                    {OUTCOME_NAMES[k.kind]}
                  </Txt>
                </Pressable>
              ))}
            </View>

            <Input
              value={draft}
              onChangeText={setDraft}
              placeholder="اكتب ما تم إقراره أو التوصية به..."
              style={styles.docAddOutcomeInput}
              multiline
              autoFocus
            />

            <View style={styles.docAddOutcomeControls}>
              <Button title="إضافة التوصية" compact onPress={addOutcome} disabled={!draft.trim()} />
              <Button title="إلغاء" variant="ghost" compact onPress={() => { setDraft(''); setIsAdding(false); }} />
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsAdding(true)}
            style={({ pressed }) => [styles.docAddDecisionBtn, pressed && styles.pressed]}
          >
            <Icon name="plus" size={14} color={colors.textFaint} />
            <Txt style={styles.docAddDecisionBtnText}>إضافة توصية لهذا المحور</Txt>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * What earlier meetings left open — tasks not done, rules agreed and never written down.
 */
function FollowUpSection({ board, meeting }: { board: Board; meeting: Meeting }) {
  const groups = stuckBefore(board, meeting.id);
  if (groups.length === 0) return null;

  const total = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <Section title="لم تُرحَّل بعد" icon="history" right={<Txt style={styles.count}>{total}</Txt>}>
      {groups.map((group) => (
        <View key={group.meeting.id} style={styles.group}>
          <Pressable
            onPress={() => router.push(`/board/${board.id}/meeting/${group.meeting.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.followHead, pressed && styles.pressed]}
          >
            <Txt style={styles.groupTitle}>
              {group.meeting.title} · {formatLongDate(group.meeting.date)}
            </Txt>
            <Icon name="chevron-left" size={14} color={colors.textFaint} />
          </Pressable>

          {group.items.map((item) => (
            <View key={item.id} style={styles.followRow}>
              <Pressable
                accessibilityRole="checkbox"
                aria-checked={false}
                accessibilityLabel={`ترحيل ${item.text}`}
                onPress={() =>
                  dispatch(board.id, {
                    type: 'outcome/update',
                    meetingId: group.meeting.id,
                    outcomeId: item.id,
                    patch: { done: true },
                  })
                }
                style={({ pressed }) => [styles.followCheck, pressed && styles.pressed]}
              >
                <Icon name="check" size={14} color={colors.textFaint} />
              </Pressable>
              <View style={styles.followBody}>
                <Txt style={styles.followText} numberOfLines={3}>
                  {item.text}
                </Txt>
                <Txt style={styles.followMeta}>
                  {OUTCOME_NAMES[item.kind]}
                  {item.assignee ? ` · ${item.assignee.name}` : ''}
                  {item.due ? ` · ${formatLongDate(item.due)}` : ''}
                </Txt>
              </View>
            </View>
          ))}
        </View>
      ))}
    </Section>
  );
}

/** The kinds a recommendation can take, in the order they are offered. */
const KINDS: { kind: OutcomeKind; icon: IconName; hint: string }[] = [
  { kind: 'task', icon: 'checks', hint: 'يفعلها أحدهم وتنتهي' },
  { kind: 'assignment', icon: 'user', hint: 'يحملها أحدهم من الآن فصاعدًا — لا تنتهي' },
  { kind: 'note', icon: 'description', hint: 'خلاصة أو ملخّص نقاش' },
  { kind: 'announcement', icon: 'info', hint: 'توجيه عامّ للجميع' },
  { kind: 'policy', icon: 'book', hint: 'قاعدة دائمة تدخل السياسات' },
];

/** The kinds that belong to a person: a task is owed, a responsibility is held. */
const HAS_OWNER: OutcomeKind[] = ['task', 'assignment'];

function OutcomeRow({ board, meeting, outcome }: { board: Board; meeting: Meeting; outcome: Outcome }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'detail' | 'topics' | 'cards' | 'people' | 'move'>('detail');
  const [textDraft, setTextDraft] = useState(outcome.text);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [newTopicDraft, setNewTopicDraft] = useState('');

  const openSheet = () => {
    setTextDraft(outcome.text);
    setView('detail');
    setOpen(true);
  };

  const isTask = outcome.kind === 'task';
  const hasOwner = HAS_OWNER.includes(outcome.kind);
  const card = outcome.cardId ? board.cards[outcome.cardId] : undefined;
  const policy = outcome.policyId ? (board.policies ?? []).find((p) => p.id === outcome.policyId) : undefined;
  const policyTopic = policy?.topicId ? (board.policyTopics ?? []).find((t) => t.id === policy.topicId) : undefined;
  const policySubtopic =
    policyTopic && policy?.subtopicId ? policyTopic.subtopics.find((s) => s.id === policy.subtopicId) : undefined;
  const policyTopics = board.policyTopics ?? [];
  const existingPolicies = (board.policies ?? []).filter((p) => p.id !== policy?.id);

  const update = (patch: Parameters<typeof dispatchOutcome>[3]) =>
    dispatchOutcome(board.id, meeting.id, outcome.id, patch);

  const assignPolicyToTopic = (topicId: string, subtopicId: string | null = null) => {
    if (policy) {
      dispatch(board.id, {
        type: 'policy/update',
        policyId: policy.id,
        patch: { topicId, subtopicId },
      });
    } else {
      policyFromOutcome(board.id, meeting.id, outcome.id, { topicId, subtopicId });
    }
    setView('detail');
    setCreatingTopic(false);
  };

  const createAndAssignTopic = () => {
    const title = newTopicDraft.trim();
    if (!title) return;
    const newTopicId = uid();
    const policiesCol = (board.columns ?? []).find((c) => c.kind === 'policies');
    dispatch(board.id, {
      type: 'topic/addPolicy',
      topic: { id: newTopicId, title, columnId: policiesCol?.id ?? null, subtopics: [] },
    });
    assignPolicyToTopic(newTopicId, null);
    setNewTopicDraft('');
  };

  const makeStandalonePolicy = () => {
    if (policy) {
      dispatch(board.id, {
        type: 'policy/update',
        policyId: policy.id,
        patch: { topicId: null, subtopicId: null },
      });
    } else {
      policyFromOutcome(board.id, meeting.id, outcome.id);
    }
    setView('detail');
  };

  const amendPolicy = (amendsId: string) => {
    policyFromOutcome(board.id, meeting.id, outcome.id, { amends: amendsId });
    setView('detail');
  };

  const handleClose = () => {
    setOpen(false);
    setView('detail');
    setCreatingTopic(false);
  };

  const sheetTitle =
    view === 'topics'
      ? 'تصنيف السياسة كبند في موضوع'
      : view === 'cards'
      ? 'في أي بطاقة؟'
      : view === 'people'
      ? 'مسؤول التوصية'
      : view === 'move'
      ? 'تحت أي محور؟'
      : 'تفاصيل التوصية';

  return (
    <>
      {/* Read-only Outcome Row in document */}
      <Pressable
        accessibilityRole="button"
        onPress={openSheet}
        style={({ pressed }) => [styles.docOutcomeItem, pressed && styles.pressed]}
      >
        <View style={styles.docOutcomeMainRow}>
          {outcome.kind === 'task' || outcome.kind === 'policy' ? (
            <Pressable
              accessibilityRole="checkbox"
              aria-checked={outcome.done === true}
              accessibilityLabel={`ترحيل ${outcome.text}`}
              onPress={(e) => {
                e.stopPropagation?.();
                update({ done: !outcome.done });
              }}
              style={({ pressed }) => [styles.docDoneBox, outcome.done && styles.docDoneBoxOn, pressed && styles.pressed]}
            >
              {outcome.done ? <Icon name="check" size={11} color={colors.surface} /> : null}
            </Pressable>
          ) : (
            <View style={styles.docBulletPoint} />
          )}

          <View style={styles.docKindBadge}>
            <Icon name={KINDS.find((k) => k.kind === outcome.kind)?.icon ?? 'description'} size={11} color={colors.primary} />
            <Txt style={styles.docKindBadgeText}>{OUTCOME_NAMES[outcome.kind]}</Txt>
          </View>

          <View style={styles.docOutcomeTextWrap}>
            <Txt style={[styles.docOutcomeReadText, outcome.done && styles.docOutcomeTextDone]}>
              {outcome.text || 'بدون نص'}
            </Txt>
          </View>

          <Icon name="chevron-left" size={14} color={colors.textFaint} />
        </View>

        {/* Subtle preview metadata if set */}
        {outcome.assignee || outcome.due || policy || card ? (
          <View style={styles.docOutcomeMetaRow}>
            {outcome.assignee ? (
              <View style={styles.subtleTag}>
                <Icon name="user" size={11} color={colors.primary} />
                <Txt style={[styles.subtleTagText, styles.subtleTagTextActive]}>{outcome.assignee.name}</Txt>
              </View>
            ) : null}

            {outcome.due ? (
              <View style={styles.subtleTag}>
                <Icon name="calendar" size={11} color={colors.textSubtle} />
                <Txt style={styles.subtleTagText}>{formatLongDate(outcome.due)}</Txt>
              </View>
            ) : null}

            {policy ? (
              <View style={styles.subtleSuccessTag}>
                <Icon name="book" size={11} color={colors.success} />
                <Txt style={styles.subtleSuccessTagText} numberOfLines={1}>
                  {policyTopic ? `بند في: ${policyTopic.title}` : 'مُقرّة بالسياسات'}
                </Txt>
              </View>
            ) : null}

            {card ? (
              <View style={styles.subtleSuccessTag}>
                <Icon name="kanban" size={11} color={colors.success} />
                <Txt style={styles.subtleSuccessTagText} numberOfLines={1}>
                  على اللوحة: {card.title}
                </Txt>
              </View>
            ) : null}
          </View>
        ) : null}
      </Pressable>

      {/* Outcome Detail & Actions Sheet */}
      <Sheet visible={open} onClose={handleClose} title={sheetTitle}>
        {view !== 'detail' ? (
          <Pressable
            onPress={() => setView('detail')}
            style={({ pressed }) => [styles.sheetBackRow, pressed && styles.pressed]}
          >
            <Icon name="chevron-right" size={16} color={colors.primary} />
            <Txt style={styles.sheetBackText}>العودة لتفاصيل التوصية</Txt>
          </Pressable>
        ) : null}

        {view === 'detail' && (
          <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
            {/* Text input for editing */}
            <View style={styles.sheetFieldGroup}>
              <Txt style={styles.sheetFieldLabel}>نص التوصية</Txt>
              <Input
                value={textDraft}
                onChangeText={(val) => {
                  setTextDraft(val);
                  update({ text: val });
                }}
                placeholder="اكتب نص التوصية..."
                multiline
                style={styles.sheetOutcomeInput}
              />
            </View>

            {/* Kind selector */}
            <View style={styles.sheetFieldGroup}>
              <Txt style={styles.sheetFieldLabel}>نوع التوصية</Txt>
              <View style={styles.docKindsRow}>
                {KINDS.map((k) => (
                  <Pressable
                    key={k.kind}
                    onPress={() => update({ kind: k.kind })}
                    style={[styles.docKindOption, outcome.kind === k.kind && styles.docKindOptionSelected]}
                  >
                    <Icon name={k.icon} size={12} color={outcome.kind === k.kind ? colors.primary : colors.textSubtle} />
                    <Txt style={[styles.docKindOptionText, outcome.kind === k.kind && styles.docKindOptionTextSelected]}>
                      {OUTCOME_NAMES[k.kind]}
                    </Txt>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Status toggle (done) */}
            {outcome.kind === 'task' || outcome.kind === 'policy' ? (
              <Pressable
                accessibilityRole="checkbox"
                aria-checked={outcome.done === true}
                onPress={() => update({ done: !outcome.done })}
                style={({ pressed }) => [styles.sheetActionRow, pressed && styles.pressed]}
              >
                <View style={styles.sheetActionRight}>
                  <View style={[styles.docDoneBox, outcome.done && styles.docDoneBoxOn]}>
                    {outcome.done ? <Icon name="check" size={11} color={colors.surface} /> : null}
                  </View>
                  <Txt style={styles.sheetActionTitle}>
                    {outcome.kind === 'policy' ? 'إقرار وترحيل السياسة' : 'اكتمال التوصية'}
                  </Txt>
                </View>
                <Txt style={[styles.sheetActionValue, outcome.done && styles.sheetActionValueSuccess]}>
                  {outcome.done ? 'مكتملة' : 'غير مكتملة'}
                </Txt>
              </Pressable>
            ) : null}

            {/* Assignee */}
            {hasOwner ? (
              <Pressable
                onPress={() => setView('people')}
                style={({ pressed }) => [styles.sheetActionRow, pressed && styles.pressed]}
              >
                <View style={styles.sheetActionRight}>
                  <Icon name="user" size={16} color={colors.textSubtle} />
                  <Txt style={styles.sheetActionTitle}>المسؤول</Txt>
                </View>
                <View style={styles.sheetActionLeft}>
                  <Txt style={[styles.sheetActionValue, outcome.assignee && styles.sheetActionValuePrimary]}>
                    {outcome.assignee ? outcome.assignee.name : 'تحديد مسؤول'}
                  </Txt>
                  <Icon name="chevron-left" size={14} color={colors.textFaint} />
                </View>
              </Pressable>
            ) : null}

            {/* Date */}
            <View style={styles.sheetActionRow}>
              <View style={styles.sheetActionRight}>
                <Icon name="calendar" size={16} color={colors.textSubtle} />
                <Txt style={styles.sheetActionTitle}>التاريخ</Txt>
              </View>
              <View style={styles.sheetActionLeft}>
                {outcome.due ? (
                  <View style={styles.sheetDateControls}>
                    <IconButton
                      name="chevron-right"
                      size={13}
                      label="اليوم السابق"
                      style={styles.miniStepper}
                      onPress={() => update({ due: addDays(outcome.due!, -1) })}
                    />
                    <Txt style={styles.sheetActionValuePrimary}>{formatLongDate(outcome.due)}</Txt>
                    <IconButton
                      name="chevron-left"
                      size={13}
                      label="اليوم التالي"
                      style={styles.miniStepper}
                      onPress={() => update({ due: addDays(outcome.due!, 1) })}
                    />
                    <IconButton
                      name="close"
                      size={13}
                      label="إزالة التاريخ"
                      style={styles.miniStepper}
                      onPress={() => update({ due: null })}
                    />
                  </View>
                ) : (
                  <Pressable onPress={() => update({ due: todayISO() })}>
                    <Txt style={styles.sheetActionLink}>+ تعيين تاريخ</Txt>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Which topic it sits under. The operation existed from the start; only the way to
                reach it did not, so a decision written under the wrong heading was stuck there. */}
            <Pressable
              onPress={() => setView('move')}
              style={({ pressed }) => [styles.sheetActionRow, pressed && styles.pressed]}
            >
              <View style={styles.sheetActionRight}>
                <Icon name="checklist" size={16} color={colors.textSubtle} />
                <Txt style={styles.sheetActionTitle}>المحور</Txt>
              </View>
              <View style={styles.sheetActionLeft}>
                <Txt style={styles.sheetActionValue}>
                  {meeting.topics.find((t) => t.id === outcome.topicId)?.title ?? 'عامة'}
                </Txt>
                <Icon name="chevron-left" size={14} color={colors.textFaint} />
              </View>
            </Pressable>

            {/* Policy options */}
            {outcome.kind === 'policy' ? (
              <Pressable
                onPress={() => setView('topics')}
                style={({ pressed }) => [styles.sheetActionRow, pressed && styles.pressed]}
              >
                <View style={styles.sheetActionRight}>
                  <Icon name="book" size={16} color={colors.primary} />
                  <Txt style={styles.sheetActionTitle}>تصنيف السياسة</Txt>
                </View>
                <View style={styles.sheetActionLeft}>
                  <Txt style={[styles.sheetActionValue, policy && styles.sheetActionValuePrimary]}>
                    {policyTopic
                      ? `بند في: ${policyTopic.title}${policySubtopic ? ` › ${policySubtopic.title}` : ''}`
                      : policy
                      ? 'مُقرّة (بدون موضوع)'
                      : 'إقرار كبند في السياسات'}
                  </Txt>
                  <Icon name="chevron-left" size={14} color={colors.textFaint} />
                </View>
              </Pressable>
            ) : null}

            {/* Task -> Card conversion */}
            {isTask ? (
              card ? (
                <Pressable
                  onPress={() => {
                    setOpen(false);
                    router.push(`/board/${board.id}/card/${card.id}`);
                  }}
                  style={({ pressed }) => [styles.sheetActionRow, pressed && styles.pressed]}
                >
                  <View style={styles.sheetActionRight}>
                    <Icon name="kanban" size={16} color={colors.success} />
                    <Txt style={styles.sheetActionTitle}>البطاقة على اللوحة</Txt>
                  </View>
                  <View style={styles.sheetActionLeft}>
                    <Txt style={styles.sheetActionValueSuccess}>{card.title}</Txt>
                    <Icon name="chevron-left" size={14} color={colors.textFaint} />
                  </View>
                </Pressable>
              ) : (
                <View style={styles.sheetActionRow}>
                  <View style={styles.sheetActionRight}>
                    <Icon name="kanban" size={16} color={colors.textSubtle} />
                    <Txt style={styles.sheetActionTitle}>اللوحة</Txt>
                  </View>
                  <View style={styles.sheetActionLeft}>
                    {board.lists.length > 0 ? (
                      <Button
                        title="بطاقة جديدة"
                        compact
                        variant="secondary"
                        onPress={() => cardFromOutcome(board.id, meeting.id, outcome.id)}
                      />
                    ) : null}
                    {Object.keys(board.cards).length > 0 ? (
                      <Button
                        title="في بطاقة..."
                        compact
                        variant="ghost"
                        onPress={() => setView('cards')}
                      />
                    ) : null}
                  </View>
                </View>
              )
            ) : null}

            {/* Delete button */}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                dispatch(board.id, { type: 'outcome/remove', meetingId: meeting.id, outcomeId: outcome.id });
                setOpen(false);
              }}
              style={({ pressed }) => [styles.sheetDeleteRow, pressed && styles.pressed]}
            >
              <Icon name="trash" size={16} color={colors.danger} />
              <Txt style={styles.sheetDeleteText}>حذف التوصية</Txt>
            </Pressable>
          </ScrollView>
        )}

        {view === 'topics' && (
          <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
            <Txt style={styles.choiceHead}>إضافة كبند تحت موضوع سياسة:</Txt>

            {policyTopics.map((t) => {
              const isSelectedDirect = policy?.topicId === t.id && !policy?.subtopicId;
              return (
                <View key={t.id} style={styles.choiceTopicGroup}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => assignPolicyToTopic(t.id, null)}
                    style={({ pressed }) => [
                      styles.choice,
                      isSelectedDirect && styles.choiceSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon name="layers" size={16} color={isSelectedDirect ? colors.primary : colors.textSubtle} />
                    <View style={styles.flex}>
                      <Txt style={[styles.choiceTopicTitle, isSelectedDirect && styles.choiceTopicTitleSelected]}>
                        {t.title}
                      </Txt>
                      {t.subtopics.length > 0 ? (
                        <Txt style={styles.choiceSubtleHint}>كبند رئيسي في الموضوع</Txt>
                      ) : null}
                    </View>
                    {isSelectedDirect ? <Icon name="check" size={16} color={colors.primary} /> : null}
                  </Pressable>

                  {t.subtopics.map((sub) => {
                    const isSelectedSub = policy?.topicId === t.id && policy?.subtopicId === sub.id;
                    return (
                      <Pressable
                        key={sub.id}
                        accessibilityRole="button"
                        onPress={() => assignPolicyToTopic(t.id, sub.id)}
                        style={({ pressed }) => [
                          styles.choice,
                          styles.choiceSubtopic,
                          isSelectedSub && styles.choiceSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Icon name="chevron-left" size={13} color={isSelectedSub ? colors.primary : colors.textFaint} />
                        <Txt style={[styles.choiceSubtopicText, isSelectedSub && styles.choiceSubtopicTextSelected]}>
                          {sub.title}
                        </Txt>
                        {isSelectedSub ? <Icon name="check" size={16} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}

            {creatingTopic ? (
              <View style={styles.inlineAddTopic}>
                <Input
                  autoFocus
                  value={newTopicDraft}
                  onChangeText={setNewTopicDraft}
                  placeholder="عنوان موضوع السياسة الجديد..."
                  style={styles.inlineAddTopicInput}
                  onSubmitEditing={createAndAssignTopic}
                  returnKeyType="done"
                />
                <View style={styles.inlineAddTopicActions}>
                  <Button title="إنشاء وتعيين" compact onPress={createAndAssignTopic} disabled={!newTopicDraft.trim()} />
                  <Button title="إلغاء" variant="ghost" compact onPress={() => { setNewTopicDraft(''); setCreatingTopic(false); }} />
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setCreatingTopic(true)}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
              >
                <Icon name="plus" size={16} color={colors.primary} />
                <Txt style={styles.choiceNew}>+ إنشاء موضوع سياسة جديد</Txt>
              </Pressable>
            )}

            {policy?.topicId ? (
              <Pressable
                accessibilityRole="button"
                onPress={makeStandalonePolicy}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
              >
                <Icon name="close" size={16} color={colors.danger} />
                <Txt style={styles.choiceTextDanger}>إزالة من الموضوع (إبقاء كسياسة مستقلة)</Txt>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={makeStandalonePolicy}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
              >
                <Icon name="book" size={16} color={colors.textSubtle} />
                <Txt style={styles.choiceText}>سياسة مستقلة (بدون تحديد موضوع)</Txt>
              </Pressable>
            )}

            {!policy && existingPolicies.length ? (
              <>
                <Txt style={styles.choiceHead}>أو تعدّل سياسة قائمة:</Txt>
                {existingPolicies.map((p) => (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    onPress={() => amendPolicy(p.id)}
                    style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                  >
                    <Icon name="replace" size={16} color={colors.textSubtle} />
                    <Txt style={styles.choiceText} numberOfLines={2}>
                      {p.text}
                    </Txt>
                  </Pressable>
                ))}
              </>
            ) : null}
          </ScrollView>
        )}

        {view === 'cards' && (
          <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
            {board.lists.map((list) => {
              const cards = list.cardIds.map((cid) => board.cards[cid]).filter(Boolean);
              if (cards.length === 0) return null;
              return (
                <View key={list.id}>
                  <Txt style={styles.choiceHead}>{list.title}</Txt>
                  {cards.map((c) => (
                    <Pressable
                      key={c.id}
                      accessibilityRole="button"
                      onPress={() => {
                        checklistFromOutcome(board.id, meeting.id, outcome.id, c.id);
                        setView('detail');
                      }}
                      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                    >
                      <Icon name="kanban" size={15} color={colors.textSubtle} />
                      <Txt style={styles.choiceText} numberOfLines={2}>
                        {c.title}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        )}

        {view === 'move' && (
          <View style={styles.moveList}>
            {[{ id: null as string | null, title: 'عامة' }, ...meeting.topics].map((t) => {
              const here = (outcome.topicId ?? null) === t.id;
              return (
                <Pressable
                  key={t.id ?? 'general'}
                  accessibilityRole="button"
                  aria-selected={here}
                  onPress={() => {
                    if (!here) update({ topicId: t.id });
                    setView('detail');
                  }}
                  style={({ pressed }) => [styles.moveRow, here && styles.moveRowOn, pressed && styles.pressed]}
                >
                  <Icon
                    name={here ? 'check' : 'checklist'}
                    size={16}
                    color={here ? colors.primary : colors.textSubtle}
                  />
                  <Txt style={[styles.moveText, here && styles.moveTextOn]} numberOfLines={2}>
                    {t.title}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        )}

        {view === 'people' && (
          <PeoplePicker
            members={board.members ?? []}
            single
            shared={!!board.shareCode}
            selected={outcome.assignee ? [outcome.assignee.id] : []}
            onChange={(member) => {
              update({ assignee: member ? { id: member.id, name: member.name } : null });
              setView('detail');
            }}
            onSignIn={() => {
              setOpen(false);
              router.push('/sign-in');
            }}
          />
        )}
      </Sheet>
    </>
  );
}

/** Narrow helper so a row's `update` keeps the patch's type without repeating it. */
function dispatchOutcome(
  boardId: string,
  meetingId: string,
  outcomeId: string,
  patch: Partial<Pick<Outcome, 'kind' | 'text' | 'topicId' | 'assignee' | 'due' | 'cardId' | 'policyId' | 'done'>>,
) {
  dispatch(boardId, { type: 'outcome/update', meetingId, outcomeId, patch });
}

const styles = StyleSheet.create({
  moveList: { paddingHorizontal: 16, paddingBottom: 16, gap: 6 },
  moveRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.list,
  },
  moveRowOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  moveText: { flex: 1, fontSize: 14 },
  moveTextOn: { fontWeight: '700', color: colors.primary },
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: 16, gap: 18, width: '100%', maxWidth: 680, alignSelf: 'center' },
  gone: { padding: 24, textAlign: 'center', color: colors.textSubtle },
  title: { fontSize: 20, fontWeight: '700', backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0 },
  place: { fontSize: 15 },
  count: { marginStart: 'auto', fontSize: 12.5, color: colors.textSubtle },
  note: { fontSize: 13, color: colors.textSubtle, lineHeight: 24 },
  noteFaint: { fontSize: 11.5, color: colors.textFaint },
  dateRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  dateBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.list,
  },
  dateText: { fontSize: 15, fontWeight: '700' },
  wrapRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  person: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  personOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  personName: { fontSize: 13.5 },
  personNameOn: { color: colors.surface, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  heldRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  heldBar: { flex: 1 },
  group: { gap: 8, marginBottom: 14 },
  groupTitle: { fontSize: 12.5, fontWeight: '700', color: colors.textSubtle },
  followHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  followRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    padding: 11,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  followCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBody: { flex: 1, gap: 3 },
  followText: { fontSize: 14, lineHeight: 24 },
  followMeta: { fontSize: 11.5, color: colors.textFaint },

  /* --- Elegant Document Style for Topics and Decisions --- */
  documentCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 18,
  },
  emptyDocText: {
    fontSize: 14,
    color: colors.textFaint,
    textAlign: 'center',
    paddingVertical: 12,
  },
  docTopicSection: {
    gap: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.list,
  },
  docTopicSectionLast: {
    borderBottomWidth: 0,
    paddingBottom: 4,
  },
  docTopicHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  docTopicNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: colors.list,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTopicNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSubtle,
  },
  docTopicTitleWrapper: {
    flex: 1,
  },
  docTopicTitleInput: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  docTopicActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
  },
  docOutcomesList: {
    paddingEnd: 24,
    gap: 10,
  },
  docOutcomeItem: {
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FAFBFC',
  },
  docOutcomeMainRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
  },
  docBulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textFaint,
    marginTop: 10,
  },
  docDoneBox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginTop: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docDoneBoxOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  docKindBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#E9F2FF',
    marginTop: 4,
  },
  docKindBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  docOutcomeTextWrap: {
    flex: 1,
  },
  docOutcomeText: {
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.text,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 2,
  },
  docOutcomeTextDone: {
    textDecorationLine: 'line-through',
    color: colors.textFaint,
  },
  docOutcomeMetaRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingEnd: 26,
  },
  subtleTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: colors.list,
  },
  subtleTagText: {
    fontSize: 11.5,
    color: colors.textFaint,
  },
  subtleTagTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  docDateSteppers: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
  },
  miniStepper: {
    width: 22,
    height: 22,
  },
  subtleSuccessTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: colors.successBg,
  },
  subtleSuccessTagText: {
    fontSize: 11.5,
    color: colors.success,
    fontWeight: '600',
  },
  subtleActionTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: '#E9F2FF',
  },
  subtleActionTagText: {
    fontSize: 11.5,
    color: colors.primary,
    fontWeight: '600',
  },
  subtleActionTagTextSubtle: {
    fontSize: 11.5,
    color: colors.textSubtle,
    fontWeight: '500',
  },
  docConvertLinks: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },

  /* Inline add forms */
  docAddDecisionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignSelf: 'flex-start',
  },
  docAddDecisionBtnText: {
    fontSize: 12.5,
    color: colors.textFaint,
  },
  docAddOutcomeBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginTop: 4,
  },
  docKindsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  docKindOption: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: colors.list,
  },
  docKindOptionSelected: {
    backgroundColor: '#E9F2FF',
  },
  docKindOptionText: {
    fontSize: 11.5,
    color: colors.textSubtle,
  },
  docKindOptionTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  docAddOutcomeInput: {
    fontSize: 14,
    minHeight: 46,
    backgroundColor: colors.list,
    borderWidth: 0,
    borderRadius: 6,
    padding: 8,
  },
  docAddOutcomeControls: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },

  addTopicBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  addTopicBtnText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  addTopicInline: {
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.list,
  },
  cleanTopicInput: {
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addInlineActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },

  generalOutcomesBlock: {
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.list,
    gap: 10,
  },
  generalDocHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  generalDocTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.textSubtle,
  },

  /* Sheets */
  sheetList: { maxHeight: 420 },
  choice: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  choiceNew: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.primary },
  choiceText: { flex: 1, fontSize: 14, lineHeight: 24 },
  choiceHead: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6, fontSize: 12.5, color: colors.textSubtle },
  choiceTopicGroup: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  choiceSelected: {
    backgroundColor: '#F0FDF4',
  },
  choiceTopicTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.text,
  },
  choiceTopicTitleSelected: {
    color: colors.primary,
  },
  choiceSubtleHint: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 2,
  },
  choiceSubtopic: {
    paddingStart: 34,
    backgroundColor: '#FAFBFD',
    borderBottomWidth: 1,
    borderBottomColor: colors.list,
  },
  choiceSubtopicText: {
    flex: 1,
    fontSize: 13.5,
    color: colors.textSubtle,
  },
  choiceSubtopicTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  inlineAddTopic: {
    padding: 12,
    backgroundColor: colors.list,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inlineAddTopicInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  inlineAddTopicActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  choiceTextDanger: {
    flex: 1,
    fontSize: 13.5,
    color: colors.danger,
    fontWeight: '600',
  },
  docOutcomeReadText: {
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.text,
  },
  sheetFieldGroup: {
    gap: 6,
    marginBottom: 12,
  },
  sheetFieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textSubtle,
  },
  sheetOutcomeInput: {
    fontSize: 14.5,
    minHeight: 64,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    textAlignVertical: 'top',
  },
  sheetActionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.list,
  },
  sheetActionRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  sheetActionTitle: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  sheetActionLeft: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  sheetActionValue: {
    fontSize: 13,
    color: colors.textSubtle,
  },
  sheetActionValuePrimary: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  sheetActionValueSuccess: {
    fontSize: 13,
    color: colors.success,
    fontWeight: '600',
  },
  sheetActionLink: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  sheetDateControls: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  sheetDeleteRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 18,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  sheetDeleteText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.danger,
  },
  sheetBackRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.list,
    backgroundColor: colors.surface,
  },
  sheetBackText: {
    fontSize: 13.5,
    color: colors.primary,
    fontWeight: '600',
  },
});
