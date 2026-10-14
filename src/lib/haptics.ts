import { Platform } from 'react-native';

/** Plays a haptic effect on phones. The web has none, and a failed one is not worth reporting. */
export function haptic(run: () => Promise<void>) {
  if (Platform.OS !== 'web') run().catch(() => {});
}
