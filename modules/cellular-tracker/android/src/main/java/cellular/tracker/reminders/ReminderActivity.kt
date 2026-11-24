package cellular.tracker.reminders

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Full-screen attendance reminder, opened by a permitted full-screen intent or by tapping the
 * notification. Clearly branded as an HRMS reminder (not a phone call). It is the only place the
 * voice instruction plays, and the voice stops on any action, when the screen goes away, or after
 * [VoicePrompt]'s time limit.
 */
class ReminderActivity : Activity() {

    companion object {
        const val EXTRA_KIND = "hrmsReminderKind"
        const val EXTRA_DATE = "hrmsReminderDate"
        const val ACTION_SHOW = "cellular.tracker.reminders.SHOW"
        const val ACTION_OPEN_ATTENDANCE = "cellular.tracker.reminders.OPEN_ATTENDANCE"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var voice: VoicePrompt? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val kind = intent.getStringExtra(EXTRA_KIND)?.let { runCatching { ReminderKind.valueOf(it) }.getOrNull() }
        val date = intent.getStringExtra(EXTRA_DATE)
        if (kind == null || date == null) {
            finish()
            return
        }
        if (intent.action == ACTION_OPEN_ATTENDANCE) {
            openAttendance()
            return
        }

        showOverLockScreen()
        ReminderNotifier.stopVoicePrompt()
        val config = ReminderStore(this).config()
        // The notification has done its ringing; keep its actions without sounding again over the voice.
        ReminderNotifier(this).showQuiet(PlannedReminder(kind, date, 0, System.currentTimeMillis()), config)
        val text = ReminderNotifier.message(kind, config)
        setContentView(buildContent(kind, text, date))

        voice = VoicePrompt(
            createPlayer = { AndroidVoicePlayers.create(this, kind, text) },
            postDelayed = { delay, block -> handler.postDelayed(block, delay) },
        ).also { it.play() }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == ACTION_OPEN_ATTENDANCE) openAttendance()
    }

    override fun onStop() {
        super.onStop()
        voice?.stop()
    }

    override fun onDestroy() {
        voice?.stop()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private fun openAttendance() {
        voice?.stop()
        ReminderNotifier(this).dismissShown()
        // Retries stay scheduled: they stop by themselves once the app reports the clock-in/out.
        packageManager.getLaunchIntentForPackage(packageName)?.let {
            startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("hrmsReminderKind", intent.getStringExtra(EXTRA_KIND)))
        }
        finish()
    }

    private fun sendAction(action: String, kind: ReminderKind, date: String) {
        voice?.stop()
        ReminderNotifier.stopVoicePrompt()
        sendBroadcast(
            Intent(this, ReminderReceiver::class.java).setAction(action)
                .putExtra(EXTRA_KIND, kind.name).putExtra(EXTRA_DATE, date)
        )
        finish()
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        // The reminder holds nothing sensitive, so it may show on the lock screen; opening the app still unlocks first.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun dp(value: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

    private fun buildContent(kind: ReminderKind, text: String, date: String): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(dp(28), dp(48), dp(28), dp(48))
        }
        fun label(value: String, sizeSp: Float, color: String, bold: Boolean = false) = TextView(this).apply {
            this.text = value
            textSize = sizeSp
            setTextColor(Color.parseColor(color))
            gravity = Gravity.CENTER
            if (bold) typeface = Typeface.DEFAULT_BOLD
            setPadding(0, dp(6), 0, dp(6))
        }
        fun button(value: String, fillColor: String, onClick: () -> Unit) = Button(this).apply {
            this.text = value
            isAllCaps = false
            textSize = 17f
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(Color.parseColor(fillColor)) }
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)).apply { topMargin = dp(12) }
        }

        root.addView(label("HRMS ATTENDANCE REMINDER", 13f, "#38BDF8", bold = true))
        root.addView(label(ReminderNotifier.title(kind).removePrefix("HRMS: "), 26f, "#FFFFFF", bold = true))
        root.addView(label(text, 17f, "#CBD5E1"))
        root.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(1, dp(32)) })
        root.addView(button(if (kind == ReminderKind.CLOCK_IN) "Open Attendance to Clock In" else "Open Attendance to Clock Out", "#2563EB") { openAttendance() })
        root.addView(button("Snooze ${ReminderPlanner.SNOOZE_MINUTES} minutes", "#334155") { sendAction(ReminderReceiver.ACTION_SNOOZE, kind, date) })
        root.addView(button("Dismiss for today", "#1E293B") { sendAction(ReminderReceiver.ACTION_DISMISS, kind, date) })
        return root
    }
}
