import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/ui/Avatar';
import { Button, Icon, type IconName } from '../components/ui/Buttons';
import { KeyboardScrollView } from '../components/ui/Keyboard';
import { ModalHeader, Section } from '../components/ui/Layout';
import { Txt } from '../components/ui/Txt';
import { BackupError } from '../lib/backup';
import { goBack } from '../lib/nav';
import { pluralBoards } from '../lib/text';
import { colors } from '../lib/theme';
import { asAssignee, signOut, useMemberSession } from '../members/session';
import { NotificationSettings } from '../notifications/NotificationSettings';
import { reconnect } from '../store/actions';
import { pickBackupFile, restoreBackup, saveBackup, type RestoreResult } from '../store/backup';
import { useAppState, type ConnectionStatus } from '../store/store';

const STATUS: Record<ConnectionStatus, { text: string; color: string }> = {
  idle: { text: 'غير مستخدم الآن: لا توجد لوحات مشتركة على هذا الجهاز.', color: colors.offline },
  connecting: { text: 'جارٍ الاتصال…', color: '#E2B203' },
  online: { text: 'متصل بخادم المزامنة.', color: colors.online },
  offline: { text: 'غير متصل. تُعاد المحاولة تلقائيًا، وتعديلاتك محفوظة على الجهاز.', color: colors.danger },
};

const PRINCIPLES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'sparkles', title: 'بساطة', text: 'قوائم وبطاقات فقط، بلا إعداد ولا تدريب.' },
  { icon: 'drag', title: 'سحب وإفلات', text: 'اضغط مطولًا على البطاقة واسحبها بين القوائم.' },
  { icon: 'layers', title: 'مرونة', text: 'قوالب للعمل والسفر والتسوق والدراسة، أو ابدأ من الصفر.' },
  { icon: 'puzzle', title: 'مجاني مع إضافات', text: 'فعّل التسميات والمواعيد وحدود العمل عند الحاجة.' },
  { icon: 'users', title: 'تعاون لحظي', text: 'شارك اللوحة برمز وشاهد تعديلات الفريق فورًا.' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const connection = useAppState((s) => s.connection);
  const status = STATUS[connection];

  return (
    <View style={styles.screen}>
      <ModalHeader title="الإعدادات" onClose={goBack} />
      <KeyboardScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Section title="حسابي" icon="user">
          <AccountSettings />
        </Section>

        <Section title="الإشعارات" icon="bell">
          <NotificationSettings />
        </Section>

        <Section title="النسخ الاحتياطي" icon="archive">
          <BackupSettings />
        </Section>

        <Section title="المزامنة" icon="server">
          <View style={styles.card}>
            <View style={styles.status}>
              <View style={[styles.dot, { backgroundColor: status.color }]} />
              <Txt style={styles.statusText}>{status.text}</Txt>
            </View>
            {connection === 'offline' ? (
              <Button title="إعادة المحاولة الآن" variant="ghost" onPress={reconnect} />
            ) : null}
          </View>
        </Section>

        <Section title="عن التطبيق" icon="info">
          <View style={styles.card}>
            <Txt style={styles.muted}>
              تطبيق مبسّط لإدارة المهام بأسلوب كانبان: لوحة، وقوائم، وبطاقات تنتقل من «للتنفيذ» إلى «مكتمل».
            </Txt>
            {PRINCIPLES.map((p) => (
              <View key={p.title} style={styles.principle}>
                <View style={styles.principleIcon}>
                  <Icon name={p.icon} size={18} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Txt style={styles.principleTitle}>{p.title}</Txt>
                  <Txt style={styles.muted}>{p.text}</Txt>
                </View>
              </View>
            ))}
          </View>
        </Section>
      </KeyboardScrollView>
    </View>
  );
}

/** What a restore did, in a sentence or a few. */
function restoreSummary(r: RestoreResult): string {
  const added = r.added + r.copies;
  const parts = [added ? `أُضيفت ${pluralBoards(added)}.` : 'لم تُضف أي لوحة.'];
  if (r.copies) {
    parts.push(`لم يعد خادم المزامنة يحمل ${pluralBoards(r.copies, true)} منها، فهي على هذا الجهاز وحده.`);
  }
  if (r.existing) {
    parts.push(`وتُخطّيت ${r.existing === 2 ? 'لوحتان موجودتان' : `${pluralBoards(r.existing)} موجودة`} على هذا الجهاز.`);
  }
  if (r.unreachable) {
    parts.push(
      `وتعذّر الوصول إلى خادم المزامنة، فلم تُستعد ${pluralBoards(r.unreachable)} من اللوحات المشتركة. أعد الاستعادة حين يعود الاتصال.`,
    );
  }
  if (r.damaged) parts.push(`وتُخطّي ما تلف في الملف: ${pluralBoards(r.damaged)}.`);
  return parts.join(' ');
}

