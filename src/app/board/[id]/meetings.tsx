import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon } from '../../../components/ui/Buttons';
import { AvoidKeyboard } from '../../../components/ui/Keyboard';
import { ModalHeader } from '../../../components/ui/Layout';
import { Input, Txt } from '../../../components/ui/Txt';
import { formatLongDate, todayISO } from '../../../lib/dates';
import { uid } from '../../../lib/ids';
import { goBack } from '../../../lib/nav';
import { pluralTopics } from '../../../lib/text';
import { colors } from '../../../lib/theme';
import type { Meeting } from '../../../shared/types';
import { dispatch } from '../../../store/actions';
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

  const add = () => {
    const name = title.trim();
    if (!name) return;
    const meeting: Meeting = {
      id: uid(),
      title: name,
      // Today, because minutes are written on the day far more often than any other. The date is
      // one tap away on the meeting itself for the times it is not.
      date: todayISO(),
      attendees: [],
      topics: [],
      createdAt: Date.now(),
    };
    dispatch(id, { type: 'meeting/add', meeting });
    setTitle('');
    router.push(`/board/${id}/meeting/${meeting.id}`);
  };

  return (
    <View style={styles.screen}>
      <ModalHeader title="الاجتماعات" onClose={goBack} />
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
});
