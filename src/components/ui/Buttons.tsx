import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors } from '../../lib/theme';
import { Icon, type IconName } from './Icon';
import { Txt } from './Txt';

export { Icon, type IconName };

export function IconButton({
  name,
  onPress,
  color = colors.textSubtle,
  size = 22,
  label,
  style,
  disabled,
}: {
  name: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
  label: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'light';

const VARIANTS: Record<Variant, { bg: string; bgPressed: string; fg: string }> = {
  primary: { bg: colors.primary, bgPressed: colors.primaryPressed, fg: colors.onPrimary },
  secondary: { bg: colors.neutralBtn, bgPressed: colors.neutralBtnPressed, fg: colors.text },
  danger: { bg: colors.dangerBg, bgPressed: '#FFD5D2', fg: colors.danger },
  ghost: { bg: 'transparent', bgPressed: colors.neutralBtn, fg: colors.textSubtle },
  light: { bg: 'rgba(255,255,255,0.22)', bgPressed: 'rgba(255,255,255,0.34)', fg: '#FFFFFF' },
};

export function Button({
  title,
  icon,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  compact,
  style,
}: {
  title: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: pressed ? v.bgPressed : v.bg },
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <View style={styles.buttonRow}>
          {icon ? <Icon name={icon} size={compact ? 16 : 18} color={v.fg} /> : null}
          <ButtonLabel title={title} style={[styles.buttonText, compact && styles.buttonTextCompact, { color: v.fg }]} />
        </View>
      )}
    </Pressable>
  );
}

/**
 * Android 15+ breaks lines where the glyphs' drawn shapes end, but React Native sizes text by the
 * glyphs' advances. Ink that reaches past them (the hamza of «إلغاء») no longer fits the box measured
 * for it, and the last letter drops to a hidden second line («إلغا»). So on Android an invisible copy
 * sizes the label and the visible one is drawn over it in a slightly wider box.
 */
function ButtonLabel({ title, style }: { title: string; style: StyleProp<TextStyle> }) {
  if (Platform.OS !== 'android') return <Txt style={style}>{title}</Txt>;
  return (
    <View>
      <Txt style={[style, styles.labelSizer]} aria-hidden>
        {title}
      </Txt>
      <Txt style={[style, styles.labelText]}>{title}</Txt>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      aria-selected={selected}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      {color ? <View style={[styles.chipDot, { backgroundColor: color }]} /> : null}
      {icon ? <Icon name={icon} size={15} color={selected ? colors.primary : colors.textSubtle} /> : null}
      <Txt style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Txt>
      {selected ? <Icon name="check" size={15} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.45 },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { minHeight: 34, paddingHorizontal: 12, borderRadius: 8 },
  buttonRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  buttonText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  buttonTextCompact: { fontSize: 14 },
  labelSizer: { opacity: 0 },
  labelText: { position: 'absolute', top: 0, bottom: 0, left: -4, right: -4, textAlignVertical: 'center' },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.neutralBtn,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipSelected: { backgroundColor: '#E9F2FF', borderColor: colors.primary },
  chipDot: { width: 14, height: 14, borderRadius: 7 },
  chipText: { fontSize: 14, color: colors.textSubtle },
  chipTextSelected: { color: colors.primary, fontWeight: '600' },
});
