package cellular.tracker.activities

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log

/** The activity alarm firing and its notification's Silence button. Not exported. */
class ActivityAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val appContext = context.applicationContext
        val wakeLock = (appContext.getSystemService(Context.POWER_SERVICE) as? PowerManager)
            ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "HRMS:ActivityAlarmLock")
            ?.apply { setReferenceCounted(false); acquire(10_000L) }
        try {
            when (intent.action) {
                ActivityAlarm.ACTION_FIRE -> ActivityAlarm(appContext).onFire()
                ActivityAlarm.ACTION_SILENCE -> ActivityAlarm(appContext).silence()
            }
        } catch (e: Exception) {
            Log.e("ActivityAlarmReceiver", "Activity alarm action ${intent.action} failed", e)
        } finally {
            runCatching { if (wakeLock?.isHeld == true) wakeLock.release() }
        }
    }
}

/**
 * Puts the activity alarm back after reboot, app update, or a clock/timezone change, which clear AlarmManager.
 * Exported only so the system can deliver these protected broadcasts; any other action is ignored.
 */
class ActivityAlarmSystemReceiver : BroadcastReceiver() {
    private val handled = setOf(
        Intent.ACTION_BOOT_COMPLETED,
        Intent.ACTION_MY_PACKAGE_REPLACED,
        Intent.ACTION_TIME_CHANGED,
        Intent.ACTION_TIMEZONE_CHANGED,
        "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED",
    )

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in handled) return
        try {
            ActivityAlarm(context.applicationContext).rearm()
        } catch (e: Exception) {
            Log.e("ActivityAlarmSystemReceiver", "Could not re-arm the activity alarm after ${intent.action}", e)
        }
    }
}
