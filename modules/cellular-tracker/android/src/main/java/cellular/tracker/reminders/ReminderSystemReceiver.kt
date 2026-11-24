package cellular.tracker.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log

/**
 * Re-arms reminders after events that clear or invalidate the pending alarm: reboot, app update,
 * clock or timezone change, and exact-alarm permission being granted or revoked. Exported only so
 * the system can deliver these protected broadcasts; any other action is ignored.
 */
class ReminderSystemReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ReminderSystemReceiver"
        private const val WAKELOCK_TIMEOUT_MS = 30_000L
        private val HANDLED = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED",
        )
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in HANDLED) return
        val appContext = context.applicationContext
        val pm = appContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "HRMS:ReminderSystemReceiverLock")?.apply {
            setReferenceCounted(false)
            acquire(WAKELOCK_TIMEOUT_MS)
        }
        val pending = goAsync()
        Thread {
            try {
                // onAlarm also shows anything that came due while the phone was off, then re-arms the alarm.
                val engine = ReminderEngines.create(appContext)
                engine.onAlarm()
                if (ReminderStore(appContext).config()?.enabled == true) ReminderCatchUpWorker.schedule(appContext)
            } catch (e: Exception) {
                Log.e(TAG, "Could not reschedule reminders after ${intent.action}", e)
            } finally {
                try {
                    if (wakeLock?.isHeld == true) wakeLock.release()
                } catch (e: Exception) {
                    Log.w(TAG, "Error releasing wakeLock", e)
                }
                pending.finish()
            }
        }.start()
    }
}
