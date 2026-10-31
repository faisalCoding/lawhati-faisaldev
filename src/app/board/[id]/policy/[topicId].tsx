import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { ModalHeader } from '../../../../components/ui/Layout';
import { ActionList, PromptForm, Sheet, type SheetAction } from '../../../../components/ui/Sheet';
import { Input, Txt } from '../../../../components/ui/Txt';
import { addDays, formatLongDate, toISODate, todayISO } from '../../../../lib/dates';
import { uid } from '../../../../lib/ids';
import { livingClauses } from '../../../../lib/meetings';
import { goBack } from '../../../../lib/nav';
import { joined, ordinal, pluralPolicies, pluralSubtopics } from '../../../../lib/text';
import { colors } from '../../../../lib/theme';
import type { Board, Policy, PolicyEvent, PolicySubtopic, PolicyTopic } from '../../../../shared/types';
import { dispatch } from '../../../../store/actions';
import { useBoard } from '../../../../store/store';

/**
 * One policy subject, set as the document it is: sub-headings, and the rules under each.
 *
 * The minutes are written in three levels — «ضوابط وإجراءات الرحلات», then «الحجز والتذاكر», then
 * the rules themselves — and this is the third of them laid out to be read. What edits a rule
 * waits behind a tap on that rule, because a page of rules is read far more than it is amended.
 */
export default function PolicyScreen() {
  const { id, topicId } = useLocalSearchParams<{ id: string; topicId: string }>();
  const insets = useSafeAreaInsets();
  const board = useBoard(id);
  const topic = (board?.policyTopics ?? []).find((t) => t.id === topicId);
  const [sheet, setSheet] = useState<SheetMode>(null);

  if (!board || !id || !topic) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="الوثيقة" onClose={goBack} />
        <Txt style={styles.gone}>هذا الموضوع لم يعد موجودًا.</Txt>
      </View>
    );
  }

  const all = livingClauses(board, topic.id);
  const loose = livingClauses(board, topic.id, null);
  const subject = () => setSheet({ kind: 'subject' });

  return (
    <View style={styles.screen}>
      <ModalHeader title="الوثيقة" onClose={goBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <DocPage>
          <DocKicker>وثيقة سياسات</DocKicker>
          <DocTitle onPress={subject}>{topic.title}</DocTitle>
          <DocMeta onPress={subject}>
            {pluralPolicies(all.length)}
            {topic.subtopics.length > 0 ? ` · ${pluralSubtopics(topic.subtopics.length)}` : ''}
          </DocMeta>
          <DocRule />

          {all.length === 0 && topic.subtopics.length === 0 ? (
            <DocNote>لم يُكتب في هذه الوثيقة بند بعد.</DocNote>
          ) : null}

          {topic.subtopics.map((sub, i) => {
            const clauses = livingClauses(board, topic.id, sub.id);
            return (
              <View key={sub.id}>
                <DocHeading
                  marker={ordinal(i + 1)}
                  title={sub.title}
                  onPress={() => setSheet({ kind: 'subtopic', sub, index: i })}
                />
                {clauses.length === 0 ? (
                  <DocNote>لا بنود تحته بعد.</DocNote>
                ) : (
                  clauses.map((clause, j) => (
                    <ClauseLine
                      key={clause.id}
                      board={board}
                      clause={clause}
                      marker={`${i + 1}/${j + 1}`}
                      onOpen={() => setSheet({ kind: 'clause', clause })}
                    />
                  ))
                )}
              </View>
            );
          })}

          {loose.length > 0 ? (
            <View>
              {/* Rules the meeting agreed before anyone decided where they belong. */}
              <DocHeading title="بنود بلا موضوع فرعي" />
              {loose.map((clause, j) => (
                <ClauseLine
                  key={clause.id}
                  board={board}
                  clause={clause}
                  marker={`${j + 1}.`}
                  onOpen={() => setSheet({ kind: 'clause', clause })}
                />
              ))}
            </View>
          ) : null}

          <DocRule />
          <DocAdd label="إضافة موضوع فرعي" onPress={() => setSheet({ kind: 'addSubtopic' })} />
          <DocAdd label="إضافة بند" onPress={() => setSheet({ kind: 'addClause', subtopicId: null })} />
        </DocPage>
      </ScrollView>

      <PolicySheet board={board} topic={topic} sheet={sheet} onSet={setSheet} />
    </View>
  );
}

