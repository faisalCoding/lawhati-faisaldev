import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../../../components/ui/Avatar';
import { PeoplePicker } from '../../../../components/board/PeoplePicker';
import {
  DocAdd,
  DocClause,
  DocHeading,
  DocKicker,
  DocMeta,
  DocNote,
  DocPage,
  DocRule,
  DocTitle,
} from '../../../../components/board/Document';
import { Button, Chip, Icon, IconButton } from '../../../../components/ui/Buttons';
import { EditableText } from '../../../../components/ui/EditableText';
import { ModalHeader } from '../../../../components/ui/Layout';
import { ActionList, PromptForm, Sheet, type SheetAction } from '../../../../components/ui/Sheet';
import { Input, Txt } from '../../../../components/ui/Txt';
import { addDays, formatLongDate, todayISO } from '../../../../lib/dates';
import { isHeld, meetingSummary, movedProgress } from '../../../../lib/meetings';
import { uid } from '../../../../lib/ids';
import { goBack } from '../../../../lib/nav';
import { ordinal } from '../../../../lib/text';
import { OUTCOME_NAMES } from '../../../../lib/activityText';
import { colors } from '../../../../lib/theme';
import type { IconName } from '../../../../components/ui/iconData';
import type { Board, Meeting, MeetingTopic, Outcome, OutcomeKind } from '../../../../shared/types';
import {
  cardFromOutcome,
  checklistFromOutcome,
  dispatch,
  policyFromOutcome,
  repealFromOutcome,
} from '../../../../store/actions';
import { useBoard } from '../../../../store/store';

/**
 * One meeting, set as its own minutes.
 *
 * It is read far more often than it is written: someone opens it to find what was decided about
 * the trips, not to fill a form. So the page is the document — a heading, a clause, the line of
 * detail under it — and everything that changes it waits behind a tap on the thing it changes.
 */
export default function MeetingScreen() {
  const { id, meetingId } = useLocalSearchParams<{ id: string; meetingId: string }>();
  const insets = useSafeAreaInsets();
  const board = useBoard(id);
  const meeting = board?.meetings?.find((m) => m.id === meetingId);
  const [sheet, setSheet] = useState<SheetMode>(null);

  if (!board || !id || !meeting) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="المحضر" onClose={goBack} />
        <Txt style={styles.gone}>هذا الاجتماع لم يعد موجودًا.</Txt>
      </View>
    );
  }

  const outcomes = meeting.outcomes ?? [];
  // Anything whose topic was deleted falls back here rather than disappearing with it.
  const general = outcomes.filter((o) => !o.topicId || !meeting.topics.some((t) => t.id === o.topicId));
  const held = isHeld(meeting);
  const { moved, total } = movedProgress(board, meeting);
  const present = meeting.attendees.map((a) => a.name).join('، ');
  const info = () => setSheet({ kind: 'meeting' });

  return (
    <View style={styles.screen}>
      <ModalHeader title="المحضر" onClose={goBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <DocPage>
          <DocKicker>محضر اجتماع</DocKicker>
          <DocTitle onPress={info}>{meeting.title}</DocTitle>
          <DocMeta onPress={info}>
            {formatLongDate(meeting.date)}
            {meeting.place ? ` — ${meeting.place}` : ''}
          </DocMeta>
          <DocMeta onPress={info}>
            {held ? 'عُقد' : 'لم يُعقد بعد'}
            {total > 0 ? ` · رُحِّل منه ${moved} من ${total}` : ''}
          </DocMeta>

          <DocRule />
          <DocMeta onPress={() => setSheet({ kind: 'people' })}>
            <Txt style={styles.lead}>الحضور: </Txt>
            {present || 'لم يُسجَّل أحد بعد'}
          </DocMeta>
          <DocRule />

          {meeting.topics.length === 0 && general.length === 0 ? (
            <DocNote>لم يُكتب في هذا المحضر شيء بعد.</DocNote>
          ) : null}

          {meeting.topics.map((topic, index) => {
            const under = outcomes.filter((o) => o.topicId === topic.id);
            return (
              <View key={topic.id}>
                <DocHeading
                  marker={ordinal(index + 1)}
                  title={topic.title}
                  onPress={() => setSheet({ kind: 'topic', topic, index })}
                />
                {under.length === 0 ? (
                  <DocNote>لم يُسجَّل تحت هذا المحور شيء.</DocNote>
                ) : (
                  under.map((outcome, i) => (
                    <OutcomeClause
                      key={outcome.id}
                      board={board}
                      meeting={meeting}
                      outcome={outcome}
                      marker={`${i + 1}.`}
                    />
                  ))
                )}
              </View>
            );
          })}

          {general.length > 0 ? (
            <View>
              <DocHeading title="توصيات عامّة" />
              {general.map((outcome, i) => (
                <OutcomeClause
                  key={outcome.id}
                  board={board}
                  meeting={meeting}
                  outcome={outcome}
                  marker={`${i + 1}.`}
                />
              ))}
            </View>
          ) : null}

          <DocRule />
          <DocAdd label="إضافة محور" onPress={() => setSheet({ kind: 'addTopic' })} />
          <DocAdd label="إضافة توصية عامّة" onPress={() => setSheet({ kind: 'addOutcome', topicId: null })} />
        </DocPage>
      </ScrollView>

      <MeetingSheet board={board} meeting={meeting} sheet={sheet} onSet={setSheet} />
    </View>
  );
}

