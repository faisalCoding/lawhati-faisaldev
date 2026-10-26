import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../../../components/ui/Avatar';
import { Button, Chip, Icon, IconButton } from '../../../../components/ui/Buttons';
import { EditableText } from '../../../../components/ui/EditableText';
import { AvoidKeyboard } from '../../../../components/ui/Keyboard';
import { ModalHeader, Section } from '../../../../components/ui/Layout';
import { Input, Txt } from '../../../../components/ui/Txt';
import { addDays, formatLongDate, todayISO } from '../../../../lib/dates';
import { uid } from '../../../../lib/ids';
import { goBack } from '../../../../lib/nav';
import { colors } from '../../../../lib/theme';
import type { Board, Meeting, MeetingTopic } from '../../../../shared/types';
import { dispatch } from '../../../../store/actions';
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

  const update = (patch: Partial<Pick<Meeting, 'title' | 'date' | 'place'>>) =>
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

          <WhenSection date={meeting.date} onChange={(date) => update({ date })} />

          <Section title="المكان" icon="target">
            <EditableText
              value={meeting.place ?? ''}
              onCommit={(place) => update({ place })}
              placeholder="قاعة الاجتماعات، أو رابط اللقاء"
              style={styles.place}
            />
          </Section>

          <AttendeesSection board={board} meeting={meeting} />
          <TopicsSection boardId={id} meeting={meeting} />

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

function TopicsSection({ boardId, meeting }: { boardId: string; meeting: Meeting }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    dispatch(boardId, { type: 'topic/add', meetingId: meeting.id, topic: { id: uid(), title, notes: '' } });
    setDraft('');
  };

  return (
    <Section title="المحاور" icon="checklist" right={<Txt style={styles.count}>{meeting.topics.length}</Txt>}>
      <View style={styles.topics}>
        {meeting.topics.map((topic, index) => (
          <TopicRow
            key={topic.id}
            boardId={boardId}
            meetingId={meeting.id}
            topic={topic}
            index={index}
            last={index === meeting.topics.length - 1}
          />
        ))}
      </View>
      <View style={styles.addRow}>
        <Input
          value={draft}
          onChangeText={setDraft}
          placeholder="محور جديد"
          onSubmitEditing={add}
          returnKeyType="done"
          style={styles.addInput}
        />
        <IconButton name="plus" label="إضافة المحور" onPress={add} />
      </View>
    </Section>
  );
}

function TopicRow({
  boardId,
  meetingId,
  topic,
  index,
  last,
}: {
  boardId: string;
  meetingId: string;
  topic: MeetingTopic;
  index: number;
  last: boolean;
}) {
  const move = (to: number) => dispatch(boardId, { type: 'topic/move', meetingId, topicId: topic.id, toIndex: to });
  return (
    <View style={styles.topic}>
      <View style={styles.topicHead}>
        <Txt style={styles.topicNumber}>{index + 1}</Txt>
        <EditableText
          value={topic.title}
          onCommit={(title) => dispatch(boardId, { type: 'topic/update', meetingId, topicId: topic.id, patch: { title } })}
          required
          placeholder="عنوان المحور"
          style={styles.topicTitle}
          multiline
        />
        <IconButton name="chevron-up" label="أعلى" onPress={() => move(index - 1)} disabled={index === 0} />
        <IconButton name="chevron-down" label="أسفل" onPress={() => move(index + 1)} disabled={last} />
        <IconButton
          name="trash"
          label="حذف المحور"
          onPress={() => dispatch(boardId, { type: 'topic/remove', meetingId, topicId: topic.id })}
        />
      </View>
      <EditableText
        value={topic.notes}
        onCommit={(notes) => dispatch(boardId, { type: 'topic/update', meetingId, topicId: topic.id, patch: { notes } })}
        placeholder="ما دار من نقاش"
        style={styles.topicNotes}
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: 16, gap: 18, width: '100%', maxWidth: 680, alignSelf: 'center' },
  gone: { padding: 24, textAlign: 'center', color: colors.textSubtle },
  title: { fontSize: 19, fontWeight: '700' },
  place: { fontSize: 15 },
  count: { marginStart: 'auto', fontSize: 12.5, color: colors.textSubtle },
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
  topics: { gap: 12 },
  topic: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: colors.surface },
  topicHead: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 4 },
  topicNumber: { width: 22, paddingTop: 9, fontSize: 13, fontWeight: '700', color: colors.textSubtle },
  topicTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  topicNotes: { fontSize: 14, color: colors.textSubtle, minHeight: 40 },
  addRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 12 },
  addInput: { flex: 1, fontSize: 15 },
});
