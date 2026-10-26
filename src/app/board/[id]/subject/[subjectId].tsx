import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../../../components/ui/Buttons';
import { ModalHeader, Section } from '../../../../components/ui/Layout';
import { Txt } from '../../../../components/ui/Txt';
import { OUTCOME_NAMES } from '../../../../lib/activityText';
import { formatLongDate } from '../../../../lib/dates';
import { isOpen } from '../../../../lib/meetings';
import { goBack } from '../../../../lib/nav';
import { subjectHistory, type SubjectVisit } from '../../../../lib/subjects';
import { colors } from '../../../../lib/theme';
import type { Board } from '../../../../shared/types';
import { useBoard } from '../../../../store/store';

/**
 * One standing subject across every meeting that went through it.
 *
 * The question this answers — «what have we decided about the trips, all of it?» — is the one a
 * chat group cannot answer at all, and it is why each topic keeps a thread back to its subject.
 */
export default function SubjectScreen() {
  const { id, subjectId } = useLocalSearchParams<{ id: string; subjectId: string }>();
  const insets = useSafeAreaInsets();
  const board = useBoard(id);
  const history = board && subjectId ? subjectHistory(board, subjectId) : null;

  if (!board || !id || !history) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="المحور" onClose={goBack} />
        <Txt style={styles.gone}>هذا المحور لم يعد موجودًا.</Txt>
      </View>
    );
  }

  const { subject, visits, policies, counts } = history;

  return (
    <View style={styles.screen}>
      <ModalHeader title={subject.title} onClose={goBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.summary}>
          <Stat value={counts.visits} label="اجتماعًا" />
          <Stat value={counts.decisions} label="قرارًا" />
          <Stat value={counts.open} label="ما زال مفتوحًا" tone={counts.open ? colors.warning : undefined} />
          <Stat value={policies.length} label="سياسة" />
        </View>

        {policies.length ? (
          <Section title="ما استقرّ عليه" icon="book">
            {policies.map((policy) => (
              <View key={policy.id} style={styles.policy}>
                <Icon name="book" size={13} color={colors.textFaint} />
                <Txt style={styles.policyText}>{policy.text}</Txt>
              </View>
            ))}
          </Section>
        ) : null}

        {visits.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="history" size={32} color={colors.textSubtle} />
            <Txt style={styles.emptyText}>
              لم يُناقَش هذا المحور في اجتماع بعد. ما إن يُفتح اجتماع، يظهر هنا بما دار فيه.
            </Txt>
          </View>
        ) : (
          visits.map((visit) => <Visit key={visit.meeting.id} board={board} visit={visit} />)
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Txt style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Txt>
      <Txt style={styles.statLabel}>{label}</Txt>
    </View>
  );
}

function Visit({ board, visit }: { board: Board; visit: SubjectVisit }) {
  const { meeting, topic, outcomes } = visit;
  return (
    <View style={styles.visit}>
      <Pressable
        onPress={() => router.push(`/board/${board.id}/meeting/${meeting.id}`)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.visitHead, pressed && styles.pressed]}
      >
        <Txt style={styles.visitTitle}>{meeting.title}</Txt>
        <Txt style={styles.visitDate}>{formatLongDate(meeting.date)}</Txt>
        <Icon name="chevron-left" size={15} color={colors.textFaint} />
      </Pressable>

      {topic.notes.trim() ? <Txt style={styles.notes}>{topic.notes}</Txt> : null}

      {outcomes.length === 0 ? (
        <Txt style={styles.nothing}>نُوقش ولم يخرج بقرار.</Txt>
      ) : (
        outcomes.map((outcome) => {
          const open = isOpen(outcome, board);
          return (
            <View key={outcome.id} style={styles.outcome}>
              <View style={[styles.dot, open ? styles.dotOpen : styles.dotSettled]} />
              <View style={styles.outcomeBody}>
                <Txt style={styles.outcomeText}>{outcome.text}</Txt>
                <Txt style={styles.outcomeMeta}>
                  {OUTCOME_NAMES[outcome.kind]}
                  {outcome.assignee ? ` · ${outcome.assignee.name}` : ''}
                  {outcome.due ? ` · ${formatLongDate(outcome.due)}` : ''}
                  {open ? ' · لم يُنفَّذ بعد' : ''}
                </Txt>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 680, alignSelf: 'center' },
  gone: { padding: 24, textAlign: 'center', color: colors.textSubtle },
  summary: {
    flexDirection: 'row-reverse',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 19, fontWeight: '700' },
  statLabel: { fontSize: 11, color: colors.textFaint, textAlign: 'center' },
  policy: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
  policyText: { flex: 1, fontSize: 14, lineHeight: 26 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 40, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', lineHeight: 26 },
  visit: { gap: 8, padding: 14, borderRadius: 12, backgroundColor: colors.surface },
  visitHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  visitTitle: { fontSize: 14.5, fontWeight: '700' },
  visitDate: { flex: 1, fontSize: 11.5, color: colors.textFaint },
  pressed: { opacity: 0.7 },
  notes: { fontSize: 13.5, lineHeight: 26, color: colors.textSubtle },
  nothing: { fontSize: 12.5, color: colors.textFaint },
  outcome: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 9 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  dotOpen: { backgroundColor: colors.warning },
  dotSettled: { backgroundColor: colors.success },
  outcomeBody: { flex: 1, gap: 2 },
  outcomeText: { fontSize: 14, lineHeight: 25 },
  outcomeMeta: { fontSize: 11.5, color: colors.textFaint },
});
