import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '../components/ui/Avatar';
import { Button, Icon } from '../components/ui/Buttons';
import { AvoidKeyboard } from '../components/ui/Keyboard';
import { ModalHeader } from '../components/ui/Layout';
import { Input, Txt } from '../components/ui/Txt';
import { goBack } from '../lib/nav';
import { colors } from '../lib/theme';
import { MemberError, readCode, type Member } from '../members/api';
import { asAssignee, signIn, useMemberSession } from '../members/session';

/**
 * Signs this device in as whoever made an account on faisaldev.site, with the code that site
 * gives them. Opened from the link on that page, the code is already filled in.
 */
export default function SignInScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { expired } = useMemberSession();
  const [text, setText] = useState(() => readCode(params.code ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<Member | null>(null);
  const code = readCode(text);

  const submit = async () => {
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      setWelcome(await signIn(code));
    } catch (e) {
      setError(
        e instanceof MemberError && e.reason === 'invalid'
          ? 'هذا الرمز غير صحيح أو أُوقف. أنشئ رمزًا جديدًا من faisaldev.site/apps/lawhati/code.'
          : 'تعذّر الوصول إلى لوحة الإدارة. تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى.',
      );
    } finally {
      setBusy(false);
    }
  };

  // A code that came in the link is tried right away.
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !params.code) return;
    tried.current = true;
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <ModalHeader title="الدخول برمزك" onClose={goBack} />
      <AvoidKeyboard style={styles.flex}>
        <View style={styles.content}>
          <View style={styles.icon}>
            <Icon name="user" size={34} color={colors.primary} />
          </View>
          {expired ? <Txt style={styles.notice}>توقف رمزك السابق. أنشئ غيره وأدخله.</Txt> : null}
          <Txt style={styles.lead}>
            الصق الرمز الذي أخذته من faisaldev.site/apps/lawhati/code، أو الرابط كاملًا. بعده تستطيع إسناد البطاقات لزملائك، وتصلك
            المسندة إليك.
          </Txt>
          <Input
            autoFocus={!params.code}
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError(null);
            }}
            placeholder="12|AbCd…"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            onSubmitEditing={submit}
            returnKeyType="go"
            style={styles.code}
          />
          {error ? <Txt style={styles.error}>{error}</Txt> : null}
          <Button title="دخول" icon="join" onPress={submit} disabled={!code} loading={busy} />
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
  code: { fontSize: 16, textAlign: 'left', writingDirection: 'ltr' },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
});
