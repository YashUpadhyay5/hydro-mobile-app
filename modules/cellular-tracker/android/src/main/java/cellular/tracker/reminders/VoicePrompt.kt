package cellular.tracker.reminders

interface VoicePlayer {
    fun start(onFinished: () -> Unit)
    fun stop()
    fun release()
}

/**
 * Plays one voice instruction at most once and guarantees cleanup: the player is stopped and
 * released exactly once, whether it finishes, the user acts, the screen goes away, or the
 * [maxDurationMs] limit hits. Pure logic, unit-tested with fake players.
 */
class VoicePrompt(
    private val createPlayer: () -> VoicePlayer?,
    private val postDelayed: (delayMs: Long, block: () -> Unit) -> Unit,
    private val maxDurationMs: Long = 45_000L,
) {
    private var player: VoicePlayer? = null
    private var used = false

    val isPlaying: Boolean get() = player != null

    /** Returns false if nothing was played (already used, or no voice available). */
    @Synchronized
    fun play(): Boolean {
        if (used) return false
        used = true
        val created = runCatching { createPlayer() }.getOrNull() ?: return false
        player = created
        try {
            created.start { stop() }
        } catch (e: Exception) {
            stop()
            return false
        }
        postDelayed(maxDurationMs) { stop() }
        return true
    }

    @Synchronized
    fun stop() {
        val current = player ?: return
        player = null
        runCatching { current.stop() }
        runCatching { current.release() }
    }
}
