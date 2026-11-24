package cellular.tracker.reminders

import android.content.Context
import android.util.Log
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Best-effort check against the existing GET /api/attendance?userId=&date= endpoint, so a reminder is
 * not shown to someone who clocked in elsewhere (another device, web, an admin entry). Short timeouts:
 * this runs inside an alarm broadcast, and on any failure the engine falls back to local state.
 */
class HttpAttendanceChecker(context: Context) : AttendanceChecker {
    private val appContext = context.applicationContext

    companion object {
        private const val TAG = "HttpAttendanceChecker"
        private const val TIMEOUT_MS = 4_000
    }

    override fun check(config: ReminderConfig, date: String): AttendanceSnapshot? {
        val base = config.apiBaseUrl?.trimEnd('/') ?: return null
        if (config.userId.isBlank()) return null
        // The tracker keeps the freshest token (updated on every clock-in); fall back to the configured one.
        val token = appContext.getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
            .getString("userToken", null) ?: config.authToken
        var conn: HttpURLConnection? = null
        return try {
            val url = URL("$base/attendance?userId=${URLEncoder.encode(config.userId, "UTF-8")}&date=${URLEncoder.encode(date, "UTF-8")}")
            conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                setRequestProperty("Accept", "application/json")
                if (!token.isNullOrBlank()) setRequestProperty("Authorization", "Bearer $token")
            }
            if (conn.responseCode !in 200..299) return null
            val records = JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
            parse(records, date)
        } catch (e: Exception) {
            Log.w(TAG, "Attendance check failed for $date: ${e.javaClass.simpleName} ${e.message}")
            null
        } finally {
            conn?.disconnect()
        }
    }

    /** Records come newest first; the newest one for the date decides whether the user is still clocked in. */
    private fun parse(records: JSONArray, date: String): AttendanceSnapshot {
        for (i in 0 until records.length()) {
            val record = records.optJSONObject(i) ?: continue
            val recDate = record.optString("date", "")
            if (!isMatchingDate(recDate, date)) continue
            val checkOut = if (record.isNull("checkOut")) "" else record.optString("checkOut")
            return AttendanceSnapshot(date, clockedIn = true, clockedOut = checkOut.isNotBlank())
        }
        return AttendanceSnapshot(date, clockedIn = false, clockedOut = false)
    }

    private fun isMatchingDate(recDate: String, targetDate: String): Boolean {
        if (recDate.isBlank() || targetDate.isBlank()) return false
        if (recDate == targetDate) return true
        val rParts = recDate.split("-")
        val tParts = targetDate.split("-")
        if (rParts.size == 3 && tParts.size == 3) {
            // Match YYYY-MM-DD vs DD-MM-YYYY
            if (rParts[0] == tParts[2] && rParts[1] == tParts[1] && rParts[2] == tParts[0]) return true
            val rY = rParts[0].toIntOrNull() ?: 0
            val rM = rParts[1].toIntOrNull() ?: 0
            val rD = rParts[2].toIntOrNull() ?: 0
            val tY = tParts[0].toIntOrNull() ?: 0
            val tM = tParts[1].toIntOrNull() ?: 0
            val tD = tParts[2].toIntOrNull() ?: 0
            if (rY == tY && rM == tM && rD == tD) return true
            if (rY == tD && rM == tM && rD == tY) return true
        }
        return false
    }
}
