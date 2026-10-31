import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Avatar } from '../components/ui/Avatar';
import { Button, Chip, Icon } from '../components/ui/Buttons';
import { AvoidKeyboard } from '../components/ui/Keyboard';
import { ModalHeader } from '../components/ui/Layout';
import { Input, Txt } from '../components/ui/Txt';
import { goBack } from '../lib/nav';
import { colors } from '../lib/theme';
import { MemberError, type Member } from '../members/api';
import { asAssignee, signIn, signUp, useMemberSession } from '../members/session';

const SITE = 'faisaldev.site/apps/lawhati';

/** Names this device on the site, so its token can be told from another device's. */
const deviceName = () => (Platform.OS === 'web' ? 'المتصفح' : Platform.OS === 'ios' ? 'آيفون' : 'أندرويد');

/** The account someone already has, or the one they make now. */
type Mode = 'in' | 'up';

/**
 * Both ways into an account on faisaldev.site, neither of them leaving the app.
 *
 * The account is the site's — the same email and password its own pages use — but signing up here
 * makes it and signs this device in with it in one step, so nobody has to open a browser to
 * begin. The site mints a token behind the form, and nobody has to know it exists.
 */
export default function SignInScreen() {
  const { expired } = useMemberSession();
  // An invitation sends people here before it can let them in: which form to open with, the
  // address if one is already known, and where they were going.
  const params = useLocalSearchParams<{ mode?: string; email?: string; next?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'up' ? 'up' : 'in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<Member | null>(null);

  // Somewhere inside the app, never an address off it: this screen is reachable by URL on the
  // web, and `next` would otherwise send whoever signs in wherever the link said.
  const next = params.next && params.next.startsWith('/') && !params.next.startsWith('//') ? params.next : null;

  const newAccount = mode === 'up';
  const ready =
    email.trim().length > 0 &&
    password.length > 0 &&
    (!newAccount || (name.trim().length > 0 && confirmation.length > 0));

  const switchTo = (to: Mode) => {
    setMode(to);
    setError(null);
    setNotice(null);
  };

  const typed = (set: (value: string) => void) => (text: string) => {
    set(text);
    setError(null);
  };

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const me = newAccount
        ? await signUp(name, email, password, confirmation, deviceName())
        : await signIn(email, password, deviceName());
      // Sent here on the way to somewhere — a board someone shared — so carry on to it rather
      // than stopping to say hello.
      if (next) router.replace(next);
      else setWelcome(me);
    } catch (e) {
      const reason = e instanceof MemberError ? e.reason : 'offline';
      // Already has an account: not something to correct, something to do instead. The form
      // becomes the sign-in form, keeping the address they just typed.
      if (reason === 'taken') {
        setMode('in');
        setPassword('');
        setConfirmation('');
        setNotice(e instanceof Error && e.message ? e.message : 'لهذا البريد حساب بالفعل. ادخل به.');
        setBusy(false);
        return;
      }
      setError(
        // The site's own sentence when it would not make the account: only it knows which of its
        // rules was broken — the address is taken, the password is too short for its policy, the
        // confirmation does not match — and a guess here would say the wrong one.
        reason === 'rejected' && e instanceof Error && e.message
          ? e.message
          : reason === 'credentials'
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
      <ModalHeader title={newAccount ? 'حساب جديد' : 'الدخول بحسابك'} onClose={goBack} />
      <AvoidKeyboard style={styles.flex}>
        <View style={styles.content}>
          <View style={styles.icon}>
            <Icon name="user" size={34} color={colors.primary} />
          </View>
          <View style={styles.modes}>
            <Chip label="دخول" selected={!newAccount} onPress={() => switchTo('in')} />
            <Chip label="حساب جديد" selected={newAccount} onPress={() => switchTo('up')} />
          </View>
          {notice ? <Txt style={styles.notice}>{notice}</Txt> : null}
          {expired && !notice ? <Txt style={styles.notice}>انتهت جلستك. ادخل مرة أخرى.</Txt> : null}
          <Txt style={styles.lead}>
            {newAccount
              ? `حساب جديد على ${SITE}، يُصنع من هنا وتدخل به في الحال.`
              : `ادخل بنفس البريد وكلمة السرّ اللذين تدخل بهما ${SITE}.`}
          </Txt>
          {newAccount ? (
            <Input
              autoFocus
              value={name}
              onChangeText={typed(setName)}
              placeholder="الاسم"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              style={styles.field}
            />
          ) : null}
          <Input
            autoFocus={!newAccount}
            value={email}
            onChangeText={typed(setEmail)}
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
            onChangeText={typed(setPassword)}
            placeholder="كلمة السرّ"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={newAccount ? 'new-password' : 'current-password'}
            textContentType={newAccount ? 'newPassword' : 'password'}
            onSubmitEditing={newAccount ? undefined : submit}
            returnKeyType={newAccount ? 'next' : 'go'}
            style={styles.field}
          />
          {/* The site's rule for accounts in the app, said before it is broken rather than after. */}
          {newAccount ? <Txt style={styles.hint}>8 أحرف على الأقل، فيها حرف إنجليزي كبير وحرف صغير ورقم.</Txt> : null}
          {newAccount ? (
            <Input
              value={confirmation}
              onChangeText={typed(setConfirmation)}
              placeholder="تأكيد كلمة السرّ"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={submit}
              returnKeyType="go"
              style={styles.field}
            />
          ) : null}
          {error ? <Txt style={styles.error}>{error}</Txt> : null}
          <Button
            title={newAccount ? 'إنشاء الحساب' : 'دخول'}
            icon={newAccount ? 'user-plus' : 'join'}
            onPress={submit}
            disabled={!ready}
            loading={busy}
          />
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
  modes: { flexDirection: 'row-reverse', gap: 8, justifyContent: 'center' },
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
  hint: { fontSize: 12.5, color: colors.textFaint, textAlign: 'right', marginTop: -8 },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
});
