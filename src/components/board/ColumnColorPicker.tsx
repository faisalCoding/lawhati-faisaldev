import { Pressable, StyleSheet, View } from 'react-native';

import { colors, COLUMN_COLORS } from '../../lib/theme';
import { Icon } from '../ui/Buttons';
import { Txt } from '../ui/Txt';

/**
 * The colours a column can wear, and the plain grey it started with. Picking one is the whole
 * action — it applies at once, as the board's own colour does, so there is nothing to confirm.
 */
export function ColumnColorPicker({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (color: string | null) => void;
}) {
  const current = value ?? null;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(null)}
          accessibilityRole="button"
          accessibilityLabel="بلا لون"
          aria-selected={current === null}
          style={[styles.swatch, styles.plain, current === null && styles.on]}
        >
          {current === null ? <Icon name="check" size={18} color={colors.text} /> : null}
        </Pressable>
        {COLUMN_COLORS.map(({ value: color, name }) => (
          <Pressable
            key={color}
            onPress={() => onChange(color)}
            accessibilityRole="button"
            accessibilityLabel={name}
            aria-selected={current === color}
            style={[styles.swatch, { backgroundColor: color }, current === color && styles.on]}
          >
            {current === color ? <Icon name="check" size={18} color={colors.text} /> : null}
          </Pressable>
        ))}
      </View>
      <Txt style={styles.hint}>الأوّل بلا لون: الرماديّ الذي تبدأ به كلّ قائمة.</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 16, paddingBottom: 16 },
  row: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 44, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  plain: { backgroundColor: colors.list, borderWidth: 1, borderColor: colors.border },
  on: { borderWidth: 2, borderColor: colors.text },
  hint: { fontSize: 12.5, color: colors.textFaint, textAlign: 'right' },
});
