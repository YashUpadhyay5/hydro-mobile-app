package cellular.tracker.reminders

interface ReminderRepository {
    fun config(): ReminderConfig?
    fun saveConfig(config: ReminderConfig)
    fun state(): ReminderState
    fun saveState(state: ReminderState)
}

/** Asks the backend about a shift date's attendance. Returns null when it can't tell (offline, error). */
fun interface AttendanceChecker {
    fun check(config: ReminderConfig, date: String): AttendanceSnapshot?
}

interface ReminderPresenter {
    fun show(reminder: PlannedReminder, config: ReminderConfig)
    fun dismissShown()
}

interface ReminderAlarmScheduler {
    fun schedule(atMs: Long)
    fun cancel()
}

/**
 * Decides, at alarm time, whether a reminder is still needed and shows it at most once.
 * Every entry point re-plans and re-arms the single pending alarm, so the schedule heals itself
 * after reboots, time changes, process death and missed alarms.
 */
class ReminderEngine(
    private val repository: ReminderRepository,
    private val checker: AttendanceChecker,
    private val presenter: ReminderPresenter,
    private val alarms: ReminderAlarmScheduler,
    private val planner: ReminderPlanner = ReminderPlanner(),
    private val clock: () -> Long = System::currentTimeMillis,
    /** True while the native location tracker runs, i.e. the user is clocked in right now. */
    private val trackerActive: () -> Boolean = { false },
) {
    companion object {
        private val LOCK = Any()
        private const val HISTORY_DAYS = 3
    }

    fun configure(config: ReminderConfig): PlannedReminder? = synchronized(LOCK) {
        repository.saveConfig(config)
        if (!config.enabled) {
            alarms.cancel()
            presenter.dismissShown()
            return null
        }
        repository.saveState(prune(repository.state()))
        reschedule()
    }

    fun reschedule(): PlannedReminder? = synchronized(LOCK) {
        val config = repository.config()
        val next = config?.let { planner.next(clock(), it, repository.state()) }
        if (next == null) alarms.cancel() else alarms.schedule(maxOf(next.atMs, clock() + 1_000L))
        next
    }

    /** Alarm (or catch-up worker) entry point. Returns the reminders actually shown. */
    fun onAlarm(): List<PlannedReminder> = synchronized(LOCK) {
        val config = repository.config()
        if (config == null || !config.enabled) {
            alarms.cancel()
            return emptyList()
        }
        val now = clock()
        var state = prune(repository.state())
        val shown = mutableListOf<PlannedReminder>()

        for (reminder in planner.due(now, config, state)) {
            val attendance = currentAttendance(config, state, reminder.date)
            if (attendance != null && attendance.date == reminder.date) {
                state = state.copy(attendance = attendance)
            }
            when (decide(reminder.kind, attendance, reminder.date)) {
                Decision.SHOW -> {
                    state = state.copy(
                        firedKeys = state.firedKeys + reminder.key + planner.overdueKeys(now, config, state, reminder.dayKey),
                        snooze = state.snooze?.takeUnless { it.key == reminder.key },
                    )
                    presenter.show(reminder, config)
                    shown += reminder
                }
                Decision.DONE -> {
                    state = state.copy(
                        firedKeys = state.firedKeys + reminder.key + planner.overdueKeys(now, config, state, reminder.dayKey),
                        stoppedDays = state.stoppedDays + reminder.dayKey,
                        snooze = state.snooze?.takeUnless { it.key == reminder.key },
                    )
                }
                Decision.SKIP -> {
                    // When skipping due to temporary lack of attendance evidence, only mark
                    // this single attempt handled so later scheduled retries can re-check.
                    state = state.copy(
                        firedKeys = state.firedKeys + reminder.key,
                        snooze = state.snooze?.takeUnless { it.key == reminder.key },
                    )
                }
            }
            repository.saveState(state)
        }
        reschedule()
        shown
    }

    /** The app reports attendance changes (clock-in/out, or state restored from the server). */
    fun onAttendanceChanged(snapshot: AttendanceSnapshot) = synchronized(LOCK) {
        var state = repository.state().copy(attendance = snapshot)
        if (snapshot.clockedIn) state = state.copy(stoppedDays = state.stoppedDays + PlannedReminder.dayKey(snapshot.date, ReminderKind.CLOCK_IN))
        if (snapshot.clockedOut) state = state.copy(stoppedDays = state.stoppedDays + PlannedReminder.dayKey(snapshot.date, ReminderKind.CLOCK_OUT))
        repository.saveState(state)
        if (snapshot.clockedIn || snapshot.clockedOut) presenter.dismissShown()
        reschedule()
    }

    /** Shows the reminder again in [ReminderPlanner.SNOOZE_MINUTES]; returns false once the day's snoozes are used up. */
    fun snooze(kind: ReminderKind, date: String): Boolean = synchronized(LOCK) {
        presenter.dismissShown()
        val state = repository.state()
        val used = planner.snoozeCount(state, date, kind)
        if (used >= ReminderPlanner.MAX_SNOOZES_PER_DAY) {
            reschedule()
            return false
        }
        val snooze = PlannedReminder(
            kind, date, PlannedReminder.SNOOZE_ATTEMPT_BASE + used,
            clock() + ReminderPlanner.SNOOZE_MINUTES * 60_000L,
        )
        // "Snooze 10 min" means quiet until then: scheduled retries that would ring sooner are dropped,
        // otherwise the user is nagged again before the snooze ends and then a second time when it does.
        val skippedRetries = repository.config()
            ?.let { planner.occurrences(it, kind, date) }
            .orEmpty()
            .filter { it.atMs <= snooze.atMs }
            .map { it.key }
        repository.saveState(state.copy(snooze = snooze, firedKeys = state.firedKeys + skippedRetries))
        reschedule()
        true
    }

    /** The user dismissed the reminder: no more reminders of this kind for that shift date. */
    fun dismiss(kind: ReminderKind, date: String) = synchronized(LOCK) {
        presenter.dismissShown()
        val state = repository.state()
        repository.saveState(state.copy(
            stoppedDays = state.stoppedDays + PlannedReminder.dayKey(date, kind),
            snooze = state.snooze?.takeUnless { it.date == date && it.kind == kind },
        ))
        reschedule()
    }

    private enum class Decision { SHOW, DONE, SKIP }

    private fun decide(kind: ReminderKind, attendance: AttendanceSnapshot?, date: String): Decision {
        val known = attendance?.takeIf { it.date == date }
        return when (kind) {
            // Unknown attendance (offline, no record yet) still reminds: forgetting is the case we exist for.
            ReminderKind.CLOCK_IN -> if (known?.clockedIn == true) Decision.DONE else Decision.SHOW
            ReminderKind.CLOCK_OUT -> when {
                known?.clockedOut == true -> Decision.DONE
                known?.clockedIn == true -> Decision.SHOW
                // Known never to have clocked in: nothing to clock out from today.
                known != null -> Decision.DONE
                // Unknown (offline, nothing local): never ask to clock out without evidence; the next retry re-checks.
                else -> Decision.SKIP
            }
        }
    }

    private fun currentAttendance(config: ReminderConfig, state: ReminderState, date: String): AttendanceSnapshot? {
        val local = state.attendance?.takeIf { it.date == date }
        val today = planner.dateString(clock())
        val trackerSaysIn = date == today && trackerActive()
        // A local clock-out is final; otherwise the server may know more (another device, an admin edit).
        if (local?.clockedOut == true) return local
        val remote = runCatching { checker.check(config, date) }.getOrNull()
        if (remote == null && local == null && !trackerSaysIn) return null
        // Merge rather than let one side win: an offline clock-in sits in the app's upload queue, so the
        // server can lag behind the device, and the device can miss what happened on another one.
        return AttendanceSnapshot(
            date,
            clockedIn = remote?.clockedIn == true || local?.clockedIn == true || trackerSaysIn,
            clockedOut = remote?.clockedOut == true,
        )
    }

    /** Drops history older than a few days so stored state stays small. */
    private fun prune(state: ReminderState): ReminderState {
        val cutoff = planner.dateString(clock() - HISTORY_DAYS * 24L * 60 * 60 * 1000)
        fun keep(key: String) = key.substringBefore('|') >= cutoff
        return state.copy(
            firedKeys = state.firedKeys.filter(::keep).toSet(),
            stoppedDays = state.stoppedDays.filter(::keep).toSet(),
            attendance = state.attendance?.takeIf { it.date >= cutoff },
        )
    }
}
