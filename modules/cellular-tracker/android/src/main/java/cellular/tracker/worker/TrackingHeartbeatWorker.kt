package cellular.tracker.worker

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import cellular.tracker.TrackingServiceReviver
import cellular.tracker.repository.LocationRepository

/**
 * Periodic safety net for a clocked-in shift, independent of the tracking service and its alarm
 * chain (WorkManager also survives reboots): if the service was killed and nothing revived it,
 * revive it, and make sure queued points keep uploading.
 */
class TrackingHeartbeatWorker(
    private val appContext: Context,
    workerParams: WorkerParameters
) : Worker(appContext, workerParams) {

    override fun doWork(): Result {
        val prefs = appContext.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val repository = LocationRepository.getInstance(appContext)
        if (!prefs.getBoolean("isClockedIn", false)) {
            repository.cancelTrackingHeartbeat()
            return Result.success()
        }

        TrackingServiceReviver.reviveIfKilled(appContext, "TrackingHeartbeatWorker")
        // KEEP: don't cancel an upload that is already running or waiting for the network.
        repository.triggerBatchUploadWork(forceReplace = false)
        return Result.success()
    }
}
