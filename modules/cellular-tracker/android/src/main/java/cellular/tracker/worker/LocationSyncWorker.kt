package cellular.tracker.worker

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters
import cellular.tracker.LocationTrackingService
import cellular.tracker.TrackingServiceReviver
import cellular.tracker.canStartLocationServiceFromBackground
import cellular.tracker.db.AppDatabase
import cellular.tracker.db.OfflineLocation
import cellular.tracker.logging.DebugLogger
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL

class LocationSyncWorker(
    private val appContext: Context,
    workerParams: WorkerParameters
) : Worker(appContext, workerParams) {

    companion object {
        private const val TAG = "LocationSyncWorker"
        private const val BATCH_SIZE = 50
        private const val PREF_EXHAUSTED_RETRIES_RESET = "exhaustedRetriesResetV1"
    }

    override fun doWork(): Result {
        val syncSessionId = DebugLogger.startSyncSession()
        val workerStartTime = System.currentTimeMillis()

        val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
        val activeNetwork = cm?.activeNetwork
        val caps = cm?.getNetworkCapabilities(activeNetwork)
        val netState = if (caps != null && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)) "CONNECTED" else "DISCONNECTED"

        val sharedPrefs = appContext.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val isClockedIn = sharedPrefs.getBoolean("isClockedIn", false)
        // Handed over by the app when tracking starts. There is deliberately no built-in host to fall back to.
        val apiBaseUrl = sharedPrefs.getString("apiBaseUrl", null).orEmpty()

        val db = AppDatabase.getDatabase(appContext)
        val dao = db.offlineLocationDao()

        // Earlier versions counted network failures as retries and gave up on a record after 15,
        // stranding every point captured during a long bad-signal stretch. Re-queue those once.
        if (!sharedPrefs.getBoolean(PREF_EXHAUSTED_RETRIES_RESET, false)) {
            val rescued = dao.resetExhaustedRetries()
            sharedPrefs.edit().putBoolean(PREF_EXHAUSTED_RETRIES_RESET, true).apply()
            DebugLogger.log("ROOM_DB", "EXHAUSTED_RETRY_RESCUE", "SUCCESS", details = "Re-queued $rescued records that had used up their retries")
        }

        // 1. Transactional recovery of stale UPLOADING records (interrupted by app kill/crash).
        // Runs before counting: getPendingCount() excludes UPLOADING, so records stuck in that state
        // would otherwise be skipped by the "nothing pending" exit below and never uploaded.
        val staleCount = db.runInTransaction<Int> {
            dao.resetStaleUploadingRecords()
        }
        if (staleCount > 0) {
            DebugLogger.log("ROOM_DB", "STALE_RECOVERY", "SUCCESS", details = "Recovered $staleCount stale UPLOADING records to PENDING")
            Log.d(TAG, "[OfflineSyncEngine] Recovered $staleCount stale UPLOADING records back to PENDING state.")
        }

        val totalPendingCount = dao.getPendingCount()
        // UPLOADING records younger than the stale threshold: held by another attempt, or by one
        // that was killed before the server replied. Come back for them rather than finishing.
        val inFlightCount = dao.getUploadingCount()

        DebugLogger.log(
            "WORKMANAGER",
            "WORKER_STARTED",
            "RUNNING",
            details = "Worker: LocationSyncWorker | RunAttempt: $runAttemptCount | PendingCount: $totalPendingCount | NetworkState: $netState | Session: $syncSessionId | ApiUrl: $apiBaseUrl"
        )

        // ── CLOCK-OUT GUARD ──────────────────────────────────────────────────
        // After clock-out the service must not run, but points captured before clock-out
        // (e.g. while offline) must still be uploaded, so the sync below always runs.
        if (!isClockedIn) {
            try {
                val runningIntent = android.content.Intent(appContext, cellular.tracker.LocationTrackingService::class.java)
                appContext.stopService(runningIntent)
                Log.w(TAG, "[ClockOutGuard] isClockedIn=false. Stopped any residual LocationTrackingService; syncing remaining records.")
            } catch (e: Exception) {
                Log.w(TAG, "[ClockOutGuard] Could not stop residual service: ${e.message}")
            }
            DebugLogger.log("WORKMANAGER", "RESURRECTION_SKIPPED", "CLOCKED_OUT", details = "isClockedIn=false. Uploading remaining records without resurrecting the service.")
        } else {
            // 9-Hour Long Shift Safety Net: Revive LocationTrackingService if Android OS killed it mid-shift
            TrackingServiceReviver.reviveIfKilled(appContext, TAG)
        }

        // ── PENDING OFFLINE CLOCK-OUT SYNC ──────────────────────────────────
        syncPendingOfflineClockOut(appContext, apiBaseUrl)
        val hasPendingClockOut = appContext.getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
            .contains("pendingOfflineClockOut")

        if (totalPendingCount == 0 && inFlightCount == 0) {
            if (hasPendingClockOut) {
                Log.d(TAG, "[OfflineSyncEngine] Location records empty, but offline clock-out still pending upload. Retrying.")
                return Result.retry()
            }
            DebugLogger.log("WORKMANAGER", "EXECUTION_SKIPPED", "NO_PENDING", details = "No pending records in Room DB to upload. TotalPendingCount: 0")
            Log.d(TAG, "[OfflineSyncEngine] Sync worker finished: No pending location records in Room DB.")
            if (isClockedIn && apiBaseUrl.isNotEmpty()) {
                checkRemoteSettings(appContext, apiBaseUrl)
            }
            return Result.success()
        }

        val pendingLocations = dao.getPendingLocations(BATCH_SIZE)
        if (pendingLocations.isEmpty()) {
            if (inFlightCount > 0) {
                Log.d(TAG, "[OfflineSyncEngine] $inFlightCount records still UPLOADING. Retrying once they can be recovered.")
                return Result.retry()
            }
            val duration = System.currentTimeMillis() - workerStartTime
            DebugLogger.log("WORKMANAGER", "WORKER_FINISHED", "SUCCESS", details = "Worker: LocationSyncWorker | Duration: ${duration}ms | RemainingQueue: 0 | Status: NO_PENDING_RECORDS")
            Log.d(TAG, "[OfflineSyncEngine] No pending location records to synchronize. Total Pending Count in DB: $totalPendingCount")
            return Result.success()
        }

        if (apiBaseUrl.isEmpty()) {
            // Nowhere to upload to yet. Leave the records PENDING in Room; they go out on a later run
            // once the app has saved a backend address.
            DebugLogger.log("WORKMANAGER", "WORKER_FINISHED", "SKIPPED", details = "No apiBaseUrl saved by the app. PendingCount: $totalPendingCount kept in Room DB")
            Log.w(TAG, "[OfflineSyncEngine] No backend URL saved yet; leaving $totalPendingCount pending records in Room DB.")
            return Result.failure()
        }

        val pendingIds = pendingLocations.map { it.id }
        DebugLogger.log("QUEUE", "BEFORE_UPLOAD", "PENDING", details = "TotalPendingDB: $totalPendingCount | BatchSize: ${pendingLocations.size} | PendingUUIDs: $pendingIds")
        Log.d(TAG, "[OfflineSyncEngine] Sync Started. Total Pending in DB: $totalPendingCount. Processing batch of ${pendingLocations.size} records (Oldest first ORDER BY timestamp ASC):")
        for ((index, item) in pendingLocations.withIndex()) {
            Log.d(TAG, "[OfflineSyncEngine Batch Item #${index + 1}] UUID = ${item.id}, Timestamp = ${item.timestamp}, Date = ${item.date}, Lat = ${item.latitude}, Lng = ${item.longitude}, Source = ${item.locationSource}")
        }

        // 2. Mark batch as UPLOADING in database
        db.runInTransaction {
            dao.updateUploadStatus(pendingIds, OfflineLocation.UPLOAD_STATUS_UPLOADING)
        }
        DebugLogger.log("ROOM_DB", "UPDATE", "SUCCESS", details = "Marked ${pendingIds.size} records as UPLOADING | RowsBefore: $totalPendingCount | UUIDs: $pendingIds")

        val batchPayload = JSONArray()
        for (item in pendingLocations) {
            batchPayload.put(toPayload(item))
        }

        val baseUrlClean = apiBaseUrl.trimEnd('/')
        val batchTargetUrl = if (baseUrlClean.endsWith("/api")) {
            "$baseUrlClean/footprints/batch"
        } else {
            "$baseUrlClean/api/footprints/batch"
        }

        val singleTargetUrl = if (baseUrlClean.endsWith("/api")) {
            "$baseUrlClean/footprints"
        } else {
            "$baseUrlClean/api/footprints"
        }

        val batchResult = sendBatchPostRequest(batchTargetUrl, batchPayload.toString())

        val uploadedIds = mutableListOf<String>()
        val rejectedIds = mutableListOf<String>()
        if (batchResult is BatchResult.Acknowledged && (batchResult.uploadedIds.isNotEmpty() || batchResult.failedIds.isNotEmpty())) {
            uploadedIds += batchResult.uploadedIds
            rejectedIds += batchResult.failedIds
        } else if (batchResult is BatchResult.Unavailable) {
            // Sending 50 single POSTs to a server that cannot be reached would only burn the worker's time budget.
            Log.w(TAG, "[OfflineSyncEngine] Server unavailable. Keeping the batch queued for the next attempt.")
        } else {
            // Fallback: If backend does not support batch endpoint (error status / no IDs), upload items individually to standard /footprints endpoint
            DebugLogger.log("API", "BATCH_ENDPOINT_FALLBACK", "WARNING", details = "Batch POST failed/unsupported. Falling back to single location POSTs")
            Log.w(TAG, "[OfflineSyncEngine] Batch endpoint failed or unsupported. Falling back to individual single-location pings...")
            for (item in pendingLocations) {
                when (sendSinglePostRequest(singleTargetUrl, toPayload(item).toString())) {
                    UploadOutcome.ACCEPTED -> uploadedIds += item.id
                    UploadOutcome.REJECTED -> rejectedIds += item.id
                    UploadOutcome.TRANSIENT_FAILURE -> Unit
                }
            }
        }
        // Records neither acknowledged nor rejected (server unreachable or erroring, or left out of
        // its reply) go straight back to the queue without using up any of their retries.
        val deferredIds = pendingIds - uploadedIds.toSet() - rejectedIds.toSet()

        val duration = System.currentTimeMillis() - workerStartTime
        var deletedCount = 0
        db.runInTransaction {
            if (uploadedIds.isNotEmpty()) {
                deletedCount = dao.deleteUploadedLocations(uploadedIds)
            }
            if (rejectedIds.isNotEmpty()) {
                dao.incrementRetryCount(rejectedIds)
                dao.updateUploadStatus(rejectedIds, OfflineLocation.UPLOAD_STATUS_FAILED)
            }
            if (deferredIds.isNotEmpty()) {
                dao.updateUploadStatus(deferredIds, OfflineLocation.UPLOAD_STATUS_PENDING)
            }
        }
        val remainingCount = dao.getPendingCount()

        DebugLogger.log("ROOM_DB", "DELETE", "SUCCESS", details = "Deleted $deletedCount acknowledged records | UploadedUUIDs: $uploadedIds | RemainingQueue: $remainingCount")
        DebugLogger.log(
            "QUEUE",
            "AFTER_UPLOAD",
            if (uploadedIds.isNotEmpty()) "SUCCESS" else "FAILURE",
            details = "UploadedUUIDs: $uploadedIds | RejectedUUIDs: $rejectedIds | DeferredCount: ${deferredIds.size} | DeletedCount: $deletedCount | RemainingCount: $remainingCount"
        )
        DebugLogger.log("WORKMANAGER", "WORKER_FINISHED", if (remainingCount == 0) "SUCCESS" else "RETRY", details = "Worker: LocationSyncWorker | Duration: ${duration}ms | UploadedCount: ${uploadedIds.size} | DeletedCount: $deletedCount | RejectedCount: ${rejectedIds.size} | DeferredCount: ${deferredIds.size} | RemainingQueue: $remainingCount | RunAttempt: $runAttemptCount")
        Log.d(TAG, "[OfflineSyncEngine] Uploaded: ${uploadedIds.size}, Rejected: ${rejectedIds.size}, Deferred: ${deferredIds.size}, Remaining: $remainingCount")

        val hasPendingClockOutEnd = appContext.getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
            .contains("pendingOfflineClockOut")
        if (uploadedIds.isNotEmpty() && remainingCount == 0 && !hasPendingClockOutEnd) {
            return Result.success()
        }
        Log.d(TAG, "[OfflineSyncEngine] Pending queue remaining (remainingLocations=$remainingCount, pendingClockOut=$hasPendingClockOutEnd). Scheduling retry...")
        return Result.retry()
    }

    private fun syncPendingOfflineClockOut(context: Context, apiBaseUrl: String): Boolean {
        if (apiBaseUrl.isEmpty()) return false
        val sessionPrefs = context.getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
        val pendingClockOutJson = sessionPrefs.getString("pendingOfflineClockOut", null) ?: return true

        val baseUrlClean = apiBaseUrl.trimEnd('/')
        val attendanceUrl = if (baseUrlClean.endsWith("/api")) {
            "$baseUrlClean/attendance"
        } else {
            "$baseUrlClean/api/attendance"
        }

        return try {
            Log.d(TAG, "[OfflineAttendanceSync] Found pending offline clock-out. Attempting sync to $attendanceUrl...")
            val outcome = sendSinglePostRequest(attendanceUrl, pendingClockOutJson)
            if (outcome == UploadOutcome.ACCEPTED) {
                sessionPrefs.edit().remove("pendingOfflineClockOut").apply()
                DebugLogger.log("ATTENDANCE", "OFFLINE_CLOCK_OUT_SYNC", "SUCCESS", details = "Synced pending offline clock out to backend.")
                Log.d(TAG, "[OfflineAttendanceSync] Successfully synced pending offline clock-out and cleared preference.")
                true
            } else {
                Log.w(TAG, "[OfflineAttendanceSync] Sync outcome not success ($outcome). Will retry on next sync cycle.")
                false
            }
        } catch (e: Exception) {
            Log.w(TAG, "[OfflineAttendanceSync] Error syncing pending offline clock-out: ${e.message}")
            false
        }
    }

    private sealed class BatchResult {
        data class Acknowledged(val uploadedIds: List<String>, val failedIds: List<String>) : BatchResult()
        /** Error status or unreadable reply: the endpoint may be unsupported or one record may break it, so try records one by one. */
        object Failed : BatchResult()
        /** Server unreachable, or refusing every request (auth, rate limit): retry the whole batch later. */
        object Unavailable : BatchResult()
    }

    private fun toPayload(item: OfflineLocation): JSONObject = JSONObject().apply {
        put("id", item.id)
        put("userId", item.userId)
        // Record (capture) time; the fix's own time is fixTimestamp, and fixAgeMs is its age at capture.
        put("timestamp", item.timestamp)
        put("date", item.date)
        put("trackingMethod", item.trackingMethod)
        put("locationSource", item.locationSource)
        // Whether device location services were on, not whether this record carries coordinates.
        put("locationEnabled", item.trackingMethod != "GPS_OFF")
        if (item.latitude != null && item.longitude != null) {
            put("latitude", item.latitude)
            put("longitude", item.longitude)
        }
        putOpt("accuracy", item.accuracy)
        putOpt("provider", item.provider)
        putOpt("fixTimestamp", item.fixTimestamp)
        putOpt("fixAgeMs", item.fixAgeMs)
        putOpt("fixElapsedRealtimeNanos", item.fixElapsedRealtimeNanos)
        putOpt("speed", item.speed)
        putOpt("heading", item.bearing)
        putOpt("captureSource", item.captureSource)
        putOpt("validationStatus", item.validationStatus)
        if (item.validationStatus != null && item.validationStatus != "ACCEPTED") put("reason", item.validationStatus)
        put("batteryLevel", item.batteryLevel)
        put("batteryTemp", item.batteryTemperature)
        put("isMockLocation", item.isMock)
        if (!item.address.isNullOrEmpty()) put("address", item.address)
        putOpt("cellId", item.cellId)
        putOpt("lac", item.lac)
        putOpt("tac", item.tac)
        putOpt("mcc", item.mcc)
        putOpt("mnc", item.mnc)
        putOpt("signalStrength", item.signalStrength)
        putOpt("networkType", item.networkType)
    }

    private fun sendBatchPostRequest(urlString: String, jsonPayload: String): BatchResult {
        var conn: HttpURLConnection? = null
        val startTime = System.currentTimeMillis()
        val payloadSize = jsonPayload.toByteArray(charset("utf-8")).size

        DebugLogger.log(
            "API",
            "BATCH_POST_SEND",
            "PENDING",
            details = "URL: $urlString | Method: POST | PayloadSize: $payloadSize bytes | PayloadSnippet: ${jsonPayload.take(300)}"
        )
        Log.d(TAG, "[BatchPOST] Sending request to $urlString (Payload Size: $payloadSize bytes)")

        return try {
            val url = URL(urlString)
            conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            conn.setRequestProperty("Accept", "application/json")

            val sessionPrefs = appContext.getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
            val token = sessionPrefs.getString("userToken", null)
            if (token != null) {
                conn.setRequestProperty("Authorization", "Bearer $token")
            }

            conn.doOutput = true
            conn.connectTimeout = 10000
            // A 50-record batch on a weak mobile connection can take well over 10s to be answered.
            conn.readTimeout = 30000

            val os: OutputStream = conn.outputStream
            val input = jsonPayload.toByteArray(charset("utf-8"))
            os.write(input, 0, input.size)
            os.flush()
            os.close()

            val responseCode = conn.responseCode
            val duration = System.currentTimeMillis() - startTime
            val responseHeaders = conn.headerFields.mapValues { it.value.joinToString(", ") }.toString()

            if (responseCode in 200..299) {
                val responseStr = conn.inputStream.bufferedReader().use { it.readText() }
                DebugLogger.log(
                    "API",
                    "BATCH_POST_RECEIVE",
                    "SUCCESS",
                    details = "Status: $responseCode | Duration: ${duration}ms | URL: $urlString | ResponseBody: ${responseStr.take(300)}"
                )
                Log.d(TAG, "[BatchPOST SUCCESS] Code: $responseCode, Duration: ${duration}ms, Response: $responseStr")

                val json = JSONObject(responseStr)
                val settingsObj = json.optJSONObject("settings")
                if (settingsObj != null) {
                    applyRemoteSettingsIfNewer(appContext, settingsObj)
                }

                val uploadedArr = json.optJSONArray("uploadedIds") ?: JSONArray()
                val failedArr = json.optJSONArray("failedIds") ?: JSONArray()

                val uploadedIds = mutableListOf<String>()
                for (i in 0 until uploadedArr.length()) {
                    uploadedIds.add(uploadedArr.getString(i))
                }

                val failedIds = mutableListOf<String>()
                for (i in 0 until failedArr.length()) {
                    failedIds.add(failedArr.getString(i))
                }
                BatchResult.Acknowledged(uploadedIds, failedIds)
            } else {
                val errorStr = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error body"
                DebugLogger.log(
                    "API",
                    "BATCH_POST_RECEIVE",
                    "FAILURE",
                    details = "Status: $responseCode | Duration: ${duration}ms | URL: $urlString | ResponseHeaders: $responseHeaders | ErrorBody: $errorStr"
                )
                Log.e(TAG, "[BatchPOST FAILED] Code: $responseCode | URL: $urlString | Headers: $responseHeaders | ErrorBody: $errorStr")
                // 5xx still falls back to single POSTs: a single malformed record can fail the whole batch.
                if (responseCode < 500 && classifyHttpStatus(responseCode) == UploadOutcome.TRANSIENT_FAILURE) {
                    BatchResult.Unavailable
                } else {
                    BatchResult.Failed
                }
            }
        } catch (e: java.net.SocketTimeoutException) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "BATCH_POST_ERROR", "FAILURE", details = "TIMEOUT ERROR | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "[BatchPOST TIMEOUT] URL: $urlString timeout after ${duration}ms", e)
            BatchResult.Unavailable
        } catch (e: javax.net.ssl.SSLException) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "BATCH_POST_ERROR", "FAILURE", details = "SSL ERROR | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "[BatchPOST SSL ERROR] URL: $urlString", e)
            BatchResult.Unavailable
        } catch (e: java.net.UnknownHostException) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "BATCH_POST_ERROR", "FAILURE", details = "UNKNOWN HOST ERROR | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "[BatchPOST UNKNOWN HOST] URL: $urlString", e)
            BatchResult.Unavailable
        } catch (e: java.net.ConnectException) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "BATCH_POST_ERROR", "FAILURE", details = "CONNECTION REFUSED | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "[BatchPOST CONNECTION REFUSED] URL: $urlString", e)
            BatchResult.Unavailable
        } catch (e: java.io.IOException) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "BATCH_POST_ERROR", "FAILURE", details = "NETWORK ERROR: ${e.javaClass.simpleName} | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "[BatchPOST NETWORK ERROR] URL: $urlString", e)
            BatchResult.Unavailable
        } catch (e: Exception) {
            // e.g. a 2xx reply whose body is not the expected JSON
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "BATCH_POST_ERROR", "FAILURE", details = "EXCEPTION: ${e.javaClass.simpleName} | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "[BatchPOST EXCEPTION] URL: $urlString", e)
            BatchResult.Failed
        } finally {
            conn?.disconnect()
        }
    }

    private fun sendSinglePostRequest(urlString: String, jsonPayload: String): UploadOutcome {
        var conn: HttpURLConnection? = null
        val startTime = System.currentTimeMillis()
        return try {
            val url = URL(urlString)
            conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            conn.setRequestProperty("Accept", "application/json")

            val sessionPrefs = appContext.getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
            val token = sessionPrefs.getString("userToken", null)
            if (token != null) {
                conn.setRequestProperty("Authorization", "Bearer $token")
            }

            conn.doOutput = true
            conn.connectTimeout = 10000
            conn.readTimeout = 10000

            val os: OutputStream = conn.outputStream
            val input = jsonPayload.toByteArray(charset("utf-8"))
            os.write(input, 0, input.size)
            os.flush()
            os.close()

            val responseCode = conn.responseCode
            val duration = System.currentTimeMillis() - startTime
            if (responseCode in 200..299) {
                DebugLogger.log("API", "SINGLE_POST_RECEIVE", "SUCCESS", details = "Status: $responseCode | Duration: ${duration}ms | URL: $urlString")
                Log.d(TAG, "Single POST to $urlString returned response code: $responseCode")
            } else {
                val errorStr = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error body"
                DebugLogger.log("API", "SINGLE_POST_RECEIVE", "FAILURE", details = "Status: $responseCode | Duration: ${duration}ms | URL: $urlString | ErrorBody: $errorStr")
                Log.e(TAG, "Single POST to $urlString failed with code: $responseCode, error: $errorStr")
            }
            classifyHttpStatus(responseCode)
        } catch (e: Exception) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "SINGLE_POST_ERROR", "FAILURE", details = "EXCEPTION: ${e.javaClass.simpleName} | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "Single POST network exception for $urlString", e)
            UploadOutcome.TRANSIENT_FAILURE
        } finally {
            conn?.disconnect()
        }
    }

    private fun applyRemoteSettingsIfNewer(context: Context, settingsObj: JSONObject) {
        val prefs = context.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val serverVersion = settingsObj.optInt("config_version", 0)
        val localVersion = prefs.getInt("config_version", 0)

        val provider = settingsObj.optString("location_provider", "").takeIf { it.isNotEmpty() }
        val interval = settingsObj.optString("location_update_interval", "").takeIf { it.isNotEmpty() }
        val gpsRatio = settingsObj.optInt("gps_ratio_count", 0)
        val cellRatio = settingsObj.optInt("cellular_ratio_count", 0)

        val currentProvider = prefs.getString("locationProvider", "GPS Preferred")
        val currentInterval = prefs.getString("locationUpdateInterval", "30 Seconds")
        val currentGpsRatio = prefs.getInt("gpsRatioCount", 1)
        val currentCellRatio = prefs.getInt("cellularRatioCount", 2)

        val hasChanged = (serverVersion > 0 && serverVersion > localVersion) ||
            (provider != null && provider != currentProvider) ||
            (interval != null && interval != currentInterval) ||
            (gpsRatio > 0 && gpsRatio != currentGpsRatio) ||
            (cellRatio > 0 && cellRatio != currentCellRatio)

        if (hasChanged) {
            val targetVersion = if (serverVersion > 0) serverVersion else localVersion + 1
            val editor = prefs.edit().putInt("config_version", targetVersion)
            provider?.let { editor.putString("locationProvider", it) }
            interval?.let { editor.putString("locationUpdateInterval", it) }
            if (gpsRatio > 0) editor.putInt("gpsRatioCount", gpsRatio)
            if (cellRatio > 0) editor.putInt("cellularRatioCount", cellRatio)
            editor.apply()

            DebugLogger.log(
                "SETTINGS",
                "BACKGROUND_SETTINGS_SYNCED",
                "SUCCESS",
                details = "Auto-updated from server: version=$targetVersion, provider=$provider, interval=$interval, ratio=$gpsRatio:$cellRatio"
            )
            Log.i(TAG, "[BackgroundSettingsSync] Auto-updated settings in background: v$targetVersion, provider=$provider, interval=$interval, ratio=$gpsRatio:$cellRatio")

            // If user is clocked in, notify LocationTrackingService to immediately re-arm schedule
            if (prefs.getBoolean("isClockedIn", false) && canStartLocationServiceFromBackground(context)) {
                val intent = Intent(context, LocationTrackingService::class.java).apply {
                    action = "cellular.tracker.ACTION_UPDATE_SETTINGS"
                    provider?.let { putExtra("locationProvider", it) }
                    interval?.let { putExtra("locationUpdateInterval", it) }
                    if (gpsRatio > 0) putExtra("gpsRatioCount", gpsRatio)
                    if (cellRatio > 0) putExtra("cellularRatioCount", cellRatio)
                }
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(intent)
                    } else {
                        context.startService(intent)
                    }
                    Log.i(TAG, "[BackgroundSettingsSync] Dispatched ACTION_UPDATE_SETTINGS to LocationTrackingService.")
                } catch (e: Exception) {
                    Log.w(TAG, "Could not send ACTION_UPDATE_SETTINGS to LocationTrackingService", e)
                }
            }
        }
    }

    private fun checkRemoteSettings(context: Context, apiBaseUrl: String) {
        if (apiBaseUrl.isEmpty()) return
        val prefs = context.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val localVersion = prefs.getInt("config_version", 0)

        val baseUrlClean = apiBaseUrl.trimEnd('/')
        val settingsUrl = if (baseUrlClean.endsWith("/api")) {
            "$baseUrlClean/settings?v=$localVersion"
        } else {
            "$baseUrlClean/api/settings?v=$localVersion"
        }

        try {
            val url = URL(settingsUrl)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Accept", "application/json")
            if (localVersion > 0) {
                conn.setRequestProperty("X-Config-Version", localVersion.toString())
            }
            val sessionPrefs = context.getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
            val token = sessionPrefs.getString("userToken", null)
            if (token != null) {
                conn.setRequestProperty("Authorization", "Bearer $token")
            }
            conn.connectTimeout = 5000
            conn.readTimeout = 8000

            val code = conn.responseCode
            if (code == HttpURLConnection.HTTP_NOT_MODIFIED) {
                Log.d(TAG, "[SettingsCheck] HTTP 304: Local config v$localVersion is up to date.")
                return
            }
            if (code in 200..299) {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(body)
                applyRemoteSettingsIfNewer(context, json)
            }
        } catch (e: Exception) {
            Log.d(TAG, "[SettingsCheck] Could not poll settings in background: ${e.message}")
        }
    }
}
