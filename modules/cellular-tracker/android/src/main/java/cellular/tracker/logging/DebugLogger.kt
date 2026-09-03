package cellular.tracker.logging

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

object DebugLogger {
    private const val TAG = "HRMS_DebugLogger"
    private const val MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024L // 20 MB
    private val logExecutor = Executors.newSingleThreadExecutor()
    private var appContext: Context? = null
    
    @Volatile
    var currentSyncSessionId: String = "N/A"

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun startSyncSession(): String {
        val timestampStr = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        currentSyncSessionId = "SYNC_$timestampStr"
        return currentSyncSessionId
    }

    fun log(
        module: String,
        action: String,
        status: String,
        uuid: String? = null,
        details: String? = null
    ) {
        val now = Date()
        val timeStr = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault()).format(now)
        val threadName = Thread.currentThread().name
        val safeUuid = uuid ?: "N/A"
        val safeDetails = details ?: "None"
        val sessionId = currentSyncSessionId

        val formattedLog = StringBuilder().apply {
            append("----------------------------------------------------\n")
            append("Time: [$timeStr]\n")
            append("MODULE: $module\n")
            append("ACTION: $action\n")
            append("STATUS: $status\n")
            append("UUID: $safeUuid\n")
            append("Thread: $threadName\n")
            append("Sync Session: $sessionId\n")
            append("Details: $safeDetails\n")
            append("----------------------------------------------------")
        }.toString()

        // 1. Output to Logcat
        Log.d(TAG, formattedLog)

        // 2. Write to local debug log file asynchronously
        logExecutor.execute {
            try {
                appContext?.let { ctx ->
                    val dateStr = SimpleDateFormat("yyyyMMdd", Locale.getDefault()).format(now)
                    val dir = File(ctx.getExternalFilesDir(null), "debug_logs")
                    if (!dir.exists()) {
                        dir.mkdirs()
                    }

                    val logFile = File(dir, "debug_$dateStr.txt")
                    if (logFile.exists() && logFile.length() > MAX_FILE_SIZE_BYTES) {
                        // File exceeds 20MB, rotate/truncate safely
                        logFile.delete()
                    }

                    FileWriter(logFile, true).use { writer ->
                        writer.append(formattedLog).append("\n\n")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error writing to debug log file", e)
            }
        }
    }

    fun getLogFiles(): List<File> {
        val ctx = appContext ?: return emptyList()
        val dir = File(ctx.getExternalFilesDir(null), "debug_logs")
        if (!dir.exists()) return emptyList()
        return dir.listFiles()?.filter { it.isFile && it.name.startsWith("debug_") }?.sortedByDescending { it.lastModified() } ?: emptyList()
    }

    fun clearLogs() {
        logExecutor.execute {
            try {
                appContext?.let { ctx ->
                    val dir = File(ctx.getExternalFilesDir(null), "debug_logs")
                    if (dir.exists()) {
                        dir.listFiles()?.forEach { file -> file.delete() }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error clearing debug log files", e)
            }
        }
    }
}
