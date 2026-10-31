import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button, Chip } from '../components/ui/Buttons';
import { EditableText } from '../components/ui/EditableText';
import { ToggleRow } from '../components/ui/ToggleRow';
import { Txt } from '../components/ui/Txt';
import { colors } from '../lib/theme';
import type { ReminderTiming } from './plan';
import { useMe } from '../members/session';
import { setNotificationPrefs, setTeamName, useNotificationPrefs, useTeamName } from './prefs';
import { notificationsSupported, useExactAlarms, useNotificationPermission } from './scheduler';
import { askForTeamPush, usePushState } from './team';
import { webPushSupported } from './webPush';

const TIMINGS: { value: ReminderTiming; label: string }[] = [
  { value: 'dueDay', label: 'يوم الموعد' },
  { value: 'dayBefore', label: 'قبل الموعد بيوم' },
  { value: 'off', label: 'إيقاف' },
];

const HOURS = [7, 8, 9, 10, 12, 18];

function formatHour(hour: number): string {
  if (hour < 12) return `${hour} صباحًا`;
  if (hour === 12) return '12 ظهرًا';
  return `${hour - 12} مساءً`;
}

/** The notification choices in the app's settings. They belong to this phone, not to a board. */
export function NotificationSettings() {
  const prefs = useNotificationPrefs();
  const { permission, request } = useNotificationPermission();
  const { exact, openSettings } = useExactAlarms();
  const pushState = usePushState();
  const active = prefs.reminders !== 'off' || prefs.digest || prefs.team;

  // Read from the platform, not from the permission answer: that arrives a moment later, and until
  // then a browser would be shown the phone's reminder settings.
  if (!notificationsSupported) {
    return webPushSupported ? <BrowserNotifications /> : <Txt style={styles.muted}>الإشعارات متاحة في تطبيق الهاتف.</Txt>;
  }
  if (permission === 'unsupported') {
    return <Txt style={styles.muted}>الإشعارات متاحة في تطبيق الهاتف.</Txt>;
  }

  return (
    <View style={styles.card}>
      {active && permission === 'undetermined' ? (
        <View style={styles.notice}>
          <Txt style={styles.noticeText}>اسمح للتطبيق بإرسال الإشعارات لتصلك التذكيرات.</Txt>
          <Button title="السماح بالإشعارات" icon="bell" onPress={request} />
        </View>
      ) : null}
      {active && permission === 'denied' ? (
        <View style={styles.notice}>
          <Txt style={styles.noticeText}>الإشعارات متوقفة لهذا التطبيق من إعدادات الهاتف، فلن تصلك التذكيرات.</Txt>
          <Button title="فتح إعدادات الهاتف" variant="secondary" onPress={() => Linking.openSettings()} />
        </View>
      ) : null}
      {active && permission === 'granted' && exact === false ? (
        <View style={styles.notice}>
          <Txt style={styles.noticeText}>
            قد يتأخر التذكير حتى ساعة، لأن أندرويد يؤخر التنبيهات لتوفير البطارية. ليصلك في وقته بالضبط، اسمح للتطبيق
            بـ«المنبهات والتذكيرات».
          </Txt>
          <Button title="السماح بالمنبهات والتذكيرات" icon="clock" variant="secondary" onPress={openSettings} />
        </View>
      ) : null}

      <Txt style={styles.label}>تذكير بكل بطاقة لها موعد</Txt>
      <View style={styles.wrapRow}>
        {TIMINGS.map((t) => (
          <Chip
            key={t.value}
            label={t.label}
            selected={prefs.reminders === t.value}
            onPress={() => setNotificationPrefs({ reminders: t.value })}
          />
        ))}
      </View>

      <ToggleRow
        icon="calendar"
        title="خطة اليوم"
        description="إشعار واحد كل يوم بالبطاقات المستحقة والمتأخرة، بدل إشعار لكل بطاقة في يوم موعدها."
        value={prefs.digest}
        onChange={(digest) => setNotificationPrefs({ digest })}
      />

      <Txt style={styles.label}>وقت الإشعار</Txt>
      <View style={styles.wrapRow}>
        {HOURS.map((hour) => (
          <Chip
            key={hour}
            label={formatHour(hour)}
            selected={prefs.hour === hour}
            onPress={() => setNotificationPrefs({ hour })}
          />
        ))}
      </View>

      <Txt style={styles.muted}>
        تصل للبطاقات التي لها موعد، في اللوحات المفعّلة فيها إضافة «المواعيد». البطاقة المعلَّمة «مكتمل»، أو المنقولة
        إلى آخر قائمة مثل «مكتمل»، لا يصلك تذكير بها. وفي الإشعار زر «تم» يعلّم البطاقة مكتملة، و«أجّل ساعة» يعيد
        التذكير بعد ساعة.
      </Txt>

      <View style={styles.divider} />

      <ToggleRow
        icon="users"
        title="نشاط الفريق"
        description="إشعار حين يعدّل أحد من فريقك بطاقة تتابعها في لوحة مشتركة. لا يصلك عن تعديلاتك، ولا واللوحة مفتوحة أمامك، والتعديلات المتتالية تصل في إشعار واحد."
        value={prefs.team}
        onChange={(team) => setNotificationPrefs({ team })}
      />
      {prefs.team && pushState === 'unavailable' ? (
        <View style={styles.notice}>
          <Txt style={styles.noticeText}>
            لا تصل إشعارات الفريق إلى هذا الجهاز وهو مغلق. افتح «لوحتي» من المتصفّح وثبّتها على الشاشة الرئيسية لتصلك، أو اتركها مفتوحة فتظهر التنبيهات داخلها.
          </Txt>
        </View>
      ) : null}

      <TeamName />
    </View>
  );
}

