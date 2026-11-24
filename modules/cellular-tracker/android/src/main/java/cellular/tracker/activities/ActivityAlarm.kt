package cellular.tracker.activities

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.util.Log
import cellular.tracker.reminders.AndroidReminderAlarmScheduler
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The "time is up" alarm for a Day Activity. It is armed from the activity's deadline, so it rings even when
 * the app is closed and with no connection; the server's push is the backup. It is the same kind of alarm as
 * the attendance reminder: an AlarmManager alarm-clock alarm and a high-importance ringing notification on its
 * own channel, which keeps ringing until it is opened or silenced. It repeats every [REPEAT_MS] up to [MAX_RINGS]
 * times, like the server's push, and stops when the app cancels it (extend, finish, cancel, clock-out).
 * Only one activity runs at a time, so there is only one alarm.
 */
class ActivityAlarm(context: Context) {
    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val manager = appContext.getSystemService(NotificationManager::class.java)

    companion object {
        private const val TAG = "ActivityAlarm"
        private const val PREFS = "hrms_activity_alarm"
        /** The id the server should use as `channelId` in the time-is-up push so a killed app rings too. */
        const val CHANNEL_ID = "activity_alarm"
        const val NOTIFICATION_ID = 8840
        const val ACTION_FIRE = "cellular.tracker.activities.FIRE"
        const val ACTION_SILENCE = "cellular.tracker.activities.SILENCE"
        const val REQUEST_FIRE = 7311
        const val MAX_RINGS = 12
        const val REPEAT_MS = 5 * 60_000L
        private const val LATE_RING_DELAY_MS = 5_000L
        private val VIBRATION_PATTERN = longArrayOf(0, 1000, 800, 1000, 800, 1000)
    }

    private data class Record(val id: String, val title: String, val deadlineAt: Long, val rings: Int, val nextRingAt: Long)

    private fun read(): Record? {
        val id = prefs.getString("id", null) ?: return null
        return Record(
            id, prefs.getString("title", "") ?: "", prefs.getLong("deadlineAt", 0L),
            prefs.getInt("rings", 0), prefs.getLong("nextRingAt", 0L),
        )
    }

    private fun write(r: Record) {
        prefs.edit().putString("id", r.id).putString("title", r.title).putLong("deadlineAt", r.deadlineAt)
            .putInt("rings", r.rings).putLong("nextRingAt", r.nextRingAt).commit()
    }

    private fun clearRecord() {
        prefs.edit().remove("id").remove("title").remove("deadlineAt").remove("rings").remove("nextRingAt").commit()
    }

    fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(CHANNEL_ID, "Day activity alarms", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Rings when the time you planned for an activity is up"
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            enableVibration(true)
            vibrationPattern = VIBRATION_PATTERN
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            runCatching { setBypassDnd(true) }
        }
        manager.createNotificationChannel(channel)
    }

    /** True while clock-out (or the day) has turned the alarm off. The app lifts this when the employee clocks in again. */
    private fun suppressedToday(): Boolean = prefs.getString("suppressedDate", null) == today()

    private fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    /**
     * Arms the alarm for [deadlineAt]. Calling it again with the same activity and deadline changes nothing, so the app can
     * call it on every refresh. A new deadline (extension) starts the count again. A deadline already passed (the app is
     * opened late) rings again in [REPEAT_MS] rather than the moment the app opens.
     */
    fun schedule(id: String, title: String, deadlineAt: Long): Boolean {
        val now = System.currentTimeMillis()
        val existing = read()
        if (suppressedToday()) {
            cancel()
            return false
        }
        if (existing != null && existing.id == id && existing.deadlineAt == deadlineAt) {
            // Same activity and deadline: keep the pending ring. Only put it back if it was lost (phone off when it was due).
            if (existing.rings < MAX_RINGS) arm(if (existing.nextRingAt > now) existing.nextRingAt else now + LATE_RING_DELAY_MS)
            return true
        }
        val first = if (deadlineAt > now) deadlineAt else now + REPEAT_MS
        write(Record(id, title, deadlineAt, 0, first))
        silence()
        arm(first)
        return true
    }

    /** Stops everything: the pending alarm, the sound, the record. */
    fun cancel() {
        runCatching {
            (appContext.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager).cancel(firePendingIntent())
        }
        clearRecord()
        silence()
    }

    /** Stops the ringing for now; the next repeat stays scheduled. */
    fun silence() {
        manager.cancel(NOTIFICATION_ID)
    }

    /** Called by the alarm. Rings, then arms the next repeat. */
    fun onFire() {
        val record = read() ?: return
        if (suppressedToday()) {
            cancel()
            return
        }
        ring(record)
        val rings = record.rings + 1
        if (rings >= MAX_RINGS) {
            write(record.copy(rings = rings, nextRingAt = Long.MAX_VALUE))
        } else {
            val next = System.currentTimeMillis() + REPEAT_MS
            write(record.copy(rings = rings, nextRingAt = next))
            arm(next)
        }
    }

    /** After reboot, app update or a clock change: puts the alarm back, ringing soon if its time came while it was off. */
    fun rearm() {
        val record = read() ?: return
        if (record.rings >= MAX_RINGS || suppressedToday()) return
        val now = System.currentTimeMillis()
        arm(if (record.nextRingAt > now) record.nextRingAt else now + LATE_RING_DELAY_MS)
    }

    /** The employee clocked out (stop and stay quiet for the rest of the day) or clocked in again. */
    fun onAttendanceChanged(date: String, clockedIn: Boolean, clockedOut: Boolean) {
        if (clockedOut) {
            prefs.edit().putString("suppressedDate", date).commit()
            cancel()
        } else if (clockedIn && prefs.getString("suppressedDate", null) == date) {
            prefs.edit().remove("suppressedDate").commit()
        }
    }

    private fun arm(atMs: Long) {
        val exact = AndroidReminderAlarmScheduler.setAlarm(appContext, atMs, firePendingIntent())
        Log.d(TAG, "Activity alarm armed for $atMs (exact=$exact)")
    }

    private fun firePendingIntent(): PendingIntent =
        PendingIntent.getBroadcast(
            appContext, REQUEST_FIRE,
            Intent(appContext, ActivityAlarmReceiver::class.java).setAction(ACTION_FIRE),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    /** Opens the app on the Extra time screen (deep link handled by expo-router, also from a cold start). */
    private fun openIntent(id: String): PendingIntent =
        PendingIntent.getActivity(
            appContext, 1,
            Intent(Intent.ACTION_VIEW, Uri.parse("mobileapp://activity-extend?id=${Uri.encode(id)}"))
                .setPackage(appContext.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun silenceIntent(): PendingIntent =
        PendingIntent.getBroadcast(
            appContext, 2,
            Intent(appContext, ActivityAlarmReceiver::class.java).setAction(ACTION_SILENCE),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun ring(record: Record) {
        try {
            ensureChannel()
            val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(appContext, CHANNEL_ID)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(appContext)
                    .setPriority(Notification.PRIORITY_MAX)
                    .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
                    .setVibrate(VIBRATION_PATTERN)
            }
            val endedAt = SimpleDateFormat("hh:mm a", Locale.US).apply { timeZone = TimeZone.getTimeZone("Asia/Kolkata") }
                .format(Date(record.deadlineAt))
            val text = "Your planned time for \"${record.title}\" ended at $endedAt. How much extra time do you need, and why?"
            val notification = builder
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("⏰ Time is up: ${record.title}")
                .setContentText(text)
                .setStyle(Notification.BigTextStyle().bigText(text))
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(openIntent(record.id))
                .addAction(Notification.Action.Builder(null, "Extra time", openIntent(record.id)).build())
                .addAction(Notification.Action.Builder(null, "Silence", silenceIntent()).build())
                .build()
            // Keep ringing until the employee opens or silences it, like an alarm clock.
            notification.flags = notification.flags or Notification.FLAG_INSISTENT
            manager.notify(NOTIFICATION_ID, notification)
        } catch (e: Exception) {
            Log.e(TAG, "Could not post the activity alarm", e)
        }
    }
}
