import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAssigneeName } from '../../members/session';
import { colors } from '../../lib/theme';
import type { Assignee } from '../../shared/types';
import { Txt } from './Txt';

// Everyone gets the same color on every device: it is picked from their id.
const AVATAR_COLORS = [
  '#0C66E4',
  '#1F845A',
  '#C25100',
  '#AE2E24',
  '#6E5DC6',
  '#AE4787',
  '#206A83',
  '#946F00',
  '#5B7F24',
  '#44546F',
];

export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * The first letters of the first two words of a name, skipping the article of a family name
 * (العتيبي gives ع). Arabic letters would join into a word, so a zero-width non-joiner keeps them
 * apart, the way initials read.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => {
    const chars = Array.from(w);
    return (chars.length > 3 && chars[0] === 'ا' && chars[1] === 'ل' ? chars[2] : chars[0]) ?? '';
  });
  return letters.join('\u200C').toUpperCase();
}

export function Avatar({
  person,
  size = 24,
  style,
}: {
  person: Assignee;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const name = useAssigneeName(person);
  return (
    <View
      accessibilityLabel={name}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(person.id) },
        style,
      ]}
    >
      <Txt style={[styles.letters, { fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.62) }]}>
        {initials(name)}
      </Txt>
    </View>
  );
}

/** An avatar with the person's name next to it. */
export function Person({ person, size = 24 }: { person: Assignee; size?: number }) {
  const name = useAssigneeName(person);
  return (
    <View style={styles.person}>
      <Avatar person={person} size={size} />
      <Txt style={styles.personName} numberOfLines={1}>
        {name}
      </Txt>
    </View>
  );
}

/** A few overlapping avatars, then how many more there are. */
export function AvatarStack({ people, size = 24, max = 3 }: { people: Assignee[]; size?: number; max?: number }) {
  const shown = people.length > max ? people.slice(0, max - 1) : people;
  const more = people.length - shown.length;
  return (
    <View style={styles.stack}>
      {shown.map((p, i) => (
        <Avatar key={p.id} person={p} size={size} style={i > 0 && { marginRight: -size / 5 }} />
      ))}
      {more > 0 ? (
        <View
          style={[
            styles.avatar,
            styles.more,
            { width: size, height: size, borderRadius: size / 2, marginRight: -size / 5 },
          ]}
        >
          <Txt style={[styles.moreText, { fontSize: Math.round(size * 0.42) }]}>{`+${more}`}</Txt>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  letters: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center' },
  // Right to left: the first avatar sits on the right and the others tuck in to its left.
  stack: { flexDirection: 'row-reverse', alignItems: 'center' },
  more: { backgroundColor: colors.list },
  person: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, flexShrink: 1 },
  personName: { fontSize: 14, flexShrink: 1 },
  moreText: { color: colors.textSubtle, fontWeight: '700', textAlign: 'center' },
});