/** What the one sheet of this screen is showing. */
type SheetMode =
  | null
  | { kind: 'meeting' }
  | { kind: 'people' }
  | { kind: 'topic'; topic: MeetingTopic; index: number }
  | { kind: 'renameTopic'; topic: MeetingTopic }
  | { kind: 'addTopic' }
  | { kind: 'addOutcome'; topicId: string | null };

/**
 * Everything that edits the minutes, in the one sheet the screen keeps.
 *
 * iOS will not raise a second modal while the first is still animating, so the screen swaps this
 * sheet's contents instead of stacking sheets — which is also why the topic menu and the rename
 * form are two modes of one thing.
 */
function MeetingSheet({
  board,
  meeting,
  sheet,
  onSet,
}: {
  board: Board;
  meeting: Meeting;
  sheet: SheetMode;
  onSet: (next: SheetMode) => void;
}) {
  const close = () => onSet(null);
  const titles: Record<NonNullable<SheetMode>['kind'], string> = {
    meeting: 'الاجتماع',
    people: 'الحضور',
    topic: sheet?.kind === 'topic' ? sheet.topic.title : 'المحور',
    renameTopic: 'عنوان المحور',
    addTopic: 'محور جديد',
    addOutcome: 'توصية جديدة',
  };

  return (
    <Sheet visible={sheet !== null} onClose={close} title={sheet ? titles[sheet.kind] : undefined}>
      {sheet?.kind === 'meeting' ? <MeetingForm board={board} meeting={meeting} onDone={close} /> : null}
      {sheet?.kind === 'people' ? <Attendees board={board} meeting={meeting} /> : null}
      {sheet?.kind === 'topic' ? (
        <TopicActions board={board} meeting={meeting} topic={sheet.topic} index={sheet.index} onSet={onSet} />
      ) : null}
      {sheet?.kind === 'renameTopic' ? (
        <PromptForm
          initial={sheet.topic.title}
          placeholder="عنوان المحور"
          onCancel={close}
          onSubmit={(title) => {
            dispatch(board.id, {
              type: 'topic/update',
              meetingId: meeting.id,
              topicId: sheet.topic.id,
              patch: { title },
            });
            close();
          }}
        />
      ) : null}
      {sheet?.kind === 'addTopic' ? (
        <PromptForm
          placeholder="عنوان المحور"
          submitLabel="إضافة"
          onCancel={close}
          onSubmit={(title) => {
            dispatch(board.id, {
              type: 'topic/add',
              meetingId: meeting.id,
              topic: { id: uid(), title, notes: '' },
            });
            close();
          }}
        />
      ) : null}
      {sheet?.kind === 'addOutcome' ? (
        <AddOutcome board={board} meeting={meeting} topicId={sheet.topicId} onDone={close} />
      ) : null}
    </Sheet>
  );
}

