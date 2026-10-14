import { requireOptionalNativeModule } from 'expo';

interface ExactAlarmsModule {
  canSchedule(): boolean;
  openSettings(): void;
}

// A local Android module (see android/); absent on iOS, on the web and in Expo Go.
const native = requireOptionalNativeModule<ExactAlarmsModule>('ExactAlarms');

/** Whether reminders can arrive at the exact minute; null where the question does not apply. */
export function canScheduleExactAlarms(): boolean | null {
  return native ? native.canSchedule() : null;
}

/** Opens the phone's "Alarms & reminders" setting for this app. */
export function openExactAlarmSettings() {
  native?.openSettings();
}
