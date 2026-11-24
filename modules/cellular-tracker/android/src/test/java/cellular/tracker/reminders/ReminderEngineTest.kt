package cellular.tracker.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderEngineTest {

    @Test
    fun forgottenClockInRingsOnceAndArmsTheRetry() {
        val h = EngineHarness(now = at(MONDAY, "08:45"))
        h.remote = AttendanceSnapshot(MONDAY, clockedIn = false, clockedOut = false)

        assertEquals(1, h.engine().onAlarm().size)
        assertEquals(ReminderKind.CLOCK_IN, h.presenter.shown.single().kind)
        assertEquals(at(MONDAY, "08:55"), h.alarms.scheduledAt)
    }

    @Test
    fun duplicateAlarmDeliveryDoesNotRingTwice() {
        val h = EngineHarness(now = at(MONDAY, "08:45"))
        h.engine().onAlarm()
        h.engine().onAlarm()
        assertEquals(1, h.presenter.shown.size)
    }

    @Test
    fun retriesAreLimitedThenTheNextDayIsScheduled() {
        val h = EngineHarness()
        h.remote = AttendanceSnapshot(MONDAY, clockedIn = false, clockedOut = false)
        for (time in listOf("08:45", "08:55", "09:05", "09:15", "09:25")) {
            h.now = at(MONDAY, time)
            h.engine().onAlarm()
        }
        assertEquals(3, h.presenter.shown.count { it.kind == ReminderKind.CLOCK_IN })
        // No clock-in, so no clock-out reminder that day: the next alarm is Tuesday's clock-in.
        h.now = at(MONDAY, "18:15")
        h.engine().onAlarm()
        assertEquals(0, h.presenter.shown.count { it.kind == ReminderKind.CLOCK_OUT })
        assertEquals(at(TUESDAY, "08:45"), h.alarms.scheduledAt)
    }

    @Test
    fun serverReportingClockInStopsTheDaysClockInReminders() {
        val h = EngineHarness(now = at(MONDAY, "08:45"))
        h.remote = AttendanceSnapshot(MONDAY, clockedIn = true, clockedOut = false)

        assertTrue(h.engine().onAlarm().isEmpty())
        assertTrue("$MONDAY|CLOCK_IN" in h.repository.state.stoppedDays)
        assertEquals(at(MONDAY, "18:15"), h.alarms.scheduledAt)
    }

    @Test
    fun offlineClockInIsTrustedWhenTheServerHasNotSeenItYet() {
        val h = EngineHarness(now = at(MONDAY, "08:45"))
        h.repository.state = ReminderState(attendance = AttendanceSnapshot(MONDAY, clockedIn = true, clockedOut = false))
        h.remote = AttendanceSnapshot(MONDAY, clockedIn = false, clockedOut = false)
        h.engine().reschedule()

        assertTrue(h.engine().onAlarm().isEmpty())
        assertTrue(h.presenter.shown.isEmpty())
    }

    @Test
    fun unreachableServerStillRemindsAForgottenClockIn() {
        val h = EngineHarness(now = at(MONDAY, "08:45"))
        h.remoteThrows = true
        assertEquals(1, h.engine().onAlarm().size)
    }

    @Test
    fun runningTrackerCountsAsClockedIn() {
        val h = EngineHarness(now = at(MONDAY, "08:45"))
        h.trackerActive = true
        assertTrue(h.engine().onAlarm().isEmpty())
    }

    @Test
    fun clockOutReminderRingsOnlyWhenStillClockedIn() {
        val h = EngineHarness(now = at(MONDAY, "18:15"))
        h.repository.state = ReminderState(
            attendance = AttendanceSnapshot(MONDAY, clockedIn = true, clockedOut = false),
            stoppedDays = setOf("$MONDAY|CLOCK_IN"),
        )
        h.remote = AttendanceSnapshot(MONDAY, clockedIn = true, clockedOut = false)
        assertEquals(ReminderKind.CLOCK_OUT, h.engine().onAlarm().single().kind)
    }

    @Test
    fun noClockOutReminderWithoutEvidenceOfClockIn() {
        val h = EngineHarness(now = at(MONDAY, "18:15"))
        h.repository.state = ReminderState(stoppedDays = setOf("$MONDAY|CLOCK_IN"))
        h.remoteThrows = true
        assertTrue(h.engine().onAlarm().isEmpty())
    }

    @Test
    fun clockingInCancelsPendingClockInRemindersAndTheVisibleOne() {
        val h = EngineHarness(now = at(MONDAY, "08:46"))
        h.engine().onAttendanceChanged(AttendanceSnapshot(MONDAY, clockedIn = true, clockedOut = false))

        assertEquals(1, h.presenter.dismissCount)
        assertEquals(at(MONDAY, "18:15"), h.alarms.scheduledAt)
    }

    @Test
    fun clockingOutCancelsTheDaysClockOutReminders() {
        val h = EngineHarness(now = at(MONDAY, "18:05"))
        h.engine().onAttendanceChanged(AttendanceSnapshot(MONDAY, clockedIn = true, clockedOut = true))
        assertEquals(at(TUESDAY, "08:45"), h.alarms.scheduledAt)
    }

    @Test
    fun dismissStopsTheRestOfTheDaysRetries() {
        val h = EngineHarness(now = at(MONDAY, "08:45"))
        h.engine().onAlarm()
        h.engine().dismiss(ReminderKind.CLOCK_IN, MONDAY)
        h.now = at(MONDAY, "08:55")
        assertTrue(h.engine().onAlarm().isEmpty())
    }

    @Test
    fun snoozeRingsAgainAfterTenMinutesAndIsLimited() {
        // One scheduled attempt only, so every later ring comes from a snooze.
        val h = EngineHarness(config = shiftConfig().copy(maxAttempts = 1), now = at(MONDAY, "08:45"))
        h.engine().onAlarm()

        assertTrue(h.engine().snooze(ReminderKind.CLOCK_IN, MONDAY))
        assertEquals(at(MONDAY, "08:55"), h.alarms.scheduledAt)
        h.now = at(MONDAY, "08:55")
        assertTrue(h.engine().onAlarm().single().isSnooze)

        assertTrue(h.engine().snooze(ReminderKind.CLOCK_IN, MONDAY))
        h.now = at(MONDAY, "09:05")
        assertTrue(h.engine().onAlarm().single().isSnooze)

        assertFalse("a third snooze is refused", h.engine().snooze(ReminderKind.CLOCK_IN, MONDAY))
        assertEquals(3, h.presenter.shown.size)
    }

    @Test
    fun snoozeSilencesRetriesThatWouldRingBeforeItEnds() {
        // Default retries: 08:45, 08:55, 09:05. Rings at 08:45, snoozed at 08:46 -> snooze ends 08:56.
        val h = EngineHarness(now = at(MONDAY, "08:45"))
        h.engine().onAlarm()
        h.now = at(MONDAY, "08:46")
        assertTrue(h.engine().snooze(ReminderKind.CLOCK_IN, MONDAY))

        // The 08:55 retry is dropped: the next alarm is the snooze itself, not 08:55.
        assertEquals(at(MONDAY, "08:56"), h.alarms.scheduledAt)
        // 08:54:59: the 08:55 retry would be due here if it still existed (due() accepts occurrences up to a
        // minute ahead, for early alarm delivery), while the snooze at 08:56:00 is still 61 s away.
        h.now = at(MONDAY, "08:54") + 59_000L
        assertTrue(h.engine().onAlarm().isEmpty())

        h.now = at(MONDAY, "08:56")
        assertTrue(h.engine().onAlarm().single().isSnooze)
        // The 09:05 retry, after the snooze, still happens.
        assertEquals(at(MONDAY, "09:05"), h.alarms.scheduledAt)
        assertEquals(2, h.presenter.shown.size)
    }

    @Test
    fun afterRebootTheSameStoredStateNeitherRepeatsNorLosesReminders() {
        val h = EngineHarness(now = at(MONDAY, "08:45"))
        h.engine().onAlarm()
        // Reboot: a brand-new engine over the persisted state, woken by BOOT_COMPLETED a minute later.
        h.alarms.scheduledAt = null
        h.now = at(MONDAY, "08:46")
        assertTrue(ReminderEngine(h.repository, { _, _ -> null }, h.presenter, h.alarms, ReminderPlanner(IST), { h.now }).onAlarm().isEmpty())
        assertEquals(1, h.presenter.shown.size)
        assertEquals(at(MONDAY, "08:55"), h.alarms.scheduledAt)
    }

    @Test
    fun disablingCancelsTheAlarmAndShowsNothing() {
        val h = EngineHarness(now = at(MONDAY, "08:45"))
        h.engine().configure(shiftConfig(enabled = false))
        assertTrue(h.alarms.cancelled)
        assertNull(h.alarms.scheduledAt)
        assertTrue(h.engine().onAlarm().isEmpty())
    }
}
