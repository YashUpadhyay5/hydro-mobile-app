package cellular.tracker.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Keeps exactly one pending alarm: the next reminder. With exact-alarm access it uses setAlarmClock,
 * which fires on time even in Doze and is the alarm type OEM battery managers are least likely to
 * defer; the status bar shows an alarm icon while one is pending. Without that access it falls back
 * to an inexact allow-while-idle alarm, and the catch-up worker covers the slack.
 */
class AndroidReminderAlarmScheduler(context: Context) : ReminderAlarmScheduler {
    private val appContext = context.applicationContext
    private val alarmManager = appContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    companion object {
        private const val TAG = "ReminderAlarms"
        private const val REQUEST_FIRE = 7301
        const val REQUEST_TEST = 7302

        fun canScheduleExact(context: Context): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
                (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()

        fun firePendingIntent(context: Context, requestCode: Int = REQUEST_FIRE, action: String = ReminderReceiver.ACTION_FIRE): PendingIntent =
            PendingIntent.getBroadcast(
                context, requestCode,
                Intent(context, ReminderReceiver::class.java).setAction(action),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        /** Schedules [operation] at [atMs], exact when permitted. Returns true if the alarm is exact. */
        fun setAlarm(context: Context, atMs: Long, operation: PendingIntent): Boolean {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            return try {
                if (canScheduleExact(context)) {
                    val showIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
                        PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    }
                    alarmManager.setAlarmClock(AlarmManager.AlarmClockInfo(atMs, showIntent), operation)
                    true
                } else {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, operation)
                    false
                }
            } catch (e: SecurityException) {
                // Exact-alarm access revoked between the check and the call.
                Log.w(TAG, "Exact alarm refused, using inexact alarm", e)
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, operation)
                false
            }
        }
    }

    override fun schedule(atMs: Long) {
        val exact = setAlarm(appContext, atMs, firePendingIntent(appContext))
        Log.d(TAG, "Next attendance reminder alarm at $atMs (exact=$exact)")
    }

    override fun cancel() {
        alarmManager.cancel(firePendingIntent(appContext))
    }
}