/** When it was, where, whether it happened at all, the minutes to send on — and the one way to delete it. */
function MeetingForm({ board, meeting, onDone }: { board: Board; meeting: Meeting; onDone: () => void }) {
  const today = todayISO();
  const held = isHeld(meeting);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  const update = (patch: Partial<Pick<Meeting, 'title' | 'date' | 'place' | 'held'>>) =>
    dispatch(board.id, { type: 'meeting/update', meetingId: meeting.id, patch });

  return (
    <View style={styles.form}>
      <Txt style={styles.formLabel}>العنوان</Txt>
      <EditableText
        value={meeting.title}
        onCommit={(title) => update({ title })}
        required
        placeholder="عنوان الاجتماع"
        style={styles.formValue}
        multiline
      />

      <Txt style={styles.formLabel}>التاريخ</Txt>
      <View style={styles.dateRow}>
        <IconButton name="chevron-right" label="اليوم السابق" onPress={() => update({ date: addDays(meeting.date, -1) })} />
        <View style={styles.dateBox}>
          <Txt style={styles.dateText}>{formatLongDate(meeting.date)}</Txt>
        </View>
        <IconButton name="chevron-left" label="اليوم التالي" onPress={() => update({ date: addDays(meeting.date, 1) })} />
      </View>
      <View style={styles.wrapRow}>
        <Chip label="اليوم" selected={meeting.date === today} onPress={() => update({ date: today })} />
        <Chip
          label="أمس"
          selected={meeting.date === addDays(today, -1)}
          onPress={() => update({ date: addDays(today, -1) })}
        />
        <Chip
          label={held ? 'عُقد' : 'لم يُعقد بعد'}
          icon={held ? 'check' : 'clock'}
          selected={held}
          onPress={() => update({ held: !held })}
        />
      </View>

      <Txt style={styles.formLabel}>المكان</Txt>
      <EditableText
        value={meeting.place ?? ''}
        onCommit={(place) => update({ place })}
        placeholder="قاعة الاجتماعات، أو رابط اللقاء"
        style={styles.formValue}
      />

      <Button
        title={copied ? 'نُسخ الملخّص' : 'نسخ ملخّص الاجتماع'}
        icon={copied ? 'check' : 'copy'}
        variant="secondary"
        onPress={async () => {
          await Clipboard.setStringAsync(meetingSummary(meeting, board.policies));
          setCopied(true);
        }}
      />

      <Button
        title="حذف الاجتماع"
        icon="trash"
        variant="danger"
        onPress={() => {
          dispatch(board.id, { type: 'meeting/remove', meetingId: meeting.id });
          onDone();
          goBack();
        }}
      />
    </View>
  );
}

/**
 * Who was in the room, picked from the board's own roster — everyone who has opened this board.
 * A name is kept with each one, so a record of who attended on a day does not change when someone
 * later renames themselves or stops using the board.
 */
