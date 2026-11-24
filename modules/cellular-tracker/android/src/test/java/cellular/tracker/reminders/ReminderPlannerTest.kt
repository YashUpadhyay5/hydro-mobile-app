package cellular.tracker.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

class ReminderPlannerTest {

    private val planner = ReminderPlanner(IST)

    @Test
    fun calendarFixturesAreCorrect() {
        fun dayOfWeek(date: String) = Calendar.getInstance(IST).apply { timeInMillis = at(date, "12:00") }.get(Calendar.DAY_OF_WEEK)
        assertEquals(Calendar.SATURDAY, dayOfWeek(SATURDAY))
        assertEquals(Calendar.SUNDAY, dayOfWeek(SUNDAY))
        assertEquals(Calendar.MONDAY, dayOfWeek(MONDAY))
        assertEquals(Calendar.TUESDAY, dayOfWeek(TUESDAY))
    }

    @Test
    fun clockInRemindersStartAfterGraceAndRetryWithinPunchInWindow() {
        val times = planner.occurrences(shiftConfig(), ReminderKind.CLOCK_IN, MONDAY).map { it.atMs }
        assertEquals(listOf(at(MONDAY, "08:45"), at(MONDAY, "08:55"), at(MONDAY, "09:05")), times)
    }

    @Test
    fun clockInRetriesStopAtTheEndOfThePunchInWindow() {
        val times = planner.occurrences(shiftConfig(punchInEnd = 8 * 60 + 50), ReminderKind.CLOCK_IN, MONDAY).map { it.atMs }
        assertEquals(listOf(at(MONDAY, "08:45")), times)
    }

    @Test
    fun clockOutRemindersStartAfterShiftEndPlusGrace() {
        val times = planner.occurrences(shiftConfig(), ReminderKind.CLOCK_OUT, MONDAY).map { it.atMs }
        assertEquals(listOf(at(MONDAY, "18:15"), at(MONDAY, "18:30"), at(MONDAY, "18:45")), times)
    }

    @Test
    fun crossDayShiftRemindsToClockOutTheNextMorning() {
        val config = shiftConfig(shiftStart = 22 * 60, punchInEnd = 23 * 60, shiftEnd = 6 * 60, allowCrossDay = true)
        val first = planner.occurrences(config, ReminderKind.CLOCK_OUT, MONDAY).first()
        assertEquals(MONDAY, first.date)
        assertEquals(at(TUESDAY, "06:15"), first.atMs)
    }

    @Test
    fun nextIsTheFirstClockInReminderOfTheDay() {
        val next = planner.next(at(MONDAY, "08:00"), shiftConfig(), ReminderState())!!
        assertEquals(ReminderKind.CLOCK_IN, next.kind)
        assertEquals(at(MONDAY, "08:45"), next.atMs)
    }

    @Test
    fun sundayIsSkipped() {
        val next = planner.next(at(SATURDAY, "20:00"), shiftConfig(), ReminderState())!!
        assertEquals(MONDAY, next.date)
        assertEquals(at(MONDAY, "08:45"), next.atMs)
    }

    @Test
    fun holidaysAndApprovedLeaveAreSkipped() {
        val next = planner.next(at(SATURDAY, "20:00"), shiftConfig(skipDates = setOf(MONDAY)), ReminderState())!!
        assertEquals(TUESDAY, next.date)
    }

    @Test
    fun clockedInSuppressesClockInRemindersButNotClockOut() {
        val state = ReminderState(attendance = AttendanceSnapshot(MONDAY, clockedIn = true, clockedOut = false))
        val next = planner.next(at(MONDAY, "08:00"), shiftConfig(), state)!!
        assertEquals(ReminderKind.CLOCK_OUT, next.kind)
        assertEquals(at(MONDAY, "18:15"), next.atMs)
    }

    @Test
    fun overdueRetriesCollapseIntoOneReminder() {
        // 09:06: the 08:55 and 09:05 retries are both inside the catch-up window.
        val due = planner.due(at(MONDAY, "09:06"), shiftConfig(), ReminderState())
        assertEquals(1, due.size)
        assertEquals(2, due.single().attempt)
    }

    @Test
    fun remindersOlderThanTheCatchUpWindowAreNotShown() {
        assertTrue(planner.due(at(MONDAY, "12:00"), shiftConfig(), ReminderState()).isEmpty())
    }

    @Test
    fun handledOccurrencesAreNotPlannedAgain() {
        val state = ReminderState(firedKeys = setOf("$MONDAY|CLOCK_IN|0"))
        assertEquals(at(MONDAY, "08:55"), planner.next(at(MONDAY, "08:40"), shiftConfig(), state)!!.atMs)
    }

    @Test
    fun disabledConfigPlansNothing() {
        assertNull(planner.next(at(MONDAY, "08:00"), shiftConfig(enabled = false), ReminderState()))
    }
}
