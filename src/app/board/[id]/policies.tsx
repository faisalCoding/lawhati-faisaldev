import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, Icon, IconButton } from '../../../components/ui/Buttons';
import { EditableText } from '../../../components/ui/EditableText';
import { AvoidKeyboard } from '../../../components/ui/Keyboard';
import { ModalHeader, Section } from '../../../components/ui/Layout';
import { Input, Txt } from '../../../components/ui/Txt';
import { uid } from '../../../lib/ids';
import { goBack } from '../../../lib/nav';
import { pluralPolicies } from '../../../lib/text';
import { colors } from '../../../lib/theme';
import type { Board, Policy, PolicySection } from '../../../shared/types';
import { dispatch } from '../../../store/actions';
import { useBoard } from '../../../store/store';

/**
 * The standing rules this board works by, filed under headings.
 *
 * Grouped rather than listed flat because a rule is looked up by subject — «what do we do about
 * someone late for the trip?» — and because nearly half of what the meetings produce ends up here.
 */
export default function PoliciesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const board = useBoard(id);
  const [draft, setDraft] = useState('');
  const [filing, setFiling] = useState<string | null>(null);

  if (!board || !id) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="السياسات" onClose={goBack} />
      </View>
    );
  }

  const policies = board.policies ?? [];
  const sections = board.policySections ?? [];

  const groups = [
    ...sections.map((x) => ({ id: x.id as string | null, title: x.title, items: policies.filter((p) => p.sectionId === x.id) })),
    {
      id: null,
      title: 'بلا قسم',
      items: policies.filter((p) => !p.sectionId || !sections.some((x) => x.id === p.sectionId)),
    },
  ].filter((g) => g.items.length > 0);

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    dispatch(id, {
      type: 'policy/add',
      policy: {
        id: uid(),
        text,
        sectionId: sections.some((x) => x.id === filing) ? filing : null,
        meetingId: null,
        at: Date.now(),
      },
    });
    setDraft('');
  };

  return (
    <View style={styles.screen}>
      <ModalHeader title="السياسات" onClose={goBack} />
      <AvoidKeyboard style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {policies.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="book" size={34} color={colors.textSubtle} />
              <Txt style={styles.emptyText}>
                لا سياسات بعد. اكتب قاعدة أدناه، أو أقرّها من توصيات اجتماع.
              </Txt>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.id ?? 'unfiled'} style={styles.group}>
                <Txt style={styles.groupTitle}>
                  {group.title} · {pluralPolicies(group.items.length)}
                </Txt>
                {group.items.map((policy) => (
                  <Row key={policy.id} board={board} policy={policy} sections={sections} />
                ))}
              </View>
            ))
          )}

          <Section title="قاعدة جديدة" icon="plus">
            {sections.length ? (
              <View style={styles.wrapRow}>
                <Chip label="بلا قسم" selected={filing === null} onPress={() => setFiling(null)} />
                {sections.map((x) => (
                  <Chip key={x.id} label={x.title} selected={filing === x.id} onPress={() => setFiling(x.id)} />
                ))}
              </View>
            ) : null}
            <View style={styles.addRow}>
              <Input
                value={draft}
                onChangeText={setDraft}
                placeholder="ما القاعدة التي تعملون بها؟"
                style={styles.addInput}
                multiline
              />
              <IconButton name="plus" label="إضافة السياسة" onPress={add} disabled={!draft.trim()} />
            </View>
          </Section>

          <SectionsEditor boardId={id} sections={sections} />
        </ScrollView>
      </AvoidKeyboard>
    </View>
  );
}

