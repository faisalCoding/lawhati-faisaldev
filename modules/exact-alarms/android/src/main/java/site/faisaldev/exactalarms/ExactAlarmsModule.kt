package site.faisaldev.exactalarms

import android.app.AlarmManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Whether the app may ring alarms at an exact minute. Since Android 14 this is off by default, and
 * reminders scheduled without it can arrive up to an hour late.
 */
class ExactAlarmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExactAlarms")

    Function("canSchedule") {
      val context = appContext.reactContext
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        true
      } else {
        context != null && context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()
      }
    }

    // Opens the app's "Alarms & reminders" switch in the phone's settings.
    Function("openSettings") {
      val context = appContext.reactContext
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && context != null) {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }
  }
}
