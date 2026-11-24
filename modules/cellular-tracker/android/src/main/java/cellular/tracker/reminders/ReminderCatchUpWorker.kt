package cellular.tracker.reminders

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Safety net independent of the alarm: every 15 minutes it fires any reminder that is due but was
 * missed (inexact fallback alarm, alarm dropped by an OEM battery manager) and re-arms the alarm.
 * WorkManager reschedules itself after reboot. Neither survives a force-stop.
 */
class ReminderCatchUpWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    companion object {
        private const val WORK_NAME = "ATTENDANCE_REMINDER_CATCHUP"

        fun schedule(context: Context) {
            WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<ReminderCatchUpWorker>(15, TimeUnit.MINUTES).build(),
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context.applicationContext).cancelUniqueWork(WORK_NAME)
        }
    }

    override fun doWork(): Result {
        ReminderEngines.create(applicationContext).onAlarm()
        return Result.success()
    }
}