function Row({ board, policy, sections }: { board: Board; policy: Policy; sections: PolicySection[] }) {
  const [filing, setFiling] = useState(false);
  const meeting = policy.meetingId ? board.meetings?.find((m) => m.id === policy.meetingId) : undefined;

  return (
    <View style={styles.policy}>
      <View style={styles.policyHead}>
        <EditableText
          value={policy.text}
          onCommit={(text) => dispatch(board.id, { type: 'policy/update', policyId: policy.id, patch: { text } })}
          required
          placeholder="نصّ السياسة"
          style={styles.policyText}
          multiline
        />
        <IconButton name="layers" label="نقل إلى قسم" onPress={() => setFiling((v) => !v)} />
        <IconButton
          name="trash"
          label="حذف السياسة"
          onPress={() => dispatch(board.id, { type: 'policy/remove', policyId: policy.id })}
        />
      </View>

      {/* Where it came from, so a rule is never just an assertion: it names the meeting that set it. */}
      {meeting ? (
        <Pressable
          onPress={() => router.push(`/board/${board.id}/meeting/${meeting.id}`)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.from, pressed && styles.pressed]}
        >
          <Icon name="calendar" size={12} color={colors.textFaint} />
          <Txt style={styles.fromText} numberOfLines={1}>
            من {meeting.title}
          </Txt>
        </Pressable>
      ) : null}

      {filing && sections.length ? (
        <View style={styles.wrapRow}>
          <Chip
            label="بلا قسم"
            selected={!policy.sectionId}
            onPress={() => {
              dispatch(board.id, { type: 'policy/update', policyId: policy.id, patch: { sectionId: null } });
              setFiling(false);
            }}
          />
          {sections.map((x) => (
            <Chip
              key={x.id}
              label={x.title}
              selected={policy.sectionId === x.id}
              onPress={() => {
                dispatch(board.id, { type: 'policy/update', policyId: policy.id, patch: { sectionId: x.id } });
                setFiling(false);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SectionsEditor({ boardId, sections }: { boardId: string; sections: PolicySection[] }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    dispatch(boardId, { type: 'section/add', section: { id: uid(), title } });
    setDraft('');
  };

  const move = (sectionId: string, to: number) => dispatch(boardId, { type: 'section/move', sectionId, toIndex: to });

  return (
    <Section title="الأقسام" icon="layers" right={<Txt style={styles.count}>{sections.length}</Txt>}>
      <Txt style={styles.note}>
        تُقرأ السياسة بموضوعها: الرحلات، الحلقات والتسميع، الحضور والغياب… حذف القسم لا يحذف سياساته.
      </Txt>
      <View style={styles.sectionList}>
        {sections.map((x, index) => (
          <View key={x.id} style={styles.sectionRow}>
            <EditableText
              value={x.title}
              onCommit={(title) => dispatch(boardId, { type: 'section/update', sectionId: x.id, patch: { title } })}
              required
              placeholder="اسم القسم"
              style={styles.sectionTitle}
            />
            <IconButton name="chevron-up" label="أعلى" onPress={() => move(x.id, index - 1)} disabled={index === 0} />
            <IconButton
              name="chevron-down"
              label="أسفل"
              onPress={() => move(x.id, index + 1)}
              disabled={index === sections.length - 1}
            />
            <IconButton
              name="trash"
              label="حذف القسم"
              onPress={() => dispatch(boardId, { type: 'section/remove', sectionId: x.id })}
            />
          </View>
        ))}
      </View>
      <View style={styles.addRow}>
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder="قسم جديد"
          onSubmitEditing={add}
          returnKeyType="done"
          style={styles.addInput}
        />
        <IconButton name="plus" label="إضافة قسم" onPress={add} disabled={!draft.trim()} />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: 16, gap: 16, width: '100%', maxWidth: 680, alignSelf: 'center' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 40, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', lineHeight: 26 },
  group: { gap: 8 },
  groupTitle: { fontSize: 12.5, fontWeight: '700', color: colors.textSubtle },
  policy: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: colors.surface },
  policyHead: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 4 },
  policyText: { flex: 1, fontSize: 14.5, lineHeight: 26 },
  from: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  fromText: { flex: 1, fontSize: 11.5, color: colors.textFaint },
  pressed: { opacity: 0.7 },
  wrapRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  count: { marginStart: 'auto', fontSize: 12.5, color: colors.textSubtle },
  note: { fontSize: 13, color: colors.textSubtle, lineHeight: 24 },
  sectionList: { gap: 6, marginTop: 10 },
  sectionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingStart: 4,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  sectionTitle: { flex: 1, fontSize: 14.5 },
  addRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 10 },
  addInput: { flex: 1, fontSize: 15 },
});
