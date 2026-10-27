import { StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';
import { Txt } from '../ui/Txt';

/**
 * How much of a meeting's output has left it for the place it belongs.
 *
 * Not «how much is done»: whether the work is finished is the card's business, and the board
 * answers it there. The minutes ask only whether the decision went anywhere.
 */
export function MovedBar({ moved, total }: { moved: number; total: number }) {
  const done = moved === total;
  return (
    <View style={styles.bar}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round((moved / total) * 100)}%` }, done && styles.fillDone]} />
      </View>
      <Txt style={[styles.text, done && styles.textDone]}>{done ? 'رُحِّلت كلّها' : `رُحِّلت ${moved} من ${total}`}</Txt>
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
