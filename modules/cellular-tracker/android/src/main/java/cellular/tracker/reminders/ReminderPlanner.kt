package cellular.tracker.reminders

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * Pure planning logic: which reminder occurrences exist for a shift date, which one is next, and
 * which are due now. No Android dependencies, so it is unit-tested on the JVM.
 */
class ReminderPlanner(private val timeZone: TimeZone = TimeZone.getDefault()) {

    companion object {
        /** A missed occurrence (device asleep, alarm delayed, inexact fallback) still fires if this recent. */
        const val CATCH_UP_WINDOW_MS = 60 * 60_000L
        /** Alarms can be delivered slightly early; occurrences this close count as due. */
        const val EARLY_DELIVERY_TOLERANCE_MS = 60_000L
        const val MAX_SNOOZES_PER_DAY = 2
        const val SNOOZE_MINUTES = 10
        private const val LOOKAHEAD_DAYS = 8
    }

    fun dateString(ms: Long): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = this@ReminderPlanner.timeZone }.format(ms)

    /** Every scheduled occurrence for [kind] on shift date [date], before eligibility filtering. */
    fun occurrences(config: ReminderConfig, kind: ReminderKind, date: String): List<PlannedReminder> {
        val result = mutableListOf<PlannedReminder>()
        when (kind) {
            ReminderKind.CLOCK_IN -> {
                val firstMinute = config.shiftStartMinutes + config.graceMinutes
                for (attempt in 0 until config.maxAttempts) {
                    val minute = firstMinute + attempt * config.clockInRetryMinutes
                    // Retries stop at the end of the punch-in window; the first reminder always fires.
                    if (attempt > 0 && config.punchInEndMinutes >= firstMinute && minute > config.punchInEndMinutes) break
                    result += PlannedReminder(kind, date, attempt, at(date, minute))
                }
            }
            ReminderKind.CLOCK_OUT -> {
                val crossesMidnight = config.allowCrossDay && config.shiftEndMinutes <= config.shiftStartMinutes
                val firstMinute = config.shiftEndMinutes + config.graceMinutes + if (crossesMidnight) 24 * 60 else 0
                for (attempt in 0 until config.maxAttempts) {
                    result += PlannedReminder(kind, date, attempt, at(date, firstMinute + attempt * config.clockOutRetryMinutes))
                }
            }
        }
        return result
    }

    /** The earliest occurrence that still needs an alarm (possibly already overdue, within the catch-up window). */
    fun next(nowMs: Long, config: ReminderConfig, state: ReminderState): PlannedReminder? =
        candidates(nowMs, config, state).filter { it.atMs >= nowMs - CATCH_UP_WINDOW_MS }.minByOrNull { it.atMs }

    /**
     * Occurrences due now, collapsed to the latest one per shift date and kind, so a device that slept
     * through several retries shows a single reminder rather than a burst.
     */
    fun due(nowMs: Long, config: ReminderConfig, state: ReminderState): List<PlannedReminder> =
        candidates(nowMs, config, state)
            .filter { it.atMs in (nowMs - CATCH_UP_WINDOW_MS)..(nowMs + EARLY_DELIVERY_TOLERANCE_MS) }
            .groupBy { it.dayKey }
            .map { (_, group) -> group.maxByOrNull { it.atMs }!! }
            .sortedBy { it.atMs }

    /** Occurrences for [dayKey] that are due or overdue, to be marked handled together with [due]. */
    fun overdueKeys(nowMs: Long, config: ReminderConfig, state: ReminderState, dayKey: String): Set<String> =
        candidates(nowMs, config, state)
            .filter { it.dayKey == dayKey && it.atMs <= nowMs + EARLY_DELIVERY_TOLERANCE_MS }
            .map { it.key }
            .toSet()

    fun snoozeCount(state: ReminderState, date: String, kind: ReminderKind): Int {
        val fired = state.firedKeys.count { key ->
            val parts = key.split("|")
            parts.size == 3 && parts[0] == date && parts[1] == kind.name &&
                (parts[2].toIntOrNull() ?: 0) >= PlannedReminder.SNOOZE_ATTEMPT_BASE
        }
        val pending = state.snooze
        return fired + if (pending != null && pending.key !in state.firedKeys && pending.date == date && pending.kind == kind) 1 else 0
    }

    fun isShiftDay(config: ReminderConfig, date: String): Boolean {
        if (date in config.skipDates) return false
        val cal = calendarFor(date) ?: return false
        return cal.get(Calendar.DAY_OF_WEEK) in config.workDays
    }

    private fun candidates(nowMs: Long, config: ReminderConfig, state: ReminderState): List<PlannedReminder> {
        if (!config.enabled) return emptyList()
        val result = mutableListOf<PlannedReminder>()
        // Start a day back: yesterday's cross-day clock-out reminder can still be pending today.
        for (offset in -1..LOOKAHEAD_DAYS) {
            val date = dateString(nowMs + offset * 24L * 60 * 60 * 1000)
            if (!isShiftDay(config, date)) continue
            for (kind in ReminderKind.values()) {
                if (isSuppressed(state, date, kind)) continue
                result += occurrences(config, kind, date).filter { it.key !in state.firedKeys }
            }
        }
        state.snooze?.let { snooze ->
            if (snooze.key !in state.firedKeys && !isSuppressed(state, snooze.date, snooze.kind)) result += snooze
        }
        return result
    }

    private fun isSuppressed(state: ReminderState, date: String, kind: ReminderKind): Boolean {
        if (PlannedReminder.dayKey(date, kind) in state.stoppedDays) return true
        val attendance = state.attendance?.takeIf { it.date == date } ?: return false
        return when (kind) {
            ReminderKind.CLOCK_IN -> attendance.clockedIn
            ReminderKind.CLOCK_OUT -> attendance.clockedOut
        }
    }

    private fun at(date: String, minuteOfDay: Int): Long {
        val cal = calendarFor(date) ?: return Long.MAX_VALUE
        cal.add(Calendar.MINUTE, minuteOfDay)
        return cal.timeInMillis
    }

    private fun calendarFor(date: String): Calendar? {
        val parts = date.split("-").mapNotNull { it.toIntOrNull() }
        if (parts.size != 3) return null
        return Calendar.getInstance(timeZone).apply {
            clear()
            set(parts[0], parts[1] - 1, parts[2], 0, 0, 0)
        }
    }
}
