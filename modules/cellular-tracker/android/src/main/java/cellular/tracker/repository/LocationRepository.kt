package cellular.tracker.repository

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import cellular.tracker.db.AppDatabase
import cellular.tracker.db.OfflineLocation
import cellular.tracker.worker.LocationSyncWorker
import cellular.tracker.logging.DebugLogger
import java.util.Calendar
import java.util.concurrent.Executors

class LocationRepository private constructor(context: Context) {
    private val db = AppDatabase.getDatabase(context)
    private val dao = db.offlineLocationDao()
    private val executor = Executors.newSingleThreadExecutor()
    private val appContext = context.applicationContext

    companion object {
        private const val TAG = "LocationRepository"

        @Volatile
        private var INSTANCE: LocationRepository? = null

        fun getInstance(context: Context): LocationRepository {
            return INSTANCE ?: synchronized(this) {
                val instance = LocationRepository(context)
                INSTANCE = instance
                instance
            }
        }
    }

    fun saveLocation(location: OfflineLocation, onSaved: (() -> Unit)? = null) {
        executor.execute {
            try {
                val startTime = System.currentTimeMillis()
                val countBefore = dao.getPendingCount()
                val rowId = dao.insert(location)
                val countAfter = dao.getPendingCount()
                val execTime = System.currentTimeMillis() - startTime

                val exists = rowId > 0
                val verifyStr = if (exists) "YES" else "NO"

                val details = "UUID: ${location.id} | Timestamp: ${location.timestamp} | Lat: ${location.latitude} | Lng: ${location.longitude} | Acc: ${location.accuracy}m | Method: ${location.trackingMethod} | Battery: ${location.batteryLevel}% | Status: ${location.uploadStatus} | QueueBefore: $countBefore | QueueAfter: $countAfter | VerifiedExists: $verifyStr | ExecTime: ${execTime}ms"
                DebugLogger.log("ROOM_DB", "INSERT", if (exists) "SUCCESS" else "FAILURE", uuid = location.id, details = details)
                Log.d(TAG, "[RoomDB] Inserted location into Room SQLite [ID: ${location.id}, Verified Exists: $verifyStr]. $details")
                
                onSaved?.invoke()
                triggerBatchUploadWork(true)
            } catch (e: Exception) {
                DebugLogger.log("ROOM_DB", "INSERT", "FAILURE", uuid = location.id, details = "Error: ${e.message}")
                Log.e(TAG, "[RoomDB] Failed to insert location into Room DB", e)
            }
        }
    }

    fun triggerBatchUploadWork(forceReplace: Boolean = false) {
        try {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncWorkRequest = OneTimeWorkRequestBuilder<LocationSyncWorker>()
                .setConstraints(constraints)
                .build()

            val policy = if (forceReplace) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP

            WorkManager.getInstance(appContext).enqueueUniqueWork(
                "LOCATION_BATCH_SYNC_WORK",
                policy,
                syncWorkRequest
            )
            DebugLogger.log("WORKMANAGER", "ENQUEUE_WORK", "SUCCESS", details = "WorkName: LOCATION_BATCH_SYNC_WORK, Policy: $policy, ForceReplace: $forceReplace")
            Log.d(TAG, "[WorkManager] Enqueued unique batch upload worker 'LOCATION_BATCH_SYNC_WORK' (Policy: $policy, ForceReplace: $forceReplace).")
        } catch (e: Exception) {
            DebugLogger.log("WORKMANAGER", "ENQUEUE_WORK", "FAILURE", details = e.message)
            Log.e(TAG, "[WorkManager] Failed to enqueue WorkManager sync task", e)
        }
    }

    fun getDiagnostics(callback: (DiagnosticsData) -> Unit) {
        executor.execute {
            try {
                val pendingCount = dao.getPendingCount()
                val failedCount = dao.getFailedCount()

                val calendar = Calendar.getInstance().apply {
                    set(Calendar.HOUR_OF_DAY, 0)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                    set(Calendar.MILLISECOND, 0)
                }
                val uploadedToday = dao.getUploadedCountToday(calendar.timeInMillis)
                val lastRecord = dao.getLastLocationRecord()

                val data = DiagnosticsData(
                    pendingCount = pendingCount,
                    failedCount = failedCount,
                    uploadedToday = uploadedToday,
                    lastFixTimestamp = lastRecord?.timestamp ?: 0L,
                    lastFixSource = lastRecord?.locationSource ?: "NONE",
                    lastFixAccuracy = lastRecord?.accuracy ?: 0.0
                )
                callback(data)
            } catch (e: Exception) {
                Log.e(TAG, "Error generating diagnostics data", e)
                callback(DiagnosticsData())
            }
        }
    }

    data class DiagnosticsData(
        val pendingCount: Int = 0,
        val failedCount: Int = 0,
        val uploadedToday: Int = 0,
        val lastFixTimestamp: Long = 0L,
        val lastFixSource: String = "NONE",
        val lastFixAccuracy: Double = 0.0
    )
}
