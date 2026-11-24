package cellular.tracker.reminders

import java.util.Calendar
import java.util.TimeZone

val IST: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")

/** Epoch ms for a local date and "HH:mm" time in [IST]. */
fun at(date: String, time: String): Long {
    val (y, mo, d) = date.split("-").map { it.toInt() }
    val (h, mi) = time.split(":").map { it.toInt() }
    return Calendar.getInstance(IST).apply { clear(); set(y, mo - 1, d, h, mi, 0) }.timeInMillis
}

// Known calendar facts the tests rely on (checked in ReminderPlannerTest.calendarFixturesAreCorrect).
const val SATURDAY = "2026-10-17"
const val SUNDAY = "2026-10-18"
const val MONDAY = "2026-10-19"
const val TUESDAY = "2026-10-20"

/** The backend's default shift: 08:30 start, punch-in until 10:00, 18:00 end, 15 min grace, Mon-Sat. */
fun shiftConfig(
    enabled: Boolean = true,
    skipDates: Set<String> = emptySet(),
    shiftStart: Int = 8 * 60 + 30,
    punchInEnd: Int = 10 * 60,
    shiftEnd: Int = 18 * 60,
    allowCrossDay: Boolean = false,
) = ReminderConfig(
    enabled = enabled,
    userId = "EMP001",
    apiBaseUrl = "http://example.invalid/api",
    authToken = null,
    shiftStartMinutes = shiftStart,
    punchInEndMinutes = punchInEnd,
    shiftEndMinutes = shiftEnd,
    graceMinutes = 15,
    allowCrossDay = allowCrossDay,
    workDays = setOf(Calendar.MONDAY, Calendar.TUESDAY, Calendar.WEDNESDAY, Calendar.THURSDAY, Calendar.FRIDAY, Calendar.SATURDAY),
    skipDates = skipDates,
)

class InMemoryRepository(private var config: ReminderConfig?) : ReminderRepository {
    var state = ReminderState()
    override fun config() = config
    override fun saveConfig(config: ReminderConfig) { this.config = config }
    override fun state() = state
    override fun saveState(state: ReminderState) { this.state = state }
}

class FakePresenter : ReminderPresenter {
    val shown = mutableListOf<PlannedReminder>()
    var dismissCount = 0
    override fun show(reminder: PlannedReminder, config: ReminderConfig) { shown += reminder }
    override fun dismissShown() { dismissCount++ }
}

class FakeAlarms : ReminderAlarmScheduler {
    var scheduledAt: Long? = null
    var cancelled = false
    override fun schedule(atMs: Long) { scheduledAt = atMs; cancelled = false }
    override fun cancel() { scheduledAt = null; cancelled = true }
}

/** A controllable world for [ReminderEngine]: fake time, backend answer, presenter and alarm. */
class EngineHarness(config: ReminderConfig? = shiftConfig(), var now: Long = at(MONDAY, "07:00")) {
    val repository = InMemoryRepository(config)
    val presenter = FakePresenter()
    val alarms = FakeAlarms()
    /** What the backend reports; null means unreachable (offline). */
    var remote: AttendanceSnapshot? = null
    var remoteThrows = false
    var trackerActive = false

    fun engine() = ReminderEngine(
        repository = repository,
        checker = { _, _ -> if (remoteThrows) throw IllegalStateException("network down") else remote },
        presenter = presenter,
        alarms = alarms,
        planner = ReminderPlanner(IST),
        clock = { now },
        trackerActive = { trackerActive },
    )
}