/** One rule as a line of the document: what it says, and since when. */
function ClauseLine({
  board,
  clause,
  marker,
  onOpen,
}: {
  board: Board;
  clause: Policy;
  marker: string;
  onOpen: () => void;
}) {
  const meeting = clause.meetingId ? board.meetings?.find((m) => m.id === clause.meetingId) : undefined;
  return (
    <DocClause
      marker={marker}
      text={clause.text}
      meta={joined(
        clause.effectiveFrom && `سارٍ من ${formatLongDate(clause.effectiveFrom)}`,
        meeting && `من ${meeting.title}`,
      )}
      onPress={onOpen}
    />
  );
}

/** What the one sheet of this screen is showing. */
type SheetMode =
  | null
  | { kind: 'subject' }
  | { kind: 'renameSubject' }
  | { kind: 'removeSubject' }
  | { kind: 'subtopic'; sub: PolicySubtopic; index: number }
  | { kind: 'renameSubtopic'; sub: PolicySubtopic }
  | { kind: 'addSubtopic' }
  | { kind: 'addClause'; subtopicId: string | null }
  | { kind: 'clause'; clause: Policy };

/** Everything that edits the document, in the one sheet the screen keeps. */
function PolicySheet({
  board,
  topic,
  sheet,
  onSet,
}: {
  board: Board;
  topic: PolicyTopic;
  sheet: SheetMode;
  onSet: (next: SheetMode) => void;
}) {
  const close = () => onSet(null);
  const titles: Record<NonNullable<SheetMode>['kind'], string> = {
    subject: topic.title,
    renameSubject: 'عنوان الموضوع',
    removeSubject: 'حذف الموضوع',
    subtopic: sheet?.kind === 'subtopic' ? sheet.sub.title : 'الموضوع الفرعي',
    renameSubtopic: 'عنوان الموضوع الفرعي',
    addSubtopic: 'موضوع فرعي جديد',
    addClause: 'بند جديد',
    clause: 'البند',
  };

  const addClause = (text: string, subtopicId: string | null) => {
    dispatch(board.id, {
      type: 'policy/add',
      policy: { id: uid(), text, topicId: topic.id, subtopicId, meetingId: null, at: Date.now() },
    });
    close();
  };

  return (
    <Sheet visible={sheet !== null} onClose={close} title={sheet ? titles[sheet.kind] : undefined}>
      {sheet?.kind === 'subject' ? (
        <ActionList
          actions={[
            { label: 'تعديل العنوان', icon: 'pencil', onPress: () => onSet({ kind: 'renameSubject' }) },
            { label: 'إضافة موضوع فرعي', icon: 'plus', onPress: () => onSet({ kind: 'addSubtopic' }) },
            { label: 'حذف الموضوع', icon: 'trash', destructive: true, onPress: () => onSet({ kind: 'removeSubject' }) },
          ]}
        />
      ) : null}

      {sheet?.kind === 'renameSubject' ? (
        <PromptForm
          initial={topic.title}
          placeholder="عنوان الموضوع"
          onCancel={close}
          onSubmit={(title) => {
            dispatch(board.id, { type: 'topic/updatePolicy', topicId: topic.id, patch: { title } });
            close();
          }}
        />
      ) : null}

      {sheet?.kind === 'subtopic' ? (
        <SubtopicActions board={board} topic={topic} sub={sheet.sub} index={sheet.index} onSet={onSet} />
      ) : null}

      {sheet?.kind === 'renameSubtopic' ? (
        <PromptForm
          initial={sheet.sub.title}
          placeholder="عنوان الموضوع الفرعي"
          onCancel={close}
          onSubmit={(title) => {
            dispatch(board.id, {
              type: 'subtopic/update',
              topicId: topic.id,
              subtopicId: sheet.sub.id,
              patch: { title },
            });
            close();
          }}
        />
      ) : null}

      {sheet?.kind === 'addSubtopic' ? (
        <PromptForm
          placeholder="عنوان الموضوع الفرعي"
          submitLabel="إضافة"
          onCancel={close}
          onSubmit={(title) => {
            dispatch(board.id, { type: 'subtopic/add', topicId: topic.id, subtopic: { id: uid(), title } });
            close();
          }}
        />
      ) : null}

      {sheet?.kind === 'addClause' ? (
        <ClauseForm onSubmit={(text) => addClause(text, sheet.subtopicId)} />
      ) : null}

      {sheet?.kind === 'clause' ? <EditClause board={board} clause={sheet.clause} onDone={close} /> : null}
      {sheet?.kind === 'removeSubject' ? <RemoveSubject board={board} topic={topic} onDone={close} /> : null}
    </Sheet>
  );
}

