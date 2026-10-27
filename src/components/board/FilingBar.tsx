import { StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';
import { Txt } from '../ui/Txt';

/**
 * How much of a meeting's output has been written down where it gets followed.
 *
 * Not «how much is done» — that is a different question the board answers elsewhere. A decision
 * can be filed and still open, which is the normal state of a meeting a week old.
 */
export function FilingBar({ filed, total }: { filed: number; total: number }) {
  const done = filed === total;
  return (
    <View style={styles.bar}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round((filed / total) * 100)}%` }, done && styles.fillDone]} />
      </View>
      <Txt style={[styles.text, done && styles.textDone]}>{done ? 'فُرِّغ كاملًا' : `فُرِّغ ${filed} من ${total}`}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.list, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3, backgroundColor: colors.warning },
  fillDone: { backgroundColor: colors.success },
  text: { fontSize: 11, color: colors.textFaint },
  textDone: { color: colors.success, fontWeight: '700' },
});
