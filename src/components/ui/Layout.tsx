import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../lib/theme';
import { Icon, IconButton, type IconName } from './Buttons';
import { Txt } from './Txt';

/** Header for screens presented as modals (a sheet on iOS, full screen elsewhere). */
export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'ios' ? 14 : insets.top + 10;
  return (
    <View style={[styles.modalHeader, { paddingTop: top }]}>
      <Txt style={styles.modalTitle} numberOfLines={1}>
        {title}
      </Txt>
      <IconButton name="close" label="إغلاق" onPress={onClose} size={24} />
    </View>
  );
}

export function Section({
  title,
  icon,
  children,
  right,
}: {
  title: string;
  icon?: IconName;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon ? <Icon name={icon} size={18} color={colors.textSubtle} /> : null}
        <Txt style={styles.sectionTitle}>{title}</Txt>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  modalHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  section: { gap: 10, marginBottom: 22 },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textSubtle },
});
