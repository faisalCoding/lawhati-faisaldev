import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, type IconName } from '../../../components/ui/Buttons';
import { ChoiceRow } from '../../../components/ui/ChoiceRow';
import { EditableText } from '../../../components/ui/EditableText';
import { KeyboardScrollView } from '../../../components/ui/Keyboard';
import { ToggleRow } from '../../../components/ui/ToggleRow';
import { BOARD_ICONS } from '../../../components/ui/Icon';
import { ModalHeader, Section } from '../../../components/ui/Layout';
import { ConfirmForm } from '../../../components/ui/Sheet';
import { Txt } from '../../../components/ui/Txt';
import { describeStep } from '../../../lib/buttonSteps';
import { goBack } from '../../../lib/nav';
import { syncErrorMessage } from '../../../lib/syncErrors';
import { BOARD_COLORS, colors } from '../../../lib/theme';
import type { PowerUpKey } from '../../../shared/types';
import { deleteBoard, dispatch, setMeetingsPowerUp, shareBoard, unlinkBoard } from '../../../store/actions';
import { useAppState, useBoardEntry } from '../../../store/store';
import { currentServerUrl } from '../../../store/sync';

// Checklists are not here: every board has them.
// A board made before a key existed simply lacks it, and absent means off — never undefined,
// which would leave the switch not knowing its own state.
const POWER_UPS: { key: PowerUpKey; icon: IconName; title: string; description: string }[] = [
  { key: 'labels', icon: 'tag', title: 'التسميات', description: 'صنّف البطاقات بألوان وأسماء مثل «عاجل» و«فكرة».' },
  {
    key: 'dueDates',
    icon: 'calendar',
    title: 'تواريخ الاستحقاق',
    description: 'موعد لكل بطاقة، مع تنبيه لونيّ للمتأخر.',
  },
  { key: 'covers', icon: 'palette', title: 'أغلفة البطاقات', description: 'ميّز البطاقات المهمة بلون بارز.' },
  {
    key: 'wipLimits',
    icon: 'gauge',
    title: 'حدود العمل (WIP)',
    description: 'حدّد أقصى عدد من البطاقات في كل قائمة، وهي جوهر منهجية كانبان.',
  },
  {
    key: 'meetings',
    icon: 'calendar',
    title: 'الاجتماعات والسياسات',
    description: 'أعمدة في آخر اللوحة: اجتماعاتها بمحاورها وتوصياتها، والقواعد التي استقرّت عليها.',
  },
];

