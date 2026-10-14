import { useEffect, type ReactNode, type RefObject } from 'react';
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TurboModuleRegistry,
  type ScrollViewProps,
  type StyleProp,
  type TextInput,
  type ViewStyle,
} from 'react-native';

// Keeping inputs above the keyboard. Android apps now draw edge-to-edge, so the window no longer
// shrinks when the keyboard opens and every screen has to make room itself. App builds use
// react-native-keyboard-controller; Expo Go lacks its native module and gets React Native's own
// KeyboardAvoidingView, which also works on Android when given a behavior.

type KeyboardController = typeof import('react-native-keyboard-controller');

const controller: KeyboardController | null =
  Platform.OS !== 'web' && TurboModuleRegistry.get('KeyboardController') != null
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native-keyboard-controller')
    : null;

const fallbackBehavior = Platform.OS === 'web' ? undefined : 'padding';

export function KeyboardRoot({ children }: { children: ReactNode }) {
  if (!controller) return <>{children}</>;
  return <controller.KeyboardProvider>{children}</controller.KeyboardProvider>;
}

/** Lifts its content above the keyboard; for screens whose inputs sit low, like bottom sheets. */
export function AvoidKeyboard({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  if (controller) {
    return (
      <controller.KeyboardAvoidingView behavior="padding" style={style}>
        {children}
      </controller.KeyboardAvoidingView>
    );
  }
  return (
    <RNKeyboardAvoidingView behavior={fallbackBehavior} style={style}>
      {children}
    </RNKeyboardAvoidingView>
  );
}

/** A scroll view that scrolls the focused input into view above the keyboard. */
export function KeyboardScrollView({ bottomOffset = 24, ...props }: ScrollViewProps & { bottomOffset?: number }) {
  if (controller) {
    return (
      <controller.KeyboardAwareScrollView bottomOffset={bottomOffset} keyboardShouldPersistTaps="handled" {...props} />
    );
  }
  return (
    <RNKeyboardAvoidingView behavior={fallbackBehavior} style={styles.flex}>
      <ScrollView keyboardShouldPersistTaps="handled" {...props} />
    </RNKeyboardAvoidingView>
  );
}

/**
 * Opens the keyboard for a field in a modal. On Android a modal is a window of its own: it
 * focuses the field by itself but leaves the keyboard closed, and a request sent before the
 * window is ready gets dropped. So this asks again, a few times, until the keyboard is up.
 * Elsewhere `autoFocus` does the job.
 */
export function useModalAutoFocus(ref: RefObject<TextInput | null>) {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const open = () => {
      if (controller?.KeyboardController.isVisible()) return;
      // focus() is ignored for a field that is already focused, so blur it first.
      ref.current?.blur();
      ref.current?.focus();
    };
    // Without the keyboard controller there is no reliable way to tell whether it worked.
    const timers = (controller ? [250, 600, 1000] : [250]).map((delay) => setTimeout(open, delay));
    return () => timers.forEach(clearTimeout);
  }, [ref]);
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
