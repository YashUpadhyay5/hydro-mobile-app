package cellular.tracker.reminders

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.Locale

/**
 * The "calling-style" reminder: a high-priority notification on its own channel that plays the
 * ringtone with a call-like vibration, offers Open Attendance / Snooze / Dismiss, and, when the user
 * has allowed full-screen intents, opens [ReminderActivity] over the lock screen. It is labelled as an
 * HRMS reminder and uses CATEGORY_ALARM: its sound follows alarm audio priority.
 */
class ReminderNotifier(context: Context) : ReminderPresenter {
    private val appContext = context.applicationContext
    private val manager = appContext.getSystemService(NotificationManager::class.java)

    companion object {
        private const val TAG = "ReminderNotifier"
        const val NOTIFICATION_ID = 8830
        private const val RING_CHANNEL_ID = "hrms_attendance_reminders_v2"
        private const val QUIET_CHANNEL_ID = "hrms_attendance_reminders_quiet_v1"
        val VIBRATION_PATTERN = longArrayOf(0, 1000, 800, 1000, 800, 1000)

        @Volatile private var activeVoicePrompt: VoicePrompt? = null

        fun stopVoicePrompt() {
            try {
                activeVoicePrompt?.stop()
                activeVoicePrompt = null
            } catch (e: Exception) {
                Log.w(TAG, "Error stopping active voice prompt", e)
            }
        }

        fun formatMinutes(minuteOfDay: Int): String {
            val m = ((minuteOfDay % (24 * 60)) + 24 * 60) % (24 * 60)
            return String.format(Locale.US, "%02d:%02d", m / 60, m % 60)
        }

        fun title(kind: ReminderKind) = when (kind) {
            ReminderKind.CLOCK_IN -> "HRMS: You haven't clocked in"
            ReminderKind.CLOCK_OUT -> "HRMS: You're still clocked in"
        }

        /** Also the text the voice prompt reads out when no recording is bundled. */
        fun message(kind: ReminderKind, config: ReminderConfig?) = when (kind) {
            ReminderKind.CLOCK_IN -> {
                val at = config?.let { " at ${formatMinutes(it.shiftStartMinutes)}" } ?: ""
                "Your shift started$at. Please open HRMS and clock in."
            }
            ReminderKind.CLOCK_OUT -> {
                val at = config?.let { " at ${formatMinutes(it.shiftEndMinutes)}" } ?: ""
                "Your shift ended$at. Please open HRMS and clock out."
            }
        }

        /** Android 14+ lets the user (and Play) withhold full-screen intents from non-alarm apps. */
        fun canUseFullScreenIntent(context: Context): Boolean =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
                context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()

        fun reminderExtras(intent: Intent, reminder: PlannedReminder): Intent = intent
            .putExtra(ReminderActivity.EXTRA_KIND, reminder.kind.name)
            .putExtra(ReminderActivity.EXTRA_DATE, reminder.date)
    }

    fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        runCatching { manager.deleteNotificationChannel("hrms_attendance_reminders_v1") }
        val ring = NotificationChannel(RING_CHANNEL_ID, "Attendance reminders", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Rings when you forget to clock in or out"
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
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
        val quiet = NotificationChannel(QUIET_CHANNEL_ID, "Attendance reminders (open)", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Keeps an open reminder's actions available without ringing again"
            setSound(null, null)
            enableVibration(false)
        }
        manager.createNotificationChannel(ring)
        manager.createNotificationChannel(quiet)
    }

    override fun show(reminder: PlannedReminder, config: ReminderConfig) = post(reminder, config, ringing = true)

    /** Re-posts the open reminder silently, e.g. while [ReminderActivity] is on screen speaking. */
    fun showQuiet(reminder: PlannedReminder, config: ReminderConfig?) = post(reminder, config, ringing = false)

    override fun dismissShown() {
        stopVoicePrompt()
        manager.cancel(NOTIFICATION_ID)
    }

    private fun post(reminder: PlannedReminder, config: ReminderConfig?, ringing: Boolean) {
        try {
            ensureChannels()
            val channel = if (ringing) RING_CHANNEL_ID else QUIET_CHANNEL_ID
            val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(appContext, channel)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(appContext)
                    .setPriority(if (ringing) Notification.PRIORITY_MAX else Notification.PRIORITY_LOW)
                    .apply {
                        if (ringing) {
                            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
                            setVibrate(VIBRATION_PATTERN)
                        }
                    }
            }
            val text = message(reminder.kind, config)
            builder
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(title(reminder.kind))
                .setContentText(text)
                .setStyle(Notification.BigTextStyle().bigText(text))
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(!ringing)
                .setAutoCancel(true)
                // Tapping opens the reminder screen: the voice prompt only plays after that user action
                // (or a permitted full-screen launch), never straight from the notification.
                .setContentIntent(activityIntent(reminder, ReminderActivity.ACTION_SHOW, 1))
                .addAction(Notification.Action.Builder(null, "Open HRMS", activityIntent(reminder, ReminderActivity.ACTION_OPEN_ATTENDANCE, 2)).build())
                .addAction(Notification.Action.Builder(null, "Snooze", broadcastIntent(reminder, ReminderReceiver.ACTION_SNOOZE, 3)).build())
                .addAction(Notification.Action.Builder(null, "Dismiss", broadcastIntent(reminder, ReminderReceiver.ACTION_DISMISS, 4)).build())
            if (ringing && canUseFullScreenIntent(appContext)) {
                builder.setFullScreenIntent(activityIntent(reminder, ReminderActivity.ACTION_SHOW, 5), true)
            }
            manager.notify(NOTIFICATION_ID, builder.build())
            if (ringing && !canUseFullScreenIntent(appContext)) {
                startVoicePrompt(reminder, config)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Could not post attendance reminder", e)
        }
    }

    private fun startVoicePrompt(reminder: PlannedReminder, config: ReminderConfig?) {
        stopVoicePrompt()
        val text = message(reminder.kind, config)
        val mainHandler = Handler(Looper.getMainLooper())
        mainHandler.post {
            try {
                val prompt = VoicePrompt(
                    createPlayer = { AndroidVoicePlayers.create(appContext, reminder.kind, text) },
                    postDelayed = { delay, block -> mainHandler.postDelayed(block, delay) }
                )
                activeVoicePrompt = prompt
                prompt.play()
            } catch (e: Exception) {
                Log.w(TAG, "Failed to start background voice prompt", e)
            }
        }
    }

    private fun activityIntent(reminder: PlannedReminder, action: String, requestCode: Int): PendingIntent =
        PendingIntent.getActivity(
            appContext, requestCode,
            reminderExtras(Intent(appContext, ReminderActivity::class.java).setAction(action), reminder)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun broadcastIntent(reminder: PlannedReminder, action: String, requestCode: Int): PendingIntent =
        PendingIntent.getBroadcast(
            appContext, requestCode,
            reminderExtras(Intent(appContext, ReminderReceiver::class.java).setAction(action), reminder),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}
