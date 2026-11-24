package cellular.tracker.reminders

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * SharedPreferences-backed [ReminderRepository]. Writes use commit(): alarms often run right before
 * the OS kills the process, and a lost "already shown" mark would mean a duplicate reminder.
 */
class ReminderStore(context: Context) : ReminderRepository {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    companion object {
        private const val PREFS = "AttendanceReminderPrefs"
        private const val KEY_CONFIG = "config"
        private const val KEY_ATT_DATE = "attDate"
        private const val KEY_ATT_IN = "attClockedIn"
        private const val KEY_ATT_OUT = "attClockedOut"
        private const val KEY_FIRED = "firedKeys"
        private const val KEY_STOPPED = "stoppedDays"
        private const val KEY_SNOOZE = "snooze"

        /**
         * Parses the JSON the JS side sends (see services/AttendanceReminderService.ts). Day-of-week
         * values arrive in JS Date.getDay() form (0 = Sunday) and are stored as Calendar values.
         */
        fun parseConfig(json: String): ReminderConfig {
            val o = JSONObject(json)
            fun ints(name: String) = o.optJSONArray(name)?.let { a -> (0 until a.length()).map { a.getInt(it) } } ?: emptyList()
            fun strings(name: String) = o.optJSONArray(name)?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
            return ReminderConfig(
                enabled = o.optBoolean("enabled", false),
                userId = o.optString("userId", ""),
                apiBaseUrl = o.optString("apiBaseUrl").takeIf { it.isNotBlank() },
                authToken = o.optString("authToken").takeIf { it.isNotBlank() },
                shiftStartMinutes = o.getInt("shiftStartMinutes"),
                punchInEndMinutes = o.getInt("punchInEndMinutes"),
                shiftEndMinutes = o.getInt("shiftEndMinutes"),
                graceMinutes = o.optInt("graceMinutes", 15),
                allowCrossDay = o.optBoolean("allowCrossDay", false),
                workDays = ints("workDays").filter { it in 0..6 }.map { it + 1 }.toSet(),
                skipDates = strings("skipDates").toSet(),
            )
        }

        private fun toJson(config: ReminderConfig): String = JSONObject().apply {
            put("enabled", config.enabled)
            put("userId", config.userId)
            put("apiBaseUrl", config.apiBaseUrl ?: "")
            put("authToken", config.authToken ?: "")
            put("shiftStartMinutes", config.shiftStartMinutes)
            put("punchInEndMinutes", config.punchInEndMinutes)
            put("shiftEndMinutes", config.shiftEndMinutes)
            put("graceMinutes", config.graceMinutes)
            put("allowCrossDay", config.allowCrossDay)
            put("workDays", JSONArray(config.workDays.map { it - 1 }))
            put("skipDates", JSONArray(config.skipDates.toList()))
        }.toString()
    }

    override fun config(): ReminderConfig? =
        prefs.getString(KEY_CONFIG, null)?.let { runCatching { parseConfig(it) }.getOrNull() }

    override fun saveConfig(config: ReminderConfig) {
        prefs.edit().putString(KEY_CONFIG, toJson(config)).commit()
    }

    override fun state(): ReminderState = ReminderState(
        attendance = prefs.getString(KEY_ATT_DATE, null)?.let {
            AttendanceSnapshot(it, prefs.getBoolean(KEY_ATT_IN, false), prefs.getBoolean(KEY_ATT_OUT, false))
        },
        firedKeys = prefs.getStringSet(KEY_FIRED, emptySet())!!.toSet(),
        stoppedDays = prefs.getStringSet(KEY_STOPPED, emptySet())!!.toSet(),
        snooze = prefs.getString(KEY_SNOOZE, null)?.let { decodeSnooze(it) },
    )

    override fun saveState(state: ReminderState) {
        prefs.edit().apply {
            val att = state.attendance
            if (att == null) {
                remove(KEY_ATT_DATE); remove(KEY_ATT_IN); remove(KEY_ATT_OUT)
            } else {
                putString(KEY_ATT_DATE, att.date); putBoolean(KEY_ATT_IN, att.clockedIn); putBoolean(KEY_ATT_OUT, att.clockedOut)
            }
            // getStringSet results must not be mutated in place; always store fresh copies.
            putStringSet(KEY_FIRED, HashSet(state.firedKeys))
            putStringSet(KEY_STOPPED, HashSet(state.stoppedDays))
            val snooze = state.snooze
            if (snooze == null) remove(KEY_SNOOZE) else putString(KEY_SNOOZE, "${snooze.kind}|${snooze.date}|${snooze.attempt}|${snooze.atMs}")
        }.commit()
    }

    private fun decodeSnooze(value: String): PlannedReminder? {
        val parts = value.split("|")
        if (parts.size != 4) return null
        val kind = runCatching { ReminderKind.valueOf(parts[0]) }.getOrNull() ?: return null
        return PlannedReminder(kind, parts[1], parts[2].toIntOrNull() ?: return null, parts[3].toLongOrNull() ?: return null)
    }
}
