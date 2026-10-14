import type { Ref } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../../lib/theme';
import { Icon } from './Buttons';

/** A round checkbox: an empty ring, or a green disc with a tick once done. */
export function CheckCircle({
  done,
  size = 18,
  style,
  ref,
}: {
  done: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<View>;
}) {
  return (
    <View
      ref={ref}
      collapsable={false}
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, borderWidth: size >= 22 ? 2 : 1.5 },
        done && styles.done,
        style,
      ]}
    >
      {done ? <Icon name="check" size={Math.round(size * 0.64)} color="#FFFFFF" strokeWidth={3} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { borderColor: colors.textFaint, alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: colors.online, borderColor: colors.online },
});
