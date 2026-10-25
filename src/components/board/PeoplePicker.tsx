import { ScrollView, StyleSheet, View, Pressable } from 'react-native';

import { colors } from '../../lib/theme';
import type { Member } from '../../members/api';
import type { BoardMember } from '../../shared/types';
import { useMemberSession } from '../../members/session';
import { Avatar } from '../ui/Avatar';
import { Button, Icon } from '../ui/Buttons';
import { useSheetListHeight } from '../ui/Sheet';
import { Txt } from '../ui/Txt';

/**
 * Who a card (several people) or a task (one person) may be assigned to: the board's own roster,
 * which every device adds itself to on opening the board.
 *
 * Not the site's team endpoint. That one answers with the asker alone, on purpose — anyone may sign
 * up here, and handing every stranger the names of all the others is a price no feature is worth.
 * The roster is the board's, travels with it, and works with no connection.
 */
export function PeoplePicker({
  members,
  selected,
  single,
  shared,
  onChange,
  onSignIn,
}: {
  /** The board's roster, oldest first. */
  members: BoardMember[];
  /** Ids of the people assigned now. */
  selected: string[];
  /** A task has one person (or none); a card can have several. */
  single?: boolean;
  /** Whether the board is shared: on a board only this phone has, nobody else sees the assignment. */
  shared: boolean;
  /** `member` null: nobody (single only). */
  onChange: (member: Member | null, on: boolean) => void;
  onSignIn: () => void;
}) {
  const { me } = useMemberSession();
  const listHeight = useSheetListHeight();

  if (!me) {
    return (
      <View style={styles.signedOut}>
        <Txt style={styles.note}>ادخل بحسابك أولًا، لتُسند البطاقات.</Txt>
        <Button title="الدخول بحسابك" icon="user" onPress={onSignIn} />
      </View>
    );
  }

  // Me first, then the rest of the roster in the order the board met them. Someone already assigned
  // stays listed even if the roster has not seen them — a board that arrived with assignments on it
  // must still show who they are, and they must stay removable.
  const toMember = (m: BoardMember): Member => ({ id: m.id, name: m.name, role: null, active: true });
  const others = members.filter((m) => m.id !== me.id).map(toMember);
  const missing = selected
    .filter((id) => id !== me.id && !others.some((m) => m.id === id))
    .map((id) => ({ id, name: 'عضو سابق', role: null, active: false }) satisfies Member);
  const people = [me, ...others, ...missing];

  return (
    <ScrollView style={[styles.list, { maxHeight: listHeight }]} keyboardShouldPersistTaps="handled">
      {!shared ? (
        <Txt style={styles.warning}>
          هذه اللوحة على جهازك فقط، فلن يراها من تُسندها إليه ولن يصله إشعار. شاركها من إعدادات اللوحة.
        </Txt>
      ) : null}
      {single ? <Row label="بلا مسؤول" on={selected.length === 0} onPress={() => onChange(null, true)} /> : null}
      {people.map((m) => {
        const on = selected.includes(m.id);
        return (
          <Row
            key={m.id}
            member={m}
            label={m.id === me.id ? `${m.name} (أنا)` : m.name}
            hint={m.active ? m.role : 'لم يعد في الفريق'}
            on={on}
            onPress={() => onChange(m, single ? true : !on)}
          />
        );
      })}
      {people.length === 1 ? (
        <Txt style={styles.note}>
          {shared
            ? 'لا أحد غيرك على هذه اللوحة بعد. من ينضم إليها برمزها ويفتحها يظهر هنا.'
            : 'شارك اللوحة أولًا، فيظهر هنا من ينضم إليها.'}
        </Txt>
      ) : null}
    </ScrollView>
  );
}

function Row({
  member,
  label,
  hint,
  on,
  onPress,
}: {
  member?: Member;
  label: string;
  hint?: string | null;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      aria-checked={on}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {member ? (
        <Avatar person={member} size={32} />
      ) : (
        <View style={styles.nobody}>
          <Icon name="user" size={18} color={colors.textSubtle} />
        </View>
      )}
      <View style={styles.rowText}>
        <Txt style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Txt>
        {hint ? (
          <Txt style={styles.rowHint} numberOfLines={1}>
            {hint}
          </Txt>
        ) : null}
      </View>
      {on ? <Icon name="check" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 420 },
  signedOut: { gap: 12, paddingVertical: 8 },
  note: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', paddingVertical: 8 },
  warning: {
    fontSize: 13,
    color: colors.warning,
    backgroundColor: colors.warningBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  rowPressed: { backgroundColor: colors.neutralBtn },
  nobody: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.list,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16 },
  rowHint: { fontSize: 13, color: colors.textSubtle },
});
