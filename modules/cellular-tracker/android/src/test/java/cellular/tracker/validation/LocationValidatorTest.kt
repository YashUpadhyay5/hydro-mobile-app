package cellular.tracker.validation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LocationValidatorTest {

    private val validator = LocationValidator()

    // Device has been up for ten hours (long enough for the 90-minute incident window);
    // wall clock is an arbitrary fixed instant.
    private val nowElapsedNanos = 36_000_000_000_000L
    private val nowWallClockMs = 1_790_000_000_000L

    // Position reported by Keka at ~12:39 in the incident.
    private val trueLat = 25.749165
    private val trueLng = 84.252267

    // Position our platform kept reporting 12:30-14:00 (~420 m away).
    private val frozenLat = 25.748266
    private val frozenLng = 84.248129

    private fun fix(
        ageMs: Long = 2_000L,
        accuracy: Float? = 8f,
        lat: Double = trueLat,
        lng: Double = trueLng,
        source: String = FixSource.FUSED_HIGH_ACCURACY,
        isMock: Boolean = false,
        fixTimeMs: Long = nowWallClockMs - ageMs,
        elapsedNanos: Long = nowElapsedNanos - ageMs * 1_000_000L
    ) = FixCandidate(lat, lng, accuracy, fixTimeMs, elapsedNanos, "fused", isMock, source)

    private fun recorded(c: FixCandidate) = RecordedFix(c.fixTimeMs, c.latitude, c.longitude)

    @Test
    fun freshAccurateFixIsAccepted() {
        val result = validator.evaluate(fix(ageMs = 3_000L, accuracy = 6f), nowElapsedNanos, null)
        assertEquals(FixVerdict.ACCEPTED, result.verdict)
        assertEquals(3_000L, result.fixAgeMs)
    }

    @Test
    fun staleCachedFixIsRejected() {
        // A lastLocation cached at 12:30 and handed back at 14:00.
        val result = validator.evaluate(fix(ageMs = 90 * 60_000L, lat = frozenLat, lng = frozenLng), nowElapsedNanos, null)
        assertEquals(FixVerdict.REJECTED_STALE, result.verdict)
        assertEquals(90 * 60_000L, result.fixAgeMs)
    }

    @Test
    fun ageLimitIsInclusiveAtTwoMinutes() {
        assertEquals(FixVerdict.ACCEPTED, validator.evaluate(fix(ageMs = 120_000L), nowElapsedNanos, null).verdict)
        assertEquals(FixVerdict.REJECTED_STALE, validator.evaluate(fix(ageMs = 120_001L), nowElapsedNanos, null).verdict)
    }

    @Test
    fun lowAccuracyCellLevelFixIsRejected() {
        // The incident coordinate as a fresh but coarse (cell/Wi-Fi-derived) fused fix.
        val result = validator.evaluate(fix(accuracy = 420f, lat = frozenLat, lng = frozenLng), nowElapsedNanos, null)
        assertEquals(FixVerdict.REJECTED_LOW_ACCURACY, result.verdict)
    }

    @Test
    fun fixWithoutAccuracyIsRejected() {
        assertEquals(FixVerdict.REJECTED_NO_ACCURACY, validator.evaluate(fix(accuracy = null), nowElapsedNanos, null).verdict)
        assertEquals(FixVerdict.REJECTED_NO_ACCURACY, validator.evaluate(fix(accuracy = 0f), nowElapsedNanos, null).verdict)
    }

    @Test
    fun repeatedCachedFixIsRejected() {
        val cached = fix(ageMs = 30_000L)
        val result = validator.evaluate(cached, nowElapsedNanos, recorded(cached))
        assertEquals(FixVerdict.REJECTED_REPEATED_FIX, result.verdict)
    }

    @Test
    fun duplicateDeliveryOfSameFixIsRejectedOnSecondTick() {
        val fixObject = fix(ageMs = 1_000L)
        val first = validator.evaluate(fixObject, nowElapsedNanos, null)
        assertEquals(FixVerdict.ACCEPTED, first.verdict)

        // Handler loop and alarm tick fire 5 s apart and receive the same Location object.
        val second = validator.evaluate(fixObject, nowElapsedNanos + 5_000_000_000L, recorded(fixObject))
        assertEquals(FixVerdict.REJECTED_REPEATED_FIX, second.verdict)
    }

    @Test
    fun stationaryUserWithNewFixAtIdenticalCoordinatesIsAccepted() {
        val previous = fix(ageMs = 60_000L)
        val newFixSamePlace = fix(ageMs = 1_000L)
        val result = validator.evaluate(newFixSamePlace, nowElapsedNanos, recorded(previous))
        assertEquals(FixVerdict.ACCEPTED, result.verdict)
    }

    @Test
    fun serviceRestartStillDetectsTheAlreadyRecordedFix() {
        val cached = fix(ageMs = 20_000L)
        val persistedBeforeKill = recorded(cached)

        // OEM kills the service; a new process builds a new validator and reads the persisted fix.
        val afterRestart = LocationValidator().evaluate(cached, nowElapsedNanos + 10_000_000_000L, persistedBeforeKill)
        assertEquals(FixVerdict.REJECTED_REPEATED_FIX, afterRestart.verdict)
    }

    @Test
    fun fixFromBeforeRebootIsRejectedAsStale() {
        // elapsedRealtime restarts at boot, so a pre-reboot fix has a larger value than "now".
        val preReboot = fix(elapsedNanos = nowElapsedNanos + 50_000_000_000L)
        val result = validator.evaluate(preReboot, nowElapsedNanos, null)
        assertEquals(FixVerdict.REJECTED_STALE, result.verdict)
        assertNull(result.fixAgeMs)
    }

    @Test
    fun fixWithoutElapsedRealtimeIsRejectedAsStale() {
        val result = validator.evaluate(fix(elapsedNanos = 0L), nowElapsedNanos, null)
        assertEquals(FixVerdict.REJECTED_STALE, result.verdict)
    }

    @Test
    fun wallClockChangeDoesNotMakeOldFixLookFresh() {
        // User set the wall clock back 3 hours: fix time looks "in the future", but monotonic age is 10 minutes.
        val old = fix(fixTimeMs = nowWallClockMs + 3 * 3_600_000L, elapsedNanos = nowElapsedNanos - 600_000_000_000L)
        assertEquals(FixVerdict.REJECTED_STALE, validator.evaluate(old, nowElapsedNanos, null).verdict)

        // And a fresh fix stays accepted even though its wall-clock time looks hours old.
        val fresh = fix(fixTimeMs = nowWallClockMs - 3 * 3_600_000L, elapsedNanos = nowElapsedNanos - 1_000_000_000L)
        assertEquals(FixVerdict.ACCEPTED, validator.evaluate(fresh, nowElapsedNanos, null).verdict)
    }

    @Test
    fun verdictDependsOnlyOnCaptureTimeSoUploadDelayCannotChangeIt() {
        // Validation runs once at capture. Re-evaluating with the same capture-time inputs (as an
        // offline queue drained hours later would) must give the same answer.
        val candidate = fix(ageMs = 4_000L)
        val atCapture = validator.evaluate(candidate, nowElapsedNanos, null)
        val again = validator.evaluate(candidate, nowElapsedNanos, null)
        assertEquals(atCapture, again)
        assertEquals(FixVerdict.ACCEPTED, atCapture.verdict)
    }

    @Test
    fun mockFixIsJudgedBySameRulesAndKeepsItsFlag() {
        val freshMock = fix(isMock = true)
        assertEquals(FixVerdict.ACCEPTED, validator.evaluate(freshMock, nowElapsedNanos, null).verdict)
        assertTrue(freshMock.isMock)

        val staleMock = fix(isMock = true, ageMs = 10 * 60_000L)
        assertEquals(FixVerdict.REJECTED_STALE, validator.evaluate(staleMock, nowElapsedNanos, null).verdict)
    }

    @Test
    fun gpsToNetworkTransitionAcceptsWifiGradeAndRejectsCellGrade() {
        val gps = fix(ageMs = 2_000L, accuracy = 7f, source = FixSource.FUSED_HIGH_ACCURACY)
        val gpsResult = validator.evaluate(gps, nowElapsedNanos, null)
        assertEquals(FixVerdict.ACCEPTED, gpsResult.verdict)

        // User walks indoors: GPS lost, fused falls back to Wi-Fi positioning.
        val wifi = fix(ageMs = 1_000L, accuracy = 45f, lat = trueLat + 0.0001, source = FixSource.FUSED_BALANCED)
        assertEquals(FixVerdict.ACCEPTED, validator.evaluate(wifi, nowElapsedNanos, recorded(gps)).verdict)

        // No Wi-Fi either: cell-sector estimate several hundred metres off must not be recorded.
        val cell = fix(ageMs = 1_000L, accuracy = 900f, lat = frozenLat, lng = frozenLng, source = FixSource.FUSED_BALANCED)
        assertEquals(FixVerdict.REJECTED_LOW_ACCURACY, validator.evaluate(cell, nowElapsedNanos, recorded(wifi)).verdict)
    }

    @Test
    fun invalidCoordinatesAreRejected() {
        assertEquals(FixVerdict.REJECTED_INVALID_COORDINATES, validator.evaluate(fix(lat = 0.0, lng = 0.0), nowElapsedNanos, null).verdict)
        assertEquals(FixVerdict.REJECTED_INVALID_COORDINATES, validator.evaluate(fix(lat = Double.NaN), nowElapsedNanos, null).verdict)
        assertEquals(FixVerdict.REJECTED_INVALID_COORDINATES, validator.evaluate(fix(lat = 91.0), nowElapsedNanos, null).verdict)
    }
}
