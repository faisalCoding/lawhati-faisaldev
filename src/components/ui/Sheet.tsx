import { useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type KeyboardTypeOptions,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../lib/theme';
import { Button, Icon, type IconName } from './Buttons';
import { AvoidKeyboard, useModalAutoFocus } from './Keyboard';
import { Input, Txt } from './Txt';

/**
 * A bottom sheet. Screens keep a single Sheet and swap its content (menu → prompt → confirm)
 * instead of stacking modals, which iOS does not allow while one is still animating.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="إغلاق" />
        {/* A modal is a separate Android window; the keyboard controller follows the keyboard there too. */}
        <AvoidKeyboard style={styles.avoider}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <View style={styles.grabber} />
            {title ? <Txt style={styles.title}>{title}</Txt> : null}
            {children}
          </View>
        </AvoidKeyboard>
      </View>
    </Modal>
  );
}

/** How tall a scrolling list in a sheet may be: half the window, so the sheet fits on short screens. */
export function useSheetListHeight(): number {
  const { height } = useWindowDimensions();
  return Math.min(420, Math.round(height * 0.5));
}

export interface SheetAction {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
  hint?: string;
}

export function ActionList({ actions }: { actions: SheetAction[] }) {
  return (
    <View>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Icon name={a.icon} size={20} color={a.destructive ? colors.danger : colors.textSubtle} />
          <View style={styles.actionText}>
            <Txt style={[styles.actionLabel, a.destructive && { color: colors.danger }]}>{a.label}</Txt>
            {a.hint ? <Txt style={styles.actionHint}>{a.hint}</Txt> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function PromptForm({
  initial = '',
  placeholder,
  submitLabel = 'حفظ',
  keyboardType,
  allowEmpty,
  hint,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder?: string;
  submitLabel?: string;
  keyboardType?: KeyboardTypeOptions;
  allowEmpty?: boolean;
  hint?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const canSubmit = allowEmpty || value.trim().length > 0;
  const submit = () => canSubmit && onSubmit(value.trim());

  const inputRef = useRef<TextInput>(null);
  useModalAutoFocus(inputRef);

  return (
    <View style={styles.form}>
      <Input
        ref={inputRef}
        autoFocus={Platform.OS !== 'android'}
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        keyboardType={keyboardType}
        onSubmitEditing={submit}
        returnKeyType="done"
        selectTextOnFocus
      />
      {hint ? <Txt style={styles.hint}>{hint}</Txt> : null}
      <View style={styles.formActions}>
        <Button title={submitLabel} onPress={submit} disabled={!canSubmit} style={styles.flex} />
        <Button title="إلغاء" variant="secondary" onPress={onCancel} style={styles.flex} />
      </View>
    </View>
  );
}

export function ConfirmForm({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.form}>
      <Txt style={styles.message}>{message}</Txt>
      <View style={styles.formActions}>
        <Button title={confirmLabel} variant="danger" icon="trash" onPress={onConfirm} style={styles.flex} />
        <Button title="إلغاء" variant="secondary" onPress={onCancel} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.backdrop },
  avoider: { width: '100%', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 10,
  },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  action: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  actionPressed: { backgroundColor: colors.neutralBtn },
  actionText: { flex: 1 },
  actionLabel: { fontSize: 16 },
  actionHint: { fontSize: 13, color: colors.textFaint, marginTop: 2 },
  form: { gap: 12, paddingTop: 4 },
  formActions: { flexDirection: 'row-reverse', gap: 10 },
  flex: { flex: 1 },
  hint: { fontSize: 13, color: colors.textFaint },
  message: { fontSize: 15, color: colors.textSubtle },
});