/**
 * What a browser can have: this server's push — being assigned something, or a teammate's edit to a
 * card you follow — which reaches it even closed. Reminders are scheduled by the phone itself and a
 * browser has nothing to leave them with, so the card says where they are instead of offering them.
 * The browser shows its permission prompt only in answer to a tap, so asking is a button.
 */
function BrowserNotifications() {
  const prefs = useNotificationPrefs();
  const pushState = usePushState();
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );
  const [asking, setAsking] = useState(false);

  const ask = async () => {
    setAsking(true);
    await askForTeamPush();
    setPermission(Notification.permission);
    setAsking(false);
  };

  return (
    <View style={styles.card}>
      <ToggleRow
        icon="users"
        title="إشعارات الفريق"
        description="حين يُسند إليك شيء، أو يعدّل أحد من فريقك بطاقة تتابعها. تصلك والمتصفّح مغلق، والتعديلات المتتالية تصل في إشعار واحد."
        value={prefs.team}
        onChange={(team) => setNotificationPrefs({ team })}
      />
      {prefs.team && permission === 'default' ? (
        <View style={styles.notice}>
          <Txt style={styles.noticeText}>اسمح لهذا الموقع بإرسال الإشعارات لتصلك.</Txt>
          <Button title="السماح بالإشعارات" icon="bell" onPress={ask} loading={asking} />
        </View>
      ) : null}
      {prefs.team && permission === 'denied' ? (
        <View style={styles.notice}>
          <Txt style={styles.noticeText}>
            الإشعارات موقوفة لهذا الموقع في المتصفّح. أعد السماح بها من إعدادات الموقع (رمز القفل بجانب العنوان)،
            ثم أعد فتح الصفحة.
          </Txt>
        </View>
      ) : null}
      {prefs.team && permission === 'granted' && pushState === 'unavailable' ? (
        <View style={styles.notice}>
          <Txt style={styles.noticeText}>
            سمح المتصفّح بالإشعارات، لكن تعذّر الاشتراك في إشعارات الخادم الآن. أعد فتح الصفحة بعد قليل.
          </Txt>
        </View>
      ) : null}
      {prefs.team && permission === 'granted' && pushState === 'ready' ? (
        <Txt style={styles.muted}>هذا المتصفّح مشترك، وستصله إشعارات الفريق.</Txt>
      ) : null}

      <TeamName />

      <View style={styles.divider} />
      <Txt style={styles.muted}>
        تذكيرات المواعيد و«خطة اليوم» في تطبيق الهاتف: الهاتف يجدولها بنفسه فتصل دون اتصال، والمتصفّح لا يستطيع ذلك.
      </Txt>
    </View>
  );
}

/** The name teammates see in the notifications this device sends them. */
function TeamName() {
  const name = useTeamName();
  // Signed in as an employee, teammates see the name from the company panel instead.
  const me = useMe();
  return (
    <>
      <Txt style={styles.label}>اسمك في الفريق</Txt>
      {me ? (
        <Txt style={styles.muted}>{`يظهر في إشعارات زملائك باسمك في لوحة الإدارة: ${me.name}.`}</Txt>
      ) : (
        <>
          <EditableText
            value={name}
            onCommit={setTeamName}
            placeholder="مثال: فيصل"
            maxLength={40}
            returnKeyType="done"
          />
          <Txt style={styles.muted}>يظهر في إشعارات زملائك، مثل: نُقلت إلى «مكتمل» — فيصل.</Txt>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    boxShadow: '0px 1px 2px rgba(9,30,66,0.12)',
  },
  notice: { backgroundColor: '#E9F2FF', borderRadius: 10, padding: 12, gap: 10 },
  noticeText: { fontSize: 14 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textSubtle },
  wrapRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  muted: { fontSize: 13, color: colors.textSubtle },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
});
