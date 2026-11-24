package cellular.tracker.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoicePromptTest {

    private class FakePlayer(private val failOnStart: Boolean = false) : VoicePlayer {
        var onFinished: (() -> Unit)? = null
        var stops = 0
        var releases = 0
        override fun start(onFinished: () -> Unit) {
            if (failOnStart) throw IllegalStateException("audio device busy")
            this.onFinished = onFinished
        }
        override fun stop() { stops++ }
        override fun release() { releases++ }
    }

    private val timeouts = mutableListOf<Pair<Long, () -> Unit>>()
    private fun prompt(player: VoicePlayer?) = VoicePrompt({ player }, { delay, block -> timeouts += delay to block })

    @Test
    fun finishingNaturallyReleasesThePlayerOnce() {
        val player = FakePlayer()
        val voice = prompt(player)
        assertTrue(voice.play())
        player.onFinished!!()
        voice.stop()
        assertEquals(1, player.releases)
        assertFalse(voice.isPlaying)
    }

    @Test
    fun userActionStopsAndReleasesExactlyOnce() {
        val player = FakePlayer()
        val voice = prompt(player)
        voice.play()
        voice.stop()
        voice.stop()
        assertEquals(1, player.stops)
        assertEquals(1, player.releases)
    }

    @Test
    fun timeLimitStopsAPromptThatNeverFinishes() {
        val player = FakePlayer()
        val voice = prompt(player)
        voice.play()
        assertEquals(45_000L, timeouts.single().first)
        timeouts.single().second()
        assertEquals(1, player.releases)
        assertFalse(voice.isPlaying)
    }

    @Test
    fun aPlayerThatFailsToStartIsStillReleased() {
        val player = FakePlayer(failOnStart = true)
        assertFalse(prompt(player).play())
        assertEquals(1, player.releases)
    }

    @Test
    fun noVoiceAvailableMeansNothingPlays() {
        assertFalse(prompt(null).play())
        assertTrue(timeouts.isEmpty())
    }

    @Test
    fun aPromptPlaysAtMostOnce() {
        val voice = prompt(FakePlayer())
        assertTrue(voice.play())
        voice.stop()
        assertFalse(voice.play())
    }
}
