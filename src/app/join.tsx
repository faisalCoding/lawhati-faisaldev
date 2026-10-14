import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon } from '../components/ui/Buttons';
import { AvoidKeyboard } from '../components/ui/Keyboard';
import { ModalHeader } from '../components/ui/Layout';
import { Input, Txt } from '../components/ui/Txt';
import { normalizeShareCode, SHARE_CODE_LENGTH } from '../lib/ids';
import { goBack } from '../lib/nav';
import { syncErrorMessage } from '../lib/syncErrors';
import { colors } from '../lib/theme';
import { joinBoard } from '../store/actions';
import { useAppState } from '../store/store';
import { currentServerUrl } from '../store/sync';

export default function JoinScreen() {
  const serverUrl = useAppState((s) => currentServerUrl(s));
  // Filled in when opened from a card linked to a board this phone doesn't have yet.
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => normalizeShareCode(params.code ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = code.length === SHARE_CODE_LENGTH;

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

  return (
    <View style={styles.screen}>
      <ModalHeader title="انضمام إلى لوحة" onClose={goBack} />
      <AvoidKeyboard style={styles.flex}>
        <View style={styles.content}>
          <View style={styles.icon}>
            <Icon name="users" size={34} color={colors.primary} />
          </View>
          <Txt style={styles.lead}>اكتب رمز اللوحة الذي أرسله لك أحد أعضاء الفريق.</Txt>
          <Input
            autoFocus
            value={code}
            onChangeText={(t) => {
              setCode(normalizeShareCode(t));
              setError(null);
            }}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={SHARE_CODE_LENGTH}
            onSubmitEditing={join}
            returnKeyType="go"
            style={styles.code}
          />
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
  code: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    writingDirection: 'ltr',
    paddingVertical: 14,
  },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
});