function SubtopicActions({
  board,
  topic,
  sub,
  index,
  onSet,
}: {
  board: Board;
  topic: PolicyTopic;
  sub: PolicySubtopic;
  index: number;
  onSet: (next: SheetMode) => void;
}) {
  const move = (to: number) => {
    dispatch(board.id, { type: 'subtopic/move', topicId: topic.id, subtopicId: sub.id, toIndex: to });
    onSet(null);
  };

  const actions: SheetAction[] = [
    { label: 'إضافة بند', icon: 'plus', onPress: () => onSet({ kind: 'addClause', subtopicId: sub.id }) },
    { label: 'تعديل العنوان', icon: 'pencil', onPress: () => onSet({ kind: 'renameSubtopic', sub }) },
  ];
  if (index > 0) actions.push({ label: 'نقل لأعلى', icon: 'chevron-up', onPress: () => move(index - 1) });
  if (index < topic.subtopics.length - 1) {
    actions.push({ label: 'نقل لأسفل', icon: 'chevron-down', onPress: () => move(index + 1) });
  }
  actions.push({
    label: 'حذف الموضوع الفرعي',
    icon: 'trash',
    destructive: true,
    hint: 'وبنوده تبقى في الوثيقة بلا عنوان فرعي',
    onPress: () => {
      dispatch(board.id, { type: 'subtopic/remove', topicId: topic.id, subtopicId: sub.id });
      onSet(null);
    },
  });

  return <ActionList actions={actions} />;
}

/** A rule is a sentence, sometimes a long one, so it is written in a box and not on a line. */
function ClauseForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <View style={styles.form}>
      <Input
        value={text}
        onChangeText={setText}
        placeholder="نصّ البند…"
        style={styles.formInput}
        multiline
        autoFocus
      />
      <Button title="إضافة" onPress={() => onSubmit(text.trim())} disabled={!text.trim()} />
    </View>
  );
}

function EditClause({ board, clause: policy, onDone }: { board: Board; clause: Policy; onDone: () => void }) {
  const [text, setText] = useState(policy.text);
  const today = todayISO();
  const meeting = policy.meetingId ? board.meetings?.find((m) => m.id === policy.meetingId) : undefined;
  return (
    <View style={styles.remove}>
      <Input autoFocus multiline value={text} onChangeText={setText} placeholder="نصّ السياسة" style={styles.editInput} />
      {meeting ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onDone();
            router.push(`/board/${board.id}/meeting/${meeting.id}`);
          }}
          style={({ pressed }) => [styles.from, pressed && styles.pressed]}
        >
          <Icon name="calendar" size={12} color={colors.textFaint} />
          <Txt style={styles.fromText}>من {meeting.title}</Txt>
        </Pressable>
      ) : null}
      <View style={styles.wrapChips}>
        <Chip
          label={policy.effectiveFrom ? `سارٍ من ${formatLongDate(policy.effectiveFrom)}` : 'بلا تاريخ سريان'}
          icon="calendar"
          selected={!!policy.effectiveFrom}
          onPress={() =>
            dispatch(board.id, {
              type: 'policy/update',
              policyId: policy.id,
              patch: { effectiveFrom: policy.effectiveFrom ? null : today },
            })
          }
        />
        {policy.effectiveFrom ? (
          <>
            <IconButton
              name="chevron-right"
              label="اليوم السابق"
              onPress={() =>
                dispatch(board.id, {
                  type: 'policy/update',
                  policyId: policy.id,
                  patch: { effectiveFrom: addDays(policy.effectiveFrom!, -1) },
                })
              }
            />
            <IconButton
              name="chevron-left"
              label="اليوم التالي"
              onPress={() =>
                dispatch(board.id, {
                  type: 'policy/update',
                  policyId: policy.id,
                  patch: { effectiveFrom: addDays(policy.effectiveFrom!, 1) },
                })
              }
            />
          </>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!text.trim() || text.trim() === policy.text}
        onPress={() => {
          dispatch(board.id, { type: 'policy/update', policyId: policy.id, patch: { text: text.trim() } });
          onDone();
        }}
        style={({ pressed }) => [styles.removeChoice, pressed && styles.pressed]}
      >
        <Icon name="check" size={16} color={colors.primary} />
        <Txt style={styles.removeMove}>حفظ</Txt>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          dispatch(board.id, { type: 'policy/repeal', policyId: policy.id });
          onDone();
        }}
        style={({ pressed }) => [styles.removeChoice, pressed && styles.pressed]}
      >
        <Icon name="trash" size={16} color={colors.danger} />
        <Txt style={styles.removeDelete}>حذف السياسة</Txt>
      </Pressable>
      <Txt style={styles.removeWarn}>تخرج من السياسات السارية، ويبقى سجلّها: متى أُقرّت ومتى حُذفت.</Txt>

      <PolicyHistory policy={policy} />
    </View>
  );
}

