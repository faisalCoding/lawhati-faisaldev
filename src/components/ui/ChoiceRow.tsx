import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';
import { Icon, type IconName } from './Buttons';
import { Txt } from './Txt';

/**
 * A row in a sheet: an icon (or anything, like an avatar), a label with an optional hint, and
 * whether it applies: `on` (a tick), `some` (a dash: it applies to part of a selection) or `off`.
 */
export function ChoiceRow({
  icon,
  leading,
  label,
  hint,
  state,
  destructive,
  disabled,
  onPress,
}: {
  icon?: IconName;
  leading?: ReactNode;
  label: string;
  hint?: string | null;
  state?: 'on' | 'some' | 'off';
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const tint = destructive ? colors.danger : colors.textSubtle;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={state ? 'checkbox' : 'button'}
      aria-checked={state ? (state === 'some' ? 'mixed' : state === 'on') : undefined}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {leading ?? (icon ? <Icon name={icon} size={20} color={tint} /> : null)}
      <View style={styles.text}>
        <Txt style={[styles.label, destructive && { color: colors.danger }]} numberOfLines={2}>
          {label}
        </Txt>
        {hint ? (
          <Txt style={styles.hint} numberOfLines={2}>
            {hint}
          </Txt>
        ) : null}
      </View>
      {state === 'on' ? <Icon name="check" size={20} color={colors.primary} /> : null}
      {state === 'some' ? <View style={styles.dash} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  pressed: { backgroundColor: colors.neutralBtn },
  disabled: { opacity: 0.45 },
  text: { flex: 1 },
  label: { fontSize: 16 },
  hint: { fontSize: 13, color: colors.textSubtle },
  dash: { width: 14, height: 3, borderRadius: 2, backgroundColor: colors.primary, marginHorizontal: 3 },
});
