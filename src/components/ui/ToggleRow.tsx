import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { colors } from '../../lib/theme';
import { Icon, type IconName } from './Buttons';
import { Txt } from './Txt';

/** A setting that is on or off: icon, title and explanation, with a switch. The whole row toggles it. */
export function ToggleRow({
  icon,
  title,
  description,
  value,
  onChange,
}: {
  icon: IconName;
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" aria-checked={value} style={styles.row}>
      <View style={[styles.icon, value && styles.iconOn]}>
        <Icon name={icon} size={20} color={value ? colors.primary : colors.textSubtle} />
      </View>
      <View style={styles.text}>
        <Txt style={styles.title}>{title}</Txt>
        <Txt style={styles.description}>{description}</Txt>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.list,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOn: { backgroundColor: '#E9F2FF' },
  text: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  description: { fontSize: 13, color: colors.textSubtle, marginTop: 2 },
});
