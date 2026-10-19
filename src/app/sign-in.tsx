import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Avatar } from '../components/ui/Avatar';
import { Button, Icon } from '../components/ui/Buttons';
import { AvoidKeyboard } from '../components/ui/Keyboard';
import { ModalHeader } from '../components/ui/Layout';
import { Input, Txt } from '../components/ui/Txt';
import { goBack } from '../lib/nav';
import { colors } from '../lib/theme';
import { MemberError, type Member } from '../members/api';
import { asAssignee, signIn, useMemberSession } from '../members/session';

const SITE = 'faisaldev.site/apps/lawhati';

/** Names this device on the site, so its token can be told from another device's. */
const deviceName = () => (Platform.OS === 'web' ? 'المتصفح' : Platform.OS === 'ios' ? 'آيفون' : 'أندرويد');

/**
 * Signs this device in with the account its owner already has on faisaldev.site — the same email
 * and password they sign in to the site with. There is no separate code: the site mints a token
 * behind this form, and nobody has to know it exists.
 */
export default function SignInScreen() {
  const { expired } = useMemberSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<Member | null>(null);
  const ready = email.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      setWelcome(await signIn(email, password, deviceName()));
    } catch (e) {
      const reason = e instanceof MemberError ? e.reason : 'offline';
      setError(
        reason === 'credentials'
          ? 'البريد أو كلمة السرّ غير صحيحة.'
          : reason === 'throttled'
            ? 'محاولات كثيرة متتابعة. انتظر دقيقة ثم أعد المحاولة.'
            : `تعذّر الوصول إلى ${SITE}. تأكد من اتصالك بالإنترنت ثم حاول مرة أخرى.`,
      );
    } finally {
      setBusy(false);
    }
  };

  if (welcome) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="الدخول" onClose={goBack} />
        <View style={styles.content}>
          <Avatar person={asAssignee(welcome)} size={72} style={styles.welcomeAvatar} />
          <Txt style={styles.title}>{`أهلًا ${welcome.name}`}</Txt>
          <Txt style={styles.lead}>تظهر لك البطاقات والمهام المسندة إليك، ويصلك إشعار حين يُسند إليك شيء جديد.</Txt>
          <Button
            title="المسندة إليّ"
            icon="user-check"
            onPress={() => {
              goBack();
              router.push('/assigned');
            }}
          />
          <Button title="تم" variant="secondary" onPress={goBack} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ModalHeader title="الدخول بحسابك" onClose={goBack} />
      <AvoidKeyboard style={styles.flex}>
        <View style={styles.content}>
          <View style={styles.icon}>
            <Icon name="user" size={34} color={colors.primary} />
          </View>
          {expired ? <Txt style={styles.notice}>انتهت جلستك. ادخل مرة أخرى.</Txt> : null}
          <Txt style={styles.lead}>
            ادخل بنفس البريد وكلمة السرّ اللذين تدخل بهما {SITE}. ليس لك حساب؟ أنشئه من هناك.
          </Txt>
          <Input
            autoFocus
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            placeholder="البريد الإلكتروني"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            style={styles.field}
          />
          <Input
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            placeholder="كلمة السرّ"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={submit}
            returnKeyType="go"
            style={styles.field}
          />
          {error ? <Txt style={styles.error}>{error}</Txt> : null}
          <Button title="دخول" icon="join" onPress={submit} disabled={!ready} loading={busy} />
        </View>
      </AvoidKeyboard>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  content: { padding: 20, gap: 16, width: '100%', maxWidth: 480, alignSelf: 'center' },
  icon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E9F2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  welcomeAvatar: { alignSelf: 'center', marginTop: 12 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  lead: { fontSize: 15, color: colors.textSubtle, textAlign: 'center' },
  notice: {
    fontSize: 14,
    color: colors.warning,
    backgroundColor: colors.warningBg,
    borderRadius: 10,
    padding: 10,
    textAlign: 'center',
  },
  field: { fontSize: 16, textAlign: 'left', writingDirection: 'ltr' },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
});
