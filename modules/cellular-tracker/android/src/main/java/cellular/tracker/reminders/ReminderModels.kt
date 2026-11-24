package cellular.tracker.reminders

enum class ReminderKind { CLOCK_IN, CLOCK_OUT }

/**
 * Shift schedule the reminders are planned from. Mirrors the backend's global SystemSettings
 * (punch_in_start, punch_in_end, punch_out_time, grace_minutes, allow_cross_day); times are
 * minutes after local midnight.
 */
data class ReminderConfig(
    val enabled: Boolean,
    /** Attendance records are keyed by employee code on the backend. */
    val userId: String,
    val apiBaseUrl: String?,
    val authToken: String?,
    val shiftStartMinutes: Int,
    val punchInEndMinutes: Int,
    val shiftEndMinutes: Int,
    val graceMinutes: Int,
    val allowCrossDay: Boolean,
    /** java.util.Calendar day-of-week values (SUNDAY = 1 .. SATURDAY = 7). */
    val workDays: Set<Int>,
    /** yyyy-MM-dd shift dates with no reminders: holidays and approved leave. */
    val skipDates: Set<String>,
    val clockInRetryMinutes: Int = 10,
    val clockOutRetryMinutes: Int = 15,
    val maxAttempts: Int = 3,
)

/** What is known about one shift date's attendance. */
data class AttendanceSnapshot(val date: String, val clockedIn: Boolean, val clockedOut: Boolean)

/** One reminder occurrence. [date] is the shift date it belongs to (a cross-day clock-out fires the next day). */
data class PlannedReminder(val kind: ReminderKind, val date: String, val attempt: Int, val atMs: Long) {
    val key: String get() = "$date|$kind|$attempt"
    val dayKey: String get() = dayKey(date, kind)
    val isSnooze: Boolean get() = attempt >= SNOOZE_ATTEMPT_BASE

    companion object {
        /** Snoozed occurrences use attempt numbers from here up, so they never collide with scheduled ones. */
        const val SNOOZE_ATTEMPT_BASE = 100
        fun dayKey(date: String, kind: ReminderKind) = "$date|$kind"
    }
}

data class ReminderState(
    val attendance: AttendanceSnapshot? = null,
    /** Keys of occurrences already handled (shown or skipped), so none is ever shown twice. */
    val firedKeys: Set<String> = emptySet(),
    /** Day keys with no more reminders: dismissed by the user, or the attendance step was done. */
    val stoppedDays: Set<String> = emptySet(),
    val snooze: PlannedReminder? = null,
)
