import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { KeyboardRoot } from '../components/ui/Keyboard';
import { UndoToast } from '../components/ui/UndoToast';
import { FONT_FILES } from '../components/ui/Txt';
import { colors } from '../lib/theme';
import { startMemberUpdates } from '../members/updates';
import { NotificationObserver } from '../notifications/responses';
import { startNotificationUpdates } from '../notifications/scheduler';
import { startTeamUpdates } from '../notifications/team';
import { initStore } from '../store/actions';
import { startWidgetUpdates } from '../widget/updates';

// Links from the home screen widget open a card with the boards list underneath.
export const unstable_settings = { initialRouteName: 'index' };

// Keep the splash screen up until the app's font is ready, so text never jumps between fonts.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
    initStore();
    const stopWidgets = startWidgetUpdates();
    const stopNotifications = startNotificationUpdates();
    const stopTeam = startTeamUpdates();
    const stopMembers = startMemberUpdates();
    return () => {
      stopWidgets();
      stopNotifications();
      stopTeam();
      stopMembers();
    };
  }, []);

  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardRoot>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <NotificationObserver />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="board/[id]/index" />
            <Stack.Screen name="board/[id]/card/[cardId]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="board/[id]/settings" options={{ presentation: 'modal' }} />
            <Stack.Screen name="new-board" options={{ presentation: 'modal' }} />
            <Stack.Screen name="join" options={{ presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
            <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
            <Stack.Screen name="assigned" options={{ presentation: 'modal' }} />
            <Stack.Screen name="board/[id]/button" options={{ presentation: 'modal' }} />
            <Stack.Screen name="board/[id]/activity" options={{ presentation: 'modal' }} />
            <Stack.Screen name="board/[id]/meetings" options={{ presentation: 'modal' }} />
            <Stack.Screen name="board/[id]/meeting/[meetingId]" options={{ presentation: 'modal' }} />
            {/* Opened from the home screen widget. */}
            <Stack.Screen name="quick-add" options={{ presentation: 'transparentModal', animation: 'fade' }} />
            <Stack.Screen name="widget-card" options={{ presentation: 'modal' }} />
            <Stack.Screen name="widget-list" options={{ presentation: 'modal' }} />
          </Stack>
          <UndoToast />
        </SafeAreaProvider>
      </KeyboardRoot>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  // Native layout stays left-to-right even on RTL devices; the components draw Arabic
  // right-to-left themselves. (The web has no `direction` style and is LTR already.)
  root: { flex: 1, ...(Platform.OS === 'web' ? null : { direction: 'ltr' as const }) },
});
