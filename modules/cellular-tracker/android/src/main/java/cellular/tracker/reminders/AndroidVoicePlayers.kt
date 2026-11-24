package cellular.tracker.reminders

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale

/**
 * Chooses the voice for a reminder: a bundled recording if the app ships one
 * (res/raw/hrms_reminder_clock_in or res/raw/hrms_reminder_clock_out, any format MediaPlayer reads),
 * otherwise the device's text-to-speech reading the reminder text. Returns null, i.e. no voice, when
 * the phone is on silent or vibrate: the reminder never overrides the user's ringer mode.
 */
object AndroidVoicePlayers {
    private val ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()

    fun create(context: Context, kind: ReminderKind, text: String): VoicePlayer? {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (audioManager.ringerMode != AudioManager.RINGER_MODE_NORMAL) return null
        val name = if (kind == ReminderKind.CLOCK_IN) "hrms_reminder_clock_in" else "hrms_reminder_clock_out"
        val resId = context.resources.getIdentifier(name, "raw", context.packageName)
        return if (resId != 0) RecordingPlayer(context, audioManager, resId) else SpeechPlayer(context, audioManager, text)
    }

    /** Holds transient, duck-others audio focus for the duration of the prompt. */
    private class Focus(private val audioManager: AudioManager) {
        private var request: AudioFocusRequest? = null

        fun acquire() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(ATTRIBUTES)
                    .build()
                    .also { audioManager.requestAudioFocus(it) }
            } else {
                @Suppress("DEPRECATION")
                audioManager.requestAudioFocus(null, AudioManager.STREAM_NOTIFICATION, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            }
        }

        fun release() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                request?.let { audioManager.abandonAudioFocusRequest(it) }
                request = null
            } else {
                @Suppress("DEPRECATION")
                audioManager.abandonAudioFocus(null)
            }
        }
    }

    private class RecordingPlayer(
        private val context: Context,
        audioManager: AudioManager,
        private val resId: Int,
    ) : VoicePlayer {
        private val focus = Focus(audioManager)
        private var mediaPlayer: MediaPlayer? = null

        override fun start(onFinished: () -> Unit) {
            focus.acquire()
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(ATTRIBUTES)
                setDataSource(context, Uri.parse("android.resource://${context.packageName}/$resId"))
                setOnCompletionListener { onFinished() }
                setOnErrorListener { _, _, _ -> onFinished(); true }
                prepare()
                start()
            }
        }

        override fun stop() {
            mediaPlayer?.let { if (it.isPlaying) it.stop() }
        }

        override fun release() {
            mediaPlayer?.release()
            mediaPlayer = null
            focus.release()
        }
    }

    private class SpeechPlayer(
        context: Context,
        audioManager: AudioManager,
        private val text: String,
    ) : VoicePlayer {
        private val appContext = context.applicationContext
        private val focus = Focus(audioManager)
        private var tts: TextToSpeech? = null

        override fun start(onFinished: () -> Unit) {
            focus.acquire()
            val handler = Handler(Looper.getMainLooper())
            var engine: TextToSpeech? = null
            engine = TextToSpeech(appContext) { status ->
                handler.post {
                    val ready = engine ?: tts
                    if (status != TextToSpeech.SUCCESS || ready == null) {
                        onFinished()
                        return@post
                    }
                    val language = ready.setLanguage(Locale.getDefault())
                    if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
                        ready.setLanguage(Locale.ENGLISH)
                    }
                    ready.setAudioAttributes(ATTRIBUTES)
                    ready.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) = Unit
                        override fun onDone(utteranceId: String?) = onFinished()
                        @Deprecated("Deprecated in Java")
                        override fun onError(utteranceId: String?) = onFinished()
                    })
                    ready.speak(text, TextToSpeech.QUEUE_FLUSH, null, "hrms_attendance_reminder")
                }
            }
            tts = engine
        }

        override fun stop() {
            tts?.stop()
        }

        override fun release() {
            tts?.shutdown()
            tts = null
            focus.release()
        }
    }
}
