import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../../lib/theme';
import { Icon } from '../ui/Buttons';
import { CARD_GAP } from './boardApi';

const REACH = 4;

/**
 * The gap above a card. Pointing at it shows a dashed line with a small "+" that adds a card
 * there. It reaches a little into the cards around it, so the thin gap is easy to hit.
 */
export function InsertGap({ onPress }: { onPress: () => void }) {
  const [shown, setShown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setShown(true)}
      onHoverOut={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
      accessibilityRole="button"
      accessibilityLabel="إضافة بطاقة هنا"
      style={styles.zone}
    >
      {shown ? (
        <>
          <View style={styles.line} />
          <View style={styles.button}>
            <Icon name="plus" size={14} color={colors.textSubtle} strokeWidth={2.5} />
          </View>
          <View style={styles.line} />
        </>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  zone: {
    position: 'absolute',
    top: -CARD_GAP - REACH,
    left: 0,
    right: 0,
    height: CARD_GAP + 2 * REACH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
  },
  line: { flex: 1, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.textFaint },
  button: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 1px 1px rgba(9,30,66,0.25), 0px 0px 1px rgba(9,30,66,0.31)',
  },
});
