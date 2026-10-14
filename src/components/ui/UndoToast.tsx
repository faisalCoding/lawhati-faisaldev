import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../lib/theme';
import { dismissUndo, takeUndo, useUndoLift, useUndoOffer } from '../../lib/undo';
import { Icon } from './Buttons';
import { Txt } from './Txt';

/** The message after a change to several cards, with «تراجع» (or «إعادة»). Shown over every screen. */
export function UndoToast() {
  const offer = useUndoOffer();
  const lift = useUndoLift();
  const insets = useSafeAreaInsets();
  if (!offer) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 16 + lift }]}>
      {/* A new message is a new view: Android keeps a changed word's old width («تراجع» → «إعادة»). */}
      <View key={offer.id} style={styles.toast} accessibilityLiveRegion="polite">
        <Txt style={styles.text}>{offer.message}</Txt>
        {offer.undo ? (
          <Pressable
            onPress={takeUndo}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.undo, pressed && styles.pressed]}
          >
            <Icon name={offer.redo ? 'redo' : 'undo'} size={16} color="#85B8FF" />
            <Txt style={styles.undoText}>{offer.redo ? 'إعادة' : 'تراجع'}</Txt>
          </Pressable>
        ) : null}
        <Pressable onPress={dismissUndo} accessibilityRole="button" accessibilityLabel="إغلاق" hitSlop={8}>
          <Icon name="close" size={18} color="#B3B9C4" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.text,
    boxShadow: '0px 8px 24px rgba(9,30,66,0.35)',
  },
  text: { flex: 1, color: '#FFFFFF', fontSize: 14 },
  // Never squeezed by a long message: the word must stay whole.
  undo: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, flexShrink: 0 },
  undoText: { color: '#85B8FF', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
