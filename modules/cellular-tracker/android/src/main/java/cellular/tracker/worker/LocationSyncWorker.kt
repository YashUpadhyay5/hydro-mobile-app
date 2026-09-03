package cellular.tracker.worker

import android.content.Context
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters
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
        val rawApiBaseUrl = sharedPrefs.getString("apiBaseUrl", null)
        val apiBaseUrl = if (!rawApiBaseUrl.isNullOrEmpty()) rawApiBaseUrl else "http://45.122.121.237:8000/api"

        val db = AppDatabase.getDatabase(appContext)
        val dao = db.offlineLocationDao()
        val totalPendingCount = dao.getPendingCount()

        DebugLogger.log(
            "WORKMANAGER",
            "WORKER_STARTED",
            "RUNNING",
            details = "Worker: LocationSyncWorker | RunAttempt: $runAttemptCount | PendingCount: $totalPendingCount | NetworkState: $netState | Session: $syncSessionId | ApiUrl: $apiBaseUrl"
        )

        // 9-Hour Long Shift Safety Net: Revive LocationTrackingService if Android OS killed it mid-shift
        if (isClockedIn) {
            try {
                val isRunning = isServiceRunning(appContext, cellular.tracker.LocationTrackingService::class.java)
                if (!isRunning) {
                    val serviceIntent = android.content.Intent(appContext, cellular.tracker.LocationTrackingService::class.java)
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                        appContext.startForegroundService(serviceIntent)
                    } else {
                        appContext.startService(serviceIntent)
                    }
                    DebugLogger.log("SERVICE_HEARTBEAT", "SERVICE_RESURRECTED", "SUCCESS", details = "Resurrected LocationTrackingService during WorkManager execution for 9+ hour shift protection")
                    Log.w(TAG, "[9HourShiftSafetyNet] LocationTrackingService was killed by OS mid-shift. Automatically resurrected service!")
                }
            } catch (resErr: Exception) {
                Log.e(TAG, "[9HourShiftSafetyNet] Failed to resurrect service", resErr)
            }
        }

        if (totalPendingCount == 0) {
            DebugLogger.log("WORKMANAGER", "EXECUTION_SKIPPED", "NO_PENDING", details = "No pending records in Room DB to upload. TotalPendingCount: 0")
            Log.d(TAG, "[OfflineSyncEngine] Sync worker finished: No pending location records in Room DB.")
            return Result.success()
        }

        // 1. Transactional recovery of stale UPLOADING records (interrupted by app kill/crash)
        val staleCount = db.runInTransaction<Int> {
            dao.resetStaleUploadingRecords()
        }
        if (staleCount > 0) {
            DebugLogger.log("ROOM_DB", "STALE_RECOVERY", "SUCCESS", details = "Recovered $staleCount stale UPLOADING records to PENDING")
            Log.d(TAG, "[OfflineSyncEngine] Recovered $staleCount stale UPLOADING records back to PENDING state.")
        }

        val pendingLocations = dao.getPendingLocations(BATCH_SIZE)
        if (pendingLocations.isEmpty()) {
            val duration = System.currentTimeMillis() - workerStartTime
            DebugLogger.log("WORKMANAGER", "WORKER_FINISHED", "SUCCESS", details = "Worker: LocationSyncWorker | Duration: ${duration}ms | RemainingQueue: 0 | Status: NO_PENDING_RECORDS")
            Log.d(TAG, "[OfflineSyncEngine] No pending location records to synchronize. Total Pending Count in DB: $totalPendingCount")
            return Result.success()
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
            val json = JSONObject().apply {
                put("id", item.id)
                put("userId", item.userId)
                put("timestamp", item.timestamp)
                put("date", item.date)
                put("trackingMethod", item.trackingMethod)
                put("locationSource", item.locationSource)
                val isLocActive = item.latitude != null && item.longitude != null && item.trackingMethod != "GPS_OFF"
                put("locationEnabled", isLocActive)
                if (item.latitude != null && item.longitude != null) {
                    put("latitude", item.latitude)
                    put("longitude", item.longitude)
                    put("accuracy", item.accuracy ?: 1000.0)
                }
                put("batteryLevel", item.batteryLevel)
                put("batteryTemp", item.batteryTemperature)
                put("isMockLocation", item.isMock)
                if (!item.address.isNullOrEmpty()) put("address", item.address)
                if (item.cellId != null) put("cellId", item.cellId)
                if (item.lac != null) put("lac", item.lac)
                if (item.tac != null) put("tac", item.tac)
                if (item.mcc != null) put("mcc", item.mcc)
                if (item.mnc != null) put("mnc", item.mnc)
                if (item.signalStrength != null) put("signalStrength", item.signalStrength)
                if (item.networkType != null) put("networkType", item.networkType)
            }
            batchPayload.put(json)
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

        var batchResult = sendBatchPostRequest(batchTargetUrl, batchPayload.toString())

        // Fallback: If backend does not support batch endpoint (404/500/null), upload items individually to standard /footprints endpoint
        if (batchResult == null || (batchResult.uploadedIds.isEmpty() && batchResult.failedIds.isEmpty())) {
            DebugLogger.log("API", "BATCH_ENDPOINT_FALLBACK", "WARNING", details = "Batch POST failed/unsupported. Falling back to single location POSTs")
            Log.w(TAG, "[OfflineSyncEngine] Batch endpoint failed or unsupported. Falling back to individual single-location pings...")
            val uploadedIds = mutableListOf<String>()
            val failedIds = mutableListOf<String>()

            for (item in pendingLocations) {
                val json = JSONObject().apply {
                    put("id", item.id)
                    put("userId", item.userId)
                    put("timestamp", item.timestamp)
                    put("date", item.date)
                    put("trackingMethod", item.trackingMethod)
                    put("locationSource", item.locationSource)
                    put("locationEnabled", true)
                    if (item.latitude != null && item.longitude != null) {
                        put("latitude", item.latitude)
                        put("longitude", item.longitude)
                        put("accuracy", item.accuracy ?: 1000.0)
                    }
                    put("batteryLevel", item.batteryLevel)
                    put("batteryTemp", item.batteryTemperature)
                    put("isMockLocation", item.isMock)
                    if (!item.address.isNullOrEmpty()) put("address", item.address)
                    if (item.cellId != null) put("cellId", item.cellId)
                    if (item.lac != null) put("lac", item.lac)
                    if (item.tac != null) put("tac", item.tac)
                    if (item.mcc != null) put("mcc", item.mcc)
                    if (item.mnc != null) put("mnc", item.mnc)
                    if (item.signalStrength != null) put("signalStrength", item.signalStrength)
                    if (item.networkType != null) put("networkType", item.networkType)
                }

                val singleSuccess = sendSinglePostRequest(singleTargetUrl, json.toString())
                if (singleSuccess) {
                    uploadedIds.add(item.id)
                } else {
                    failedIds.add(item.id)
                }
            }
            batchResult = BatchResponse(uploadedIds, failedIds)
        }

        val duration = System.currentTimeMillis() - workerStartTime

        if (batchResult != null && batchResult.uploadedIds.isNotEmpty()) {
            var deletedCount = 0
            db.runInTransaction {
                deletedCount = dao.deleteUploadedLocations(batchResult.uploadedIds)
                if (batchResult.failedIds.isNotEmpty()) {
                    dao.incrementRetryCount(batchResult.failedIds)
                    dao.updateUploadStatus(batchResult.failedIds, OfflineLocation.UPLOAD_STATUS_FAILED)
                }
            }
            val remainingCount = dao.getPendingCount()

            DebugLogger.log("ROOM_DB", "DELETE", "SUCCESS", details = "Deleted $deletedCount acknowledged records | UploadedUUIDs: ${batchResult.uploadedIds} | RemainingQueue: $remainingCount")
            DebugLogger.log("QUEUE", "AFTER_UPLOAD", "SUCCESS", details = "UploadedUUIDs: ${batchResult.uploadedIds} | FailedUUIDs: ${batchResult.failedIds} | DeletedCount: $deletedCount | RemainingCount: $remainingCount")
            DebugLogger.log("WORKMANAGER", "WORKER_FINISHED", "SUCCESS", details = "Worker: LocationSyncWorker | Duration: ${duration}ms | UploadedCount: ${batchResult.uploadedIds.size} | DeletedCount: $deletedCount | FailedCount: ${batchResult.failedIds.size} | RemainingQueue: $remainingCount | RunAttempt: $runAttemptCount")

            Log.d(TAG, "[OfflineSyncEngine] Server ACK received! Uploaded: ${batchResult.uploadedIds.size}, Deleted: $deletedCount, Remaining: $remainingCount")

            if (remainingCount > 0) {
                Log.d(TAG, "[OfflineSyncEngine] Pending queue remaining ($remainingCount). Retrying worker loop...")
                return Result.retry()
            }
            return Result.success()
        } else {
            db.runInTransaction {
                dao.incrementRetryCount(pendingIds)
                dao.updateUploadStatus(pendingIds, OfflineLocation.UPLOAD_STATUS_FAILED)
            }
            val remainingCount = dao.getPendingCount()
            DebugLogger.log("QUEUE", "AFTER_UPLOAD", "FAILURE", details = "Upload failed for all ${pendingIds.size} records. Total pending preserved in DB: $remainingCount")
            DebugLogger.log("WORKMANAGER", "EXECUTION_END", "RETRY", details = "Duration: ${duration}ms, Failure, scheduling retry")
            Log.w(TAG, "[OfflineSyncEngine] Upload failed or server unreachable. Preserving records in Room DB and scheduling retry...")
            return Result.retry()
        }
    }

    private data class BatchResponse(
        val uploadedIds: List<String>,
        val failedIds: List<String>
    )

    private fun sendBatchPostRequest(urlString: String, jsonPayload: String): BatchResponse? {
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
            conn.readTimeout = 10000

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
                BatchResponse(uploadedIds, failedIds)
            } else {
                val errorStr = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error body"
                DebugLogger.log(
                    "API",
                    "BATCH_POST_RECEIVE",
                    "FAILURE",
                    details = "Status: $responseCode | Duration: ${duration}ms | URL: $urlString | ResponseHeaders: $responseHeaders | ErrorBody: $errorStr"
                )
                Log.e(TAG, "[BatchPOST FAILED] Code: $responseCode | URL: $urlString | Headers: $responseHeaders | ErrorBody: $errorStr")
                null
            }
        } catch (e: java.net.SocketTimeoutException) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "BATCH_POST_ERROR", "FAILURE", details = "TIMEOUT ERROR | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "[BatchPOST TIMEOUT] URL: $urlString timeout after ${duration}ms", e)
            null
        } catch (e: javax.net.ssl.SSLException) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "BATCH_POST_ERROR", "FAILURE", details = "SSL ERROR | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "[BatchPOST SSL ERROR] URL: $urlString", e)
            null
        } catch (e: java.net.UnknownHostException) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "BATCH_POST_ERROR", "FAILURE", details = "UNKNOWN HOST ERROR | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "[BatchPOST UNKNOWN HOST] URL: $urlString", e)
            null
        } catch (e: java.net.ConnectException) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "BATCH_POST_ERROR", "FAILURE", details = "CONNECTION REFUSED | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "[BatchPOST CONNECTION REFUSED] URL: $urlString", e)
            null
        } catch (e: Exception) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "BATCH_POST_ERROR", "FAILURE", details = "EXCEPTION: ${e.javaClass.simpleName} | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "[BatchPOST EXCEPTION] URL: $urlString", e)
            null
        } finally {
            conn?.disconnect()
        }
    }

    private fun sendSinglePostRequest(urlString: String, jsonPayload: String): Boolean {
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
                true
            } else {
                val errorStr = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error body"
                DebugLogger.log("API", "SINGLE_POST_RECEIVE", "FAILURE", details = "Status: $responseCode | Duration: ${duration}ms | URL: $urlString | ErrorBody: $errorStr")
                Log.e(TAG, "Single POST to $urlString failed with code: $responseCode, error: $errorStr")
                false
            }
        } catch (e: Exception) {
            val duration = System.currentTimeMillis() - startTime
            DebugLogger.log("API", "SINGLE_POST_ERROR", "FAILURE", details = "EXCEPTION: ${e.javaClass.simpleName} | Duration: ${duration}ms | URL: $urlString | Message: ${e.message}")
            Log.e(TAG, "Single POST network exception for $urlString", e)
            false
        } finally {
            conn?.disconnect()
        }
    }

    private fun isServiceRunning(context: Context, serviceClass: Class<*>): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? android.app.ActivityManager
        @Suppress("DEPRECATION")
        for (service in manager?.getRunningServices(Int.MAX_VALUE) ?: emptyList()) {
            if (serviceClass.name == service.service.className) {
                return true
            }
        }
        return false
    }
}
