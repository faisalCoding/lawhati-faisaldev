import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, IconButton } from '../../../components/ui/Buttons';
import { AvoidKeyboard } from '../../../components/ui/Keyboard';
import { EditableText } from '../../../components/ui/EditableText';
import { ModalHeader, Section } from '../../../components/ui/Layout';
import { Input, Txt } from '../../../components/ui/Txt';
import { formatLongDate, todayISO } from '../../../lib/dates';
import { uid } from '../../../lib/ids';
import { goBack } from '../../../lib/nav';
import { pluralTopics } from '../../../lib/text';
import { colors } from '../../../lib/theme';
import type { AgendaSubject, Meeting } from '../../../shared/types';
import { dispatch, startMeeting } from '../../../store/actions';
import { useBoard } from '../../../store/store';

/** The board's meetings, newest first, and a field to open a new one. */
export default function MeetingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const board = useBoard(id);
  const [title, setTitle] = useState('');

  if (!board || !id) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="الاجتماعات" onClose={goBack} />
      </View>
    );
  }

  const meetings = board.meetings ?? [];
  const agenda = board.agenda ?? [];

  const add = () => {
    const name = title.trim();
    if (!name) return;
    // Today, because minutes are written on the day far more often than any other. The date is one
    // tap away on the meeting itself for the times it is not.
    const meetingId = startMeeting(id, name, todayISO());
    setTitle('');
    if (meetingId) router.push(`/board/${id}/meeting/${meetingId}`);
  };

  return (
    <View style={styles.screen}>
      <ModalHeader title="الاجتماعات" onClose={goBack} />
      {/* The rules the meetings produce live one tap away, because they are read far more often
          than the minutes they came out of. */}
      <Pressable
        onPress={() => router.push(`/board/${id}/policies`)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.policiesLink, pressed && styles.pressed]}
      >
        <Icon name="book" size={16} color={colors.primary} />
        <Txt style={styles.policiesLinkText}>السياسات</Txt>
        <Icon name="chevron-left" size={16} color={colors.primary} />
      </Pressable>
      <AvoidKeyboard style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.addRow}>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder="عنوان الاجتماع"
              onSubmitEditing={add}
              returnKeyType="done"
              style={styles.addInput}
            />
            <Button title="اجتماع جديد" icon="plus" onPress={add} disabled={!title.trim()} />
          </View>

          {agenda.length ? (
            <Txt style={styles.agendaHint}>
              يبدأ كل اجتماع جديد بمحاورك الثابتة ({agenda.length}) جاهزةً للتدوين.
            </Txt>
          ) : null}

          {meetings.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="calendar" size={34} color={colors.textSubtle} />
              <Txt style={styles.emptyText}>
                لا اجتماعات بعد. اكتب عنوانًا أعلاه، ثم أضف محاوره وحضوره وما خرج به.
              </Txt>
            </View>
          ) : (
            meetings.map((meeting) => <Row key={meeting.id} boardId={id} meeting={meeting} />)
          )}

          <AgendaSection boardId={id} agenda={agenda} />
        </ScrollView>
      </AvoidKeyboard>
    </View>
  );
}

function Row({ boardId, meeting }: { boardId: string; meeting: Meeting }) {
  const attendees = meeting.attendees.length;
  return (
    <Pressable
      onPress={() => router.push(`/board/${boardId}/meeting/${meeting.id}`)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowBody}>
        <Txt style={styles.rowTitle} numberOfLines={2}>
          {meeting.title}
        </Txt>
        <Txt style={styles.rowMeta}>
          {formatLongDate(meeting.date)} · {pluralTopics(meeting.topics.length)}
          {attendees ? ` · ${attendees} من الحضور` : ''}
        </Txt>
      </View>
      <Icon name="chevron-left" size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

/**
 * The subjects these meetings keep returning to. Every new meeting starts from them, so the agenda
 * is set once here rather than retyped each week.
 */
function AgendaSection({ boardId, agenda }: { boardId: string; agenda: AgendaSubject[] }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    dispatch(boardId, { type: 'agenda/add', subject: { id: uid(), title } });
    setDraft('');
  };

  const move = (subjectId: string, to: number) => dispatch(boardId, { type: 'agenda/move', subjectId, toIndex: to });

  return (
    <Section title="المحاور الثابتة" icon="layers" right={<Txt style={styles.count}>{agenda.length}</Txt>}>
      <Txt style={styles.note}>
        ما تعودون إليه كل اجتماع. يبدأ كل اجتماع جديد بها، ويبقى بإمكانك إضافة محاور طارئة داخله.
      </Txt>
      <View style={styles.agendaList}>
        {agenda.map((subject, index) => (
          <View key={subject.id} style={styles.agendaRow}>
            <EditableText
              value={subject.title}
              onCommit={(title) => dispatch(boardId, { type: 'agenda/update', subjectId: subject.id, patch: { title } })}
              required
              placeholder="اسم المحور"
              style={styles.agendaTitle}
            />
            <IconButton name="chevron-up" label="أعلى" onPress={() => move(subject.id, index - 1)} disabled={index === 0} />
            <IconButton
              name="chevron-down"
              label="أسفل"
              onPress={() => move(subject.id, index + 1)}
              disabled={index === agenda.length - 1}
            />
            <IconButton
              name="trash"
              label="حذف المحور الثابت"
              onPress={() => dispatch(boardId, { type: 'agenda/remove', subjectId: subject.id })}
            />
          </View>
        ))}
      </View>
      <View style={styles.addRow}>
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder="محور ثابت جديد"
          onSubmitEditing={add}
          returnKeyType="done"
          style={styles.addInput}
        />
        <IconButton name="plus" label="إضافة محور ثابت" onPress={add} disabled={!draft.trim()} />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: 16, gap: 10, width: '100%', maxWidth: 680, alignSelf: 'center' },
  addRow: { gap: 10, marginBottom: 6 },
  addInput: { fontSize: 16 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 48, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', lineHeight: 26 },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowMeta: { fontSize: 12.5, color: colors.textSubtle },
  agendaHint: { fontSize: 12.5, color: colors.textFaint, paddingHorizontal: 2 },
  policiesLink: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.list,
  },
  policiesLinkText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.primary },
  count: { marginStart: 'auto', fontSize: 12.5, color: colors.textSubtle },
  note: { fontSize: 13, color: colors.textSubtle, lineHeight: 24 },
  agendaList: { gap: 6, marginTop: 10 },
  agendaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingStart: 4,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  agendaTitle: { flex: 1, fontSize: 14.5 },
});