/** Saves every board to a file, and adds the boards from such a file. */
function BackupSettings() {
  const web = Platform.OS === 'web';
  const [busy, setBusy] = useState<'save' | 'restore' | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  const save = async () => {
    setBusy('save');
    setNote(null);
    try {
      const count = await saveBackup();
      setNote({ text: `${web ? 'نُزّلت' : 'جُهّزت'} نسخة احتياطية فيها ${pluralBoards(count)}.` });
    } catch {
      setNote({ text: 'تعذّر حفظ النسخة الاحتياطية.', error: true });
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setNote(null);
    let text: string | null;
    try {
      text = await pickBackupFile();
    } catch {
      setNote({ text: 'تعذّر فتح الملف.', error: true });
      return;
    }
    if (text === null) return;
    setBusy('restore');
    try {
      setNote({ text: restoreSummary(await restoreBackup(text)) });
    } catch (e) {
      setNote({
        text: e instanceof BackupError ? 'هذا الملف ليس نسخة احتياطية من لوحتي.' : 'تعذّرت الاستعادة.',
        error: true,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      <Txt style={styles.muted}>
        {web
          ? 'احفظ كل لوحاتك في ملف ينزل إلى جهازك، واستعدها متى شئت هنا أو على جوالك.'
          : 'احفظ كل لوحاتك في ملف تضعه في Drive أو ترسله لنفسك على واتساب، واستعدها متى شئت على هذا الجوال أو غيره أو في نسخة الويب.'}
      </Txt>
      <Button
        title={web ? 'تنزيل نسخة احتياطية' : 'حفظ نسخة احتياطية'}
        icon="download"
        loading={busy === 'save'}
        disabled={busy !== null}
        onPress={save}
      />
      <Button
        title="استعادة من ملف"
        icon="upload"
        variant="secondary"
        loading={busy === 'restore'}
        disabled={busy !== null}
        onPress={restore}
      />
      {note ? <Txt style={[styles.note, note.error && styles.noteError]}>{note.text}</Txt> : null}
      <Txt style={styles.muted}>
        الاستعادة تضيف اللوحات التي ليست على هذا الجهاز، ولا تغيّر الموجودة. واللوحة المشتركة تعود مشتركة مع فريقها، بآخر
        ما فيها عندهم.
      </Txt>
    </View>
  );
}

/** The employee this device is signed in as (from the company panel), or a way to sign in. */
function AccountSettings() {
  const { me, expired } = useMemberSession();
  if (!me) {
    return (
      <View style={styles.card}>
        <Txt style={styles.muted}>
          {expired
            ? 'توقف رمز دخولك. اطلب رمزًا جديدًا من مدير لوحة الإدارة.'
            : 'ادخل برمز الموظف الذي يرسله لك مدير لوحة الإدارة، لتُسند البطاقات والمهام لزملائك وتصلك المسندة إليك.'}
        </Txt>
        <Button title="الدخول برمز الموظف" icon="user" onPress={() => router.push('/sign-in')} />
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <View style={styles.accountRow}>
        <Avatar person={asAssignee(me)} size={44} />
        <View style={styles.flex}>
          <Txt style={styles.accountName}>{me.name}</Txt>
          {me.role ? <Txt style={styles.muted}>{me.role}</Txt> : null}
        </View>
      </View>
      <View style={styles.row}>
        <Button title="المسندة إليّ" icon="user-check" onPress={() => router.push('/assigned')} style={styles.flex} />
        <Button title="خروج" icon="logout" variant="secondary" onPress={signOut} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  accountRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  accountName: { fontSize: 17, fontWeight: '700' },
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    boxShadow: '0px 1px 2px rgba(9,30,66,0.12)',
  },
  status: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { flex: 1, fontSize: 14 },
  muted: { fontSize: 13, color: colors.textSubtle },
  note: { fontSize: 14, color: colors.text },
  noteError: { color: colors.danger },
  row: { flexDirection: 'row-reverse', gap: 10 },
  principle: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  principleIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E9F2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  principleTitle: { fontSize: 15, fontWeight: '600' },
});
