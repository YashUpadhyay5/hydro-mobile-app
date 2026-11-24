package cellular.tracker.reminders

import android.content.Context

/** Wires [ReminderEngine] to its Android implementations. */
object ReminderEngines {
    fun create(context: Context): ReminderEngine {
        val appContext = context.applicationContext
        return ReminderEngine(
            repository = ReminderStore(appContext),
            checker = HttpAttendanceChecker(appContext),
            presenter = ReminderNotifier(appContext),
            alarms = AndroidReminderAlarmScheduler(appContext),
            // Set by the location tracker while a shift is running (cleared on clock-out).
            trackerActive = {
                appContext.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE).getBoolean("isClockedIn", false)
            },
        )
    }
}
