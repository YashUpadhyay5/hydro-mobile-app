package cellular.tracker.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log

/** The app's own reminder broadcasts: the alarm firing, the notification actions, and the test reminder. Not exported. */
class ReminderReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ReminderReceiver"
        const val ACTION_FIRE = "cellular.tracker.reminders.FIRE"
        const val ACTION_SNOOZE = "cellular.tracker.reminders.SNOOZE"
        const val ACTION_DISMISS = "cellular.tracker.reminders.DISMISS"
        const val ACTION_TEST = "cellular.tracker.reminders.TEST"
        private const val WAKELOCK_TIMEOUT_MS = 30_000L
    }

    override fun onReceive(context: Context, intent: Intent) {
        val appContext = context.applicationContext
        val pm = appContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "HRMS:ReminderReceiverLock")?.apply {
            setReferenceCounted(false)
            acquire(WAKELOCK_TIMEOUT_MS)
        }
        val kind = intent.getStringExtra(ReminderActivity.EXTRA_KIND)?.let { runCatching { ReminderKind.valueOf(it) }.getOrNull() }
        val date = intent.getStringExtra(ReminderActivity.EXTRA_DATE)
        // The attendance check does network I/O: keep the receiver alive and do the work off the main thread.
        val pending = goAsync()
        Thread {
            try {
                val engine = ReminderEngines.create(appContext)
                when (intent.action) {
                    ACTION_FIRE -> engine.onAlarm()
                    ACTION_SNOOZE -> if (kind != null && date != null) engine.snooze(kind, date)
                    ACTION_DISMISS -> if (kind != null && date != null) engine.dismiss(kind, date)
                    ACTION_TEST -> if (kind != null && date != null) {
                        // Device test: exercises alarm delivery and the reminder UI without the attendance check.
                        ReminderNotifier(appContext).show(PlannedReminder(kind, date, -1, System.currentTimeMillis()), ReminderStore(appContext).config()
                            ?: return@Thread)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Reminder action ${intent.action} failed", e)
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