export default function BoardSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const entry = useBoardEntry(id);
  const code = entry?.sync?.code;
  const connection = useAppState((s) => s.connection);
  const online = useAppState((s) => (code ? s.presence[code] : undefined));
  const serverUrl = useAppState((s) => currentServerUrl(s));
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'unlink' | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  if (!entry) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="إعدادات اللوحة" onClose={goBack} />
      </View>
    );
  }

  const { board } = entry;
  const edit = (patch: { title?: string; color?: string; icon?: string }) =>
    dispatch(board.id, { type: 'board/update', patch });

  const share = async () => {
    setSharing(true);
    setShareError(null);
    try {
      await shareBoard(board.id);
    } catch (e) {
      setShareError(syncErrorMessage(e, serverUrl));
    } finally {
      setSharing(false);
    }
  };

  const sendInvite = async () => {
    if (!code) return;
    try {
      await Share.share({ message: `انضم إلى لوحة «${board.title}» في تطبيق لوحتي باستخدام الرمز: ${code}` });
    } catch {
      await Clipboard.setStringAsync(code);
      setCopied(true);
    }
  };

  return (
    <View style={styles.screen}>
      <ModalHeader title="إعدادات اللوحة" onClose={goBack} />
      <KeyboardScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <Section title="الاسم والمظهر" icon="pencil">
          <EditableText value={board.title} onCommit={(title) => edit({ title })} required placeholder="اسم اللوحة" />
          <View style={styles.wrapRow}>
            {BOARD_ICONS.map((icon) => (
              <Pressable
                key={icon}
                onPress={() => edit({ icon })}
                accessibilityRole="button"
                accessibilityLabel="أيقونة اللوحة"
                aria-selected={board.icon === icon}
                style={[styles.iconOption, board.icon === icon && styles.iconOptionOn]}
              >
                <Icon name={icon} size={22} color={board.icon === icon ? colors.primary : colors.textSubtle} />
              </Pressable>
            ))}
          </View>
          <View style={styles.wrapRow}>
            {BOARD_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() => edit({ color })}
                accessibilityRole="button"
                accessibilityLabel="لون اللوحة"
                aria-selected={board.color === color}
                style={[styles.color, { backgroundColor: color }, board.color === color && styles.colorOn]}
              >
                {board.color === color ? <Icon name="check" size={18} color="#FFFFFF" /> : null}
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="الإضافات (Power-Ups)" icon="puzzle">
          <Txt style={styles.muted}>اللوحة بسيطة افتراضيًا. فعّل ما تحتاجه فقط، وكلها مجانية.</Txt>
          <View style={styles.card}>
            {POWER_UPS.map((p, i) => (
              <View key={p.key}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <ToggleRow
                  icon={p.icon}
                  title={p.title}
                  description={p.description}
                  value={board.powerUps[p.key] ?? false}
                  onChange={(enabled) =>
                    p.key === 'meetings'
                      ? setMeetingsPowerUp(board.id, enabled)
                      : dispatch(board.id, { type: 'powerUp/set', key: p.key, enabled })
                  }
                />
              </View>
            ))}
          </View>
          {board.powerUps.labels ? (
            <View style={styles.labels}>
              <Txt style={styles.subheading}>أسماء التسميات</Txt>
              {board.labels.map((label) => (
                <View key={label.id} style={styles.labelRow}>
                  <View style={[styles.labelSwatch, { backgroundColor: label.color }]} />
                  <EditableText
                    value={label.name}
                    onCommit={(name) => dispatch(board.id, { type: 'label/rename', labelId: label.id, name })}
                    placeholder="بلا اسم"
                    style={styles.labelInput}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </Section>

        <Section title="أزرار البطاقات" icon="zap">
          <Txt style={styles.muted}>
            الزر ينفّذ عدة خطوات بضغطة واحدة على البطاقة: استبدال نص في العنوان، أو نقلها، أو إنجازها، أو تلوين غلافها…
            ويظهر في شاشة كل بطاقة وعلى وجهها، ويصل إلى كل فريق اللوحة.
          </Txt>
          {(board.buttons ?? []).map((button) => (
            <ChoiceRow
              key={button.id}
              icon="zap"
              label={button.name}
              hint={button.steps.map((step) => describeStep(step, board)).join('، ')}
              onPress={() =>
                router.push({ pathname: '/board/[id]/button', params: { id: board.id, buttonId: button.id } })
              }
            />
          ))}
          <Button
            title="زر جديد"
            icon="plus"
            variant="secondary"
            onPress={() => router.push(`/board/${board.id}/button`)}
          />
        </Section>

        <Section title="التعاون المباشر" icon="users">
          {code ? (
            <View style={styles.card}>
              <Txt style={styles.muted}>
                شارك هذا الرمز مع فريقك ليفتحوا اللوحة من «انضمام برمز». كل تعديل يظهر عند الجميع فورًا.
              </Txt>
              <Txt style={styles.code} selectable>
                {code}
              </Txt>
              <View style={styles.row}>
                <Button
                  title={copied ? 'تم النسخ' : 'نسخ الرمز'}
                  icon={copied ? 'check' : 'copy'}
                  variant="secondary"
                  onPress={async () => {
                    await Clipboard.setStringAsync(code);
                    setCopied(true);
                  }}
                  style={styles.flex}
                />
                <Button title="إرسال دعوة" icon="share" onPress={sendInvite} style={styles.flex} />
              </View>
              <View style={styles.status}>
                <View
                  style={[styles.dot, { backgroundColor: connection === 'online' ? colors.online : colors.offline }]}
                />
                <Txt style={styles.statusText}>
                  {connection === 'online'
                    ? `متصل الآن · الأجهزة المفتوحة على اللوحة: ${online ?? 1}`
                    : connection === 'connecting'
                      ? 'جارٍ الاتصال بخادم المزامنة…'
                      : 'غير متصل. تعديلاتك محفوظة وستُرسل تلقائيًا عند عودة الاتصال.'}
                </Txt>
              </View>
              {confirm === 'unlink' ? (
                <ConfirmForm
                  message="ستبقى نسخة من اللوحة على هذا الجهاز، لكن لن تصلك تعديلات الفريق ولن تصلهم تعديلاتك."
                  confirmLabel="إيقاف المزامنة"
                  onConfirm={() => {
                    unlinkBoard(board.id);
                    setConfirm(null);
                  }}
                  onCancel={() => setConfirm(null)}
                />
              ) : (
                <Button
                  title="إيقاف المزامنة على هذا الجهاز"
                  icon="logout"
                  variant="ghost"
                  onPress={() => setConfirm('unlink')}
                />
              )}
            </View>
          ) : (
            <View style={styles.card}>
              <Txt style={styles.muted}>
                اجعل اللوحة مشتركة لتعمل عليها مع فريقك في الوقت نفسه: ترون السحب والإضافة والتعديل فورًا على كل
                الأجهزة.
              </Txt>
              <Button title="مشاركة اللوحة" icon="users" onPress={share} loading={sharing} />
              {shareError ? <Txt style={styles.error}>{shareError}</Txt> : null}
              <Pressable onPress={() => router.push('/settings')} accessibilityRole="button">
                <Txt style={styles.link}>خادم المزامنة: {serverUrl}</Txt>
              </Pressable>
            </View>
          )}
        </Section>

        {confirm === 'delete' ? (
          <ConfirmForm
            message={
              code ? 'ستُحذف اللوحة من هذا الجهاز فقط، وتبقى لدى بقية الفريق.' : 'ستُحذف اللوحة وكل ما فيها نهائيًا.'
            }
            confirmLabel="حذف اللوحة"
            onConfirm={() => {
              deleteBoard(board.id);
              router.dismissTo('/');
            }}
            onCancel={() => setConfirm(null)}
          />
        ) : (
          <Button title="حذف اللوحة" icon="trash" variant="danger" onPress={() => setConfirm('delete')} />
        )}
      </KeyboardScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  flex: { flex: 1 },
  row: { flexDirection: 'row-reverse', gap: 10 },
  wrapRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  muted: { fontSize: 14, color: colors.textSubtle },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    boxShadow: '0px 1px 2px rgba(9,30,66,0.12)',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconOptionOn: { borderColor: colors.primary, backgroundColor: '#E9F2FF' },
  color: { width: 44, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  colorOn: { borderWidth: 2, borderColor: colors.text },
  labels: { gap: 8, marginTop: 6 },
  subheading: { fontSize: 14, fontWeight: '600', color: colors.textSubtle },
  labelRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  labelSwatch: { width: 36, height: 28, borderRadius: 6 },
  labelInput: { flex: 1, paddingVertical: 7 },
  code: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
    writingDirection: 'ltr',
    color: colors.text,
    paddingVertical: 6,
  },
  status: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { flex: 1, fontSize: 13, color: colors.textSubtle },
  error: { fontSize: 14, color: colors.danger },
  link: { fontSize: 12, color: colors.textFaint, textAlign: 'center' },
});