function Attendees({ board, meeting }: { board: Board; meeting: Meeting }) {
  const roster = board.members ?? [];
  const here = new Set(meeting.attendees.map((a) => a.id));
  // Someone recorded as present who is no longer on the roster still shows, and stays removable.
  const absent = meeting.attendees.filter((a) => !roster.some((m) => m.id === a.id));

  if (roster.length === 0 && absent.length === 0) {
    return (
      <Txt style={styles.note}>لا أحد على سجلّ هذه اللوحة بعد. من يفتحها بحسابه يظهر هنا، فتختاره من الحضور.</Txt>
    );
  }

  return (
    <View style={[styles.wrapRow, styles.form]}>
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
          style={({ pressed }) => [styles.person, here.has(person.id) && styles.personOn, pressed && styles.pressed]}
        >
          <Avatar person={person} size={24} />
          <Txt style={[styles.personName, here.has(person.id) && styles.personNameOn]}>{person.name}</Txt>
          {here.has(person.id) ? <Icon name="check" size={14} color={colors.surface} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

function TopicActions({
  board,
  meeting,
  topic,
  index,
  onSet,
}: {
  board: Board;
  meeting: Meeting;
  topic: MeetingTopic;
  index: number;
  onSet: (next: SheetMode) => void;
}) {
  const move = (to: number) => {
    dispatch(board.id, { type: 'topic/move', meetingId: meeting.id, topicId: topic.id, toIndex: to });
    onSet(null);
  };

  const actions: SheetAction[] = [
    { label: 'إضافة توصية', icon: 'plus', onPress: () => onSet({ kind: 'addOutcome', topicId: topic.id }) },
    { label: 'تعديل العنوان', icon: 'pencil', onPress: () => onSet({ kind: 'renameTopic', topic }) },
  ];
  if (topic.subjectId) {
    actions.push({
      label: 'كل ما تقرّر عن هذا المحور',
      icon: 'history',
      hint: 'عبر كل الاجتماعات',
      onPress: () => {
        onSet(null);
        router.push(`/board/${board.id}/subject/${topic.subjectId}`);
      },
    });
  }
  if (index > 0) actions.push({ label: 'نقل لأعلى', icon: 'chevron-up', onPress: () => move(index - 1) });
  if (index < meeting.topics.length - 1) {
    actions.push({ label: 'نقل لأسفل', icon: 'chevron-down', onPress: () => move(index + 1) });
  }
  actions.push({
    label: 'حذف المحور',
    icon: 'trash',
    destructive: true,
    hint: 'وما تحته يصير توصيات عامّة',
    onPress: () => {
      dispatch(board.id, { type: 'topic/remove', meetingId: meeting.id, topicId: topic.id });
      onSet(null);
    },
  });

  return <ActionList actions={actions} />;
}

/** What kind of thing was decided, and what it says. The rest is filled in by tapping it after. */
function AddOutcome({
  board,
  meeting,
  topicId,
  onDone,
}: {
  board: Board;
  meeting: Meeting;
  topicId: string | null;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<OutcomeKind>('task');
  const [draft, setDraft] = useState('');

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    dispatch(board.id, {
      type: 'outcome/add',
      meetingId: meeting.id,
      outcome: { id: uid(), kind, text, topicId, assignee: null, due: null, cardId: null },
    });
    onDone();
  };

  return (
    <View style={styles.form}>
      <View style={styles.wrapRow}>
        {KINDS.map((k) => (
          <Chip
            key={k.kind}
            label={OUTCOME_NAMES[k.kind]}
            icon={k.icon}
            selected={kind === k.kind}
            onPress={() => setKind(k.kind)}
          />
        ))}
      </View>
      <Txt style={styles.formHint}>{KINDS.find((k) => k.kind === kind)?.hint}</Txt>
      <Input
        value={draft}
        onChangeText={setDraft}
        placeholder="اكتب ما تقرّر أو ما أُوصي به…"
        style={styles.formInput}
        multiline
        autoFocus
      />
      <Button title="إضافة" onPress={add} disabled={!draft.trim()} />
    </View>
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

function OutcomeClause({
  board,
  meeting,
  outcome,
  marker,
}: {
  board: Board;
  meeting: Meeting;
  outcome: Outcome;
  marker: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'detail' | 'topics' | 'repeal' | 'cards' | 'people' | 'move'>('detail');
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
  // Only rules still in force: amending a repealed one rewrote words nobody works by any more.
  const existingPolicies = (board.policies ?? []).filter((p) => p.id !== policy?.id && !p.repealedAt);
  const repeals = outcome.kind === 'policy' && !!outcome.repeals;

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

  const repealPolicy = (policyId: string) => {
    repealFromOutcome(board.id, meeting.id, outcome.id, policyId);
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
      : view === 'repeal'
      ? 'أيّ سياسة تُحذف؟'
      : view === 'cards'
      ? 'في أي بطاقة؟'
      : view === 'people'
      ? 'مسؤول التوصية'
      : view === 'move'
      ? 'تحت أي محور؟'
      : 'تفاصيل التوصية';

  return (
    <>
      <DocClause
        marker={marker}
        text={outcome.text || 'بدون نص'}
        meta={line(
          OUTCOME_NAMES[outcome.kind],
          outcome.assignee?.name,
          outcome.due && formatLongDate(outcome.due),
          policy && (repeals ? 'حذف سياسة قائمة' : policyTopic ? `بند في ${policyTopic.title}` : 'بند في السياسات'),
          card && `على اللوحة: ${card.title}`,
        )}
        onPress={openSheet}
      />

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
            {repeals && policy ? (
              <View style={styles.sheetActionRow}>
                <View style={styles.sheetActionRight}>
                  <Icon name="trash" size={16} color={colors.danger} />
                  <Txt style={styles.sheetActionTitle}>حذفت سياسة</Txt>
                </View>
                <View style={styles.sheetActionLeft}>
                  <Txt style={styles.sheetActionValue} numberOfLines={2}>
                    {policy.text}
                  </Txt>
                </View>
              </View>
            ) : outcome.kind === 'policy' ? (
              <>
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
                {/* A decision that stops a rule is as common as one that starts one, so it has its
                    own row here rather than the last place in the list of where to file a new one. */}
                {!policy && existingPolicies.length ? (
                  <Pressable
                    onPress={() => setView('repeal')}
                    style={({ pressed }) => [styles.sheetActionRow, pressed && styles.pressed]}
                  >
                    <View style={styles.sheetActionRight}>
                      <Icon name="trash" size={16} color={colors.danger} />
                      <Txt style={styles.sheetActionTitle}>حذف سياسة قائمة</Txt>
                    </View>
                    <View style={styles.sheetActionLeft}>
                      <Txt style={styles.sheetActionValue}>اختر السياسة</Txt>
                      <Icon name="chevron-left" size={14} color={colors.textFaint} />
                    </View>
                  </Pressable>
                ) : null}
              </>
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

        {view === 'repeal' && (
          <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
            <Txt style={styles.note}>تخرج السياسة من السياسات السارية، ويبقى سجلّها: متى أُقرّت ومتى حُذفت وبأيّ اجتماع.</Txt>
            {/* Grouped under their subjects, as the policies page shows them: a rule is easier to
                find where it lives than in one long list. */}
            {[...policyTopics.map((t) => ({ id: t.id as string | null, title: t.title })), { id: null, title: 'بلا موضوع' }].map(
              (group) => {
                const rules = existingPolicies.filter((p) => (p.topicId ?? null) === group.id);
                if (rules.length === 0) return null;
                return (
                  <View key={group.id ?? 'loose'}>
                    <Txt style={styles.choiceHead}>{group.title}</Txt>
                    {rules.map((p) => (
                      <Pressable
                        key={p.id}
                        accessibilityRole="button"
                        onPress={() => repealPolicy(p.id)}
                        style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
                      >
                        <Icon name="trash" size={16} color={colors.danger} />
                        <Txt style={styles.choiceTextDanger} numberOfLines={3}>
                          {p.text}
                        </Txt>
                      </Pressable>
                    ))}
                  </View>
                );
              },
            )}
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

/** Joins the halves of a detail line, leaving out whatever is not set. */
function line(...parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' · ');
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
  note: { fontSize: 13, color: colors.textSubtle, lineHeight: 24 },
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

  /* --- Elegant Document Style for Topics and Decisions --- */
  documentCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 18,
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
  miniStepper: {
    width: 22,
    height: 22,
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
  lead: { fontWeight: '700', color: colors.text },
  form: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  formLabel: { fontSize: 12, fontWeight: '700', color: colors.textFaint, marginTop: 4 },
  formValue: { fontSize: 15, lineHeight: 26 },
  formHint: { fontSize: 12, color: colors.textFaint },
  formInput: { minHeight: 90, textAlignVertical: 'top' },
});
