import { router } from 'expo-router';
import { BackHandler, Platform } from 'react-native';

/** Back when there is somewhere to go back to (not the case after a web reload), otherwise home. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Closes a screen opened from the home screen widget. On Android the app exits so the user lands
 * back on their home screen, as if the screen were a small popup over it.
 */
export function leaveScreen(fromWidget: boolean) {
  if (fromWidget && Platform.OS === 'android') BackHandler.exitApp();
  else goBack();
}
