import { widgetsAvailable } from './model';

type WidgetLibrary = typeof import('react-native-android-widget');

/**
 * Registers the home screen widget's background handler and card picker. The widget library
 * requires its native module as soon as it loads, so it is only loaded where that module exists
 * (Android builds), keeping the app runnable in Expo Go.
 */
export function registerWidgets() {
  if (!widgetsAvailable) return;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const lib: WidgetLibrary = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./task-handler') as typeof import('./task-handler');
  const { WidgetConfigurationScreen } = require('./ConfigurationScreen') as typeof import('./ConfigurationScreen');
  /* eslint-enable @typescript-eslint/no-require-imports */
  lib.registerWidgetTaskHandler(widgetTaskHandler);
  lib.registerWidgetConfigurationScreen(WidgetConfigurationScreen);
}
