import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon } from '../components/ui/Buttons';
import { AvoidKeyboard } from '../components/ui/Keyboard';
import { ModalHeader } from '../components/ui/Layout';
import { Input, Txt } from '../components/ui/Txt';
import { codeFromInvite, isCompleteCode } from '../lib/invite';
import { goBack } from '../lib/nav';
import { syncErrorMessage } from '../lib/syncErrors';
import { colors } from '../lib/theme';
import { useMemberSession } from '../members/session';
import { joinBoard } from '../store/actions';
import { useAppState } from '../store/store';
import { currentServerUrl } from '../store/sync';

/**
 * Opening a board someone shared.
 *
 * The invitation is a link now, not a code to read out and type back in, so most people arrive
 * here with the code already in the address and never see this form. It stays for a pasted link,
 * and for a bare code from before.
 *
 * A board is someone's work and the people on it are named to each other, so joining one asks for
 * an account first. Whoever has none is sent to make one, and comes straight back.
 */
export default function JoinScreen() {
  const serverUrl = useAppState((s) => currentServerUrl(s));
  const { token } = useMemberSession();
  // Filled in by an invitation link, or by a card linked to a board this phone does not have yet.
  const params = useLocalSearchParams<{ code?: string }>();
  const [text, setText] = useState(params.code ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = codeFromInvite(text);
  const complete = isCompleteCode(code);
  const invited = isCompleteCode(codeFromInvite(params.code ?? ''));

  const join = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await joinBoard(code);
      goBack();
      router.push(`/board/${id}`);
    } catch (e) {
      setError(syncErrorMessage(e, serverUrl));
      setBusy(false);
    }
  };

  // Sent to make an account, and back here afterwards with the invitation intact. `replace`, so
  // closing that screen does not land on this one and bounce off it again.
  useEffect(() => {
    if (token) return;
    router.replace({
      pathname: '/sign-in',
      params: { mode: 'up', next: complete ? `/join?code=${code}` : '/join' },
    });
  }, [token, complete, code]);

  // Followed a link: the tap on it was the asking, so there is nothing to ask again here.
  const opened = useRef(false);
  useEffect(() => {
    if (!token || !invited || opened.current) return;
    opened.current = true;
    join();
    // join reads only state this effect already depends on through `complete` and `code`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, invited]);

  if (!token) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="انضمام إلى لوحة" onClose={goBack} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ModalHeader title="انضمام إلى لوحة" onClose={goBack} />
      <AvoidKeyboard style={styles.flex}>
        <View style={styles.content}>
          <View style={styles.icon}>
            <Icon name="users" size={34} color={colors.primary} />
          </View>
          {invited && busy ? (
            <Txt style={styles.lead}>جارٍ فتح اللوحة…</Txt>
          ) : (
            <>
              <Txt style={styles.lead}>ألصق رابط الدعوة الذي أرسله لك أحد أعضاء الفريق.</Txt>
              <Input
                autoFocus
                value={text}
                onChangeText={(t) => {
                  setText(t);
                  setError(null);
                }}
                placeholder="https://faisaldev.site/lawhati-app/join?code=ABC123"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                onSubmitEditing={join}
                returnKeyType="go"
                style={styles.link}
              />
              {complete ? <Txt style={styles.found}>{`رمز اللوحة: ${code}`}</Txt> : null}
            </>
          )}
          {error ? <Txt style={styles.error}>{error}</Txt> : null}
          <Button title="انضمام" icon="join" onPress={join} disabled={!complete} loading={busy} />
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
  lead: { fontSize: 16, color: colors.textSubtle, textAlign: 'center' },
  link: { fontSize: 15, textAlign: 'left', writingDirection: 'ltr' },
  found: { fontSize: 13, color: colors.textFaint, textAlign: 'center', letterSpacing: 2 },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
});