/**
 * Deleting a whole subject, and deciding first what happens to its rules: moved under another
 * subject, where they keep applying, or gone with it. Asked before, as removing a column asks,
 * because the second one is not something to find out afterwards.
 */
function RemoveSubject({ board, topic, onDone }: { board: Board; topic: PolicyTopic; onDone: () => void }) {
  const rules = (board.policies ?? []).filter((p) => (p.topicId ?? null) === topic.id);
  const others = (board.policyTopics ?? []).filter((t) => t.id !== topic.id);
  const remove = (moveTo: string | null) => {
    dispatch(board.id, { type: 'topic/removePolicy', topicId: topic.id, ...(moveTo ? { moveTo } : {}) });
    onDone();
    goBack();
  };

  return (
    <View style={styles.remove}>
      {rules.length > 0 && others.length > 0 ? (
        <>
          <Txt style={styles.removeWarn}>{`فيه ${pluralPolicies(rules.length)}. أين تذهب؟`}</Txt>
          {others.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              onPress={() => remove(t.id)}
              style={({ pressed }) => [styles.removeChoice, pressed && styles.pressed]}
            >
              <Icon name="move" size={16} color={colors.primary} />
              <Txt style={styles.removeMove}>انقلها إلى {t.title}</Txt>
            </Pressable>
          ))}
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => remove(null)}
        style={({ pressed }) => [styles.removeChoice, pressed && styles.pressed]}
      >
        <Icon name="trash" size={16} color={colors.danger} />
        <Txt style={styles.removeDelete}>
          {rules.length > 0 ? `احذف الموضوع و${pluralPolicies(rules.length, true)} معه` : 'احذف الموضوع'}
        </Txt>
      </Pressable>
      {rules.length > 0 ? <Txt style={styles.removeWarn}>البنود المحذوفة مع موضوعها لا يبقى لها سجلّ.</Txt> : null}
    </View>
  );
}

const EVENT_WORDS: Record<PolicyEvent['kind'], string> = {
  added: 'أُقرّت',
  edited: 'عُدّلت',
  repealed: 'أُلغي العمل بها',
  restored: 'أُعيد العمل بها',
};

/**
 * Everything that has happened to this rule, newest first.
 *
 * It lives on the rule and not in the board's activity, which keeps the last hundred entries and
 * drops the rest — a rule set in September and amended in October would have lost September.
 */
function PolicyHistory({ policy }: { policy: Policy }) {
  const history = [...(policy.history ?? [])].reverse();
  if (history.length === 0) return null;

  return (
    <View style={styles.history}>
      <Txt style={styles.historyHead}>السجلّ</Txt>
      {history.map((event, i) => (
        <View key={`${event.at}-${i}`} style={styles.historyRow}>
          <Txt style={styles.historyWhen}>{formatLongDate(toISODate(new Date(event.at)))}</Txt>
          <View style={styles.historyBody}>
            <Txt style={styles.historyWhat}>
              {EVENT_WORDS[event.kind]}
              {event.by?.name ? ` — ${event.by.name}` : ''}
            </Txt>
            {event.kind === 'edited' && event.text ? (
              <Txt style={styles.historyWas} numberOfLines={3}>
                كانت: {event.text}
              </Txt>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, gap: 16 },
  gone: { padding: 24, fontSize: 14, color: colors.textSubtle, textAlign: 'center' },
  form: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  formInput: { minHeight: 90, textAlignVertical: 'top' },
  pressed: { opacity: 0.75 },
  from: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  fromText: { flex: 1, fontSize: 10.5, color: colors.textFaint },
  editInput: { fontSize: 15, minHeight: 44 },
  wrapChips: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  remove: { padding: 16, gap: 10 },
  removeChoice: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.list,
  },
  removeMove: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.primary },
  removeDelete: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.danger },
  removeWarn: { fontSize: 12, color: colors.textFaint, textAlign: 'center' },
  history: { gap: 6, marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  historyHead: { fontSize: 12, fontWeight: '700', color: colors.textSubtle },
  historyRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  historyWhen: { width: 96, fontSize: 11, color: colors.textFaint },
  historyBody: { flex: 1, gap: 2 },
  historyWhat: { fontSize: 12.5 },
  historyWas: { fontSize: 11.5, color: colors.textFaint, lineHeight: 21 },
});
