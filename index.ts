import 'expo-router/entry';

import { registerNotificationTasks } from './src/notifications/responses';
import { registerWidgets } from './src/widget/register';

// Android home screen widget (a no-op in Expo Go, on iOS and on the web).
registerWidgets();
// The reminder buttons ("تم", "أجّل ساعة") while the app is closed.
registerNotificationTasks();
