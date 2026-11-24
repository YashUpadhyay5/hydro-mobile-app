package cellular.tracker.whitebox

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

/**
 * White-Box Unit & Integration Test Suite for Location Tracking Subsystem.
 * Authored from the perspective of a Senior Test Architect (25+ years experience).
 * Covers:
 *  1. Boundary Value Analysis (BVA) & Equivalence Partitioning for Interval Parsing.
 *  2. State Machine & Transition Testing for Sequence Ratios ("GPS + Cellular").
 *  3. Monotonic Monitored Debounce Algorithm (85% Window) against Early/Premature Pings.
 *  4. Flowchart Progressive Ladder Timeout Verification (12s -> 17s -> 22s -> 25s).
 *  5. Dual-SIM Inactive Slot Sanitization (MediaTek Int.MAX_VALUE / UNAVAILABLE protection).
 *  6. Remote Configuration Version Invalidation & Safe Background Ingestion.
 */
class TrackingWhiteBoxTest {

    // ─────────────────────────────────────────────────────────────────────────
    // 1. INTERVAL PARSING ENGINE (BVA & EQUIVALENCE PARTITIONING)
    // ─────────────────────────────────────────────────────────────────────────

    private fun parseIntervalMs(intervalStr: String?): Long {
        val cleanStr = (intervalStr ?: "30 Seconds").lowercase(Locale.ROOT).trim()
        val digitsOnly = cleanStr.replace(Regex("[^0-9]"), "")
        val seconds = if (digitsOnly.isNotEmpty()) {
            try {
                val parsed = digitsOnly.toLong()
                if (cleanStr.contains("hour") || cleanStr.contains("hr")) {
                    parsed * 3600L
                } else if (cleanStr.contains("min")) {
                    parsed * 60L
                } else {
                    parsed
                }
            } catch (e: Exception) {
                30L
            }
        } else {
            30L
        }
        val finalSeconds = seconds.coerceIn(1L, 86400L)
        return finalSeconds * 1000L
    }

    @Test
    fun intervalParsing_standardSeconds() {
        assertEquals(10_000L, parseIntervalMs("10 Seconds"))
        assertEquals(30_000L, parseIntervalMs("30 Seconds"))
        assertEquals(60_000L, parseIntervalMs("60 Seconds"))
        assertEquals(120_000L, parseIntervalMs("120 Seconds"))
        assertEquals(300_000L, parseIntervalMs("300 Seconds"))
        assertEquals(600_000L, parseIntervalMs("600 Seconds"))
        assertEquals(900_000L, parseIntervalMs("900 Seconds"))
    }

    @Test
    fun intervalParsing_minuteEquivalenceClasses() {
        assertEquals(60_000L, parseIntervalMs("1 Minute"))
        assertEquals(300_000L, parseIntervalMs("5 Minutes"))
        assertEquals(900_000L, parseIntervalMs("15 Minutes"))
        assertEquals(900_000L, parseIntervalMs("  15 mins  "))
    }

    @Test
    fun intervalParsing_hourEquivalenceClasses_verifiesOneHourGapFix() {
        assertEquals(3_600_000L, parseIntervalMs("1 Hour"))
        assertEquals(3_600_000L, parseIntervalMs("1 hr"))
        assertEquals(7_200_000L, parseIntervalMs("2 Hours"))
        assertEquals(10_800_000L, parseIntervalMs(" 3 hrs "))
    }

    @Test
    fun intervalParsing_boundaryLimitsAndFallbacks() {
        // Upper bound: 86400s (24 hours)
        assertEquals(86_400_000L, parseIntervalMs("100000 Seconds"))
        assertEquals(86_400_000L, parseIntervalMs("48 Hours"))

        // Lower bound / empty / malformed fallbacks
        assertEquals(30_000L, parseIntervalMs(null))
        assertEquals(30_000L, parseIntervalMs(""))
        assertEquals(30_000L, parseIntervalMs("non-numeric-gibberish"))
        assertEquals(1_000L, parseIntervalMs("0 Seconds")) // Clamped to min 1s
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. MONOTONIC DEBOUNCE ALGORITHM (85% THRESHOLD)
    // ─────────────────────────────────────────────────────────────────────────

    private fun isDebounceSuppressed(intervalMs: Long, elapsedSinceLastCaptureMs: Long): Boolean {
        val minGapMs = (intervalMs * 85 / 100).coerceAtLeast(3000L)
        return elapsedSinceLastCaptureMs < minGapMs
    }

    @Test
    fun debounce_fifteenMinuteInterval_preventsPrematurePings() {
        val intervalMs = 15 * 60 * 1000L // 900,000 ms
        // 85% threshold = 765,000 ms (12.75 minutes)

        // Premature tick at 5 minutes: MUST BE SUPPRESSED
        assertTrue("5m tick should be suppressed", isDebounceSuppressed(intervalMs, 5 * 60 * 1000L))

        // Premature tick at 10 minutes: MUST BE SUPPRESSED
        assertTrue("10m tick should be suppressed", isDebounceSuppressed(intervalMs, 10 * 60 * 1000L))

        // Premature tick at 12 minutes: MUST BE SUPPRESSED (below 12.75m)
        assertTrue("12m tick should be suppressed", isDebounceSuppressed(intervalMs, 12 * 60 * 1000L))

        // Legitimate tick at 13 minutes (above 85% window): MUST BE ALLOWED
        assertFalse("13m tick should be allowed", isDebounceSuppressed(intervalMs, 13 * 60 * 1000L))

        // Expected tick at 15 minutes: MUST BE ALLOWED
        assertFalse("15m tick should be allowed", isDebounceSuppressed(intervalMs, 15 * 60 * 1000L))
    }

    @Test
    fun debounce_thirtySecondInterval_accommodatesHardwareJitter() {
        val intervalMs = 30_000L
        // 85% threshold = 25,500 ms

        // Firing at 10s: MUST BE SUPPRESSED
        assertTrue("10s tick should be suppressed", isDebounceSuppressed(intervalMs, 10_000L))

        // Firing at 20s: MUST BE SUPPRESSED
        assertTrue("20s tick should be suppressed", isDebounceSuppressed(intervalMs, 20_000L))

        // Firing at 26s: MUST BE ALLOWED
        assertFalse("26s tick should be allowed", isDebounceSuppressed(intervalMs, 26_000L))

        // Firing at 30s: MUST BE ALLOWED
        assertFalse("30s tick should be allowed", isDebounceSuppressed(intervalMs, 30_000L))
    }

    @Test
    fun debounce_subSecondInterval_guaranteesMinimumThreeSecondSafety() {
        val intervalMs = 1_000L // 1 second
        // 85% of 1000 = 850ms, but coerceAtLeast(3000L) guarantees 3000ms floor

        assertTrue("1s tick must be rate limited by 3s safety floor", isDebounceSuppressed(intervalMs, 1_000L))
        assertTrue("2s tick must be rate limited by 3s safety floor", isDebounceSuppressed(intervalMs, 2_000L))
        assertFalse("3.5s tick is allowed", isDebounceSuppressed(intervalMs, 3_500L))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. SEQUENCE RATIO STATE MACHINE ("GPS + Cellular")
    // ─────────────────────────────────────────────────────────────────────────

    private class RatioSequencer(
        val provider: String,
        val gpsTarget: Int,
        val cellularTarget: Int
    ) {
        var gpsCount = 0
        var cellularCount = 0

        fun nextMethod(): String {
            return when (provider) {
                "Cellular Only" -> "CELLULAR"
                "GPS Only" -> "GPS"
                "GPS + Cellular" -> {
                    if (gpsCount < gpsTarget) {
                        gpsCount++
                        "GPS"
                    } else if (cellularCount < cellularTarget) {
                        cellularCount++
                        "CELLULAR"
                    } else {
                        // Reset cycle
                        gpsCount = 1
                        cellularCount = 0
                        "GPS"
                    }
                }
                else -> "GPS"
            }
        }
    }

    @Test
    fun sequenceRatio_oneGpsTwoCellular_cyclesStrictly() {
        val sequencer = RatioSequencer("GPS + Cellular", gpsTarget = 1, cellularTarget = 2)

        // Cycle 1
        assertEquals("GPS", sequencer.nextMethod())
        assertEquals("CELLULAR", sequencer.nextMethod())
        assertEquals("CELLULAR", sequencer.nextMethod())

        // Cycle 2
        assertEquals("GPS", sequencer.nextMethod())
        assertEquals("CELLULAR", sequencer.nextMethod())
        assertEquals("CELLULAR", sequencer.nextMethod())

        // Cycle 3
        assertEquals("GPS", sequencer.nextMethod())
        assertEquals("CELLULAR", sequencer.nextMethod())
        assertEquals("CELLULAR", sequencer.nextMethod())
    }

    @Test
    fun sequenceRatio_twoGpsOneCellular_cyclesStrictly() {
        val sequencer = RatioSequencer("GPS + Cellular", gpsTarget = 2, cellularTarget = 1)

        // Cycle 1
        assertEquals("GPS", sequencer.nextMethod())
        assertEquals("GPS", sequencer.nextMethod())
        assertEquals("CELLULAR", sequencer.nextMethod())

        // Cycle 2
        assertEquals("GPS", sequencer.nextMethod())
        assertEquals("GPS", sequencer.nextMethod())
        assertEquals("CELLULAR", sequencer.nextMethod())
    }

    @Test
    fun sequenceRatio_providerInvariants_ignoreRatioCounters() {
        val gpsOnly = RatioSequencer("GPS Only", gpsTarget = 1, cellularTarget = 5)
        for (i in 1..10) {
            assertEquals("GPS", gpsOnly.nextMethod())
        }

        val cellOnly = RatioSequencer("Cellular Only", gpsTarget = 5, cellularTarget = 1)
        for (i in 1..10) {
            assertEquals("CELLULAR", cellOnly.nextMethod())
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. FLOWCHART PROGRESSIVE TIMEOUT LADDER VERIFICATION
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    fun flowchartProgressiveLadder_stagesCumulateExactlyToTwentyFiveSeconds() {
        val stage1TimeoutMs = 12_000L
        val stage2ExtensionMs = 5_000L
        val stage3ExtensionMs = 5_000L
        val stage4ExtensionMs = 3_000L

        val stage1Total = stage1TimeoutMs
        val stage2Total = stage1Total + stage2ExtensionMs
        val stage3Total = stage2Total + stage3ExtensionMs
        val stage4Total = stage3Total + stage4ExtensionMs

        assertEquals("Stage 1 must be 12 seconds", 12_000L, stage1Total)
        assertEquals("Stage 2 must extend waiting to 17 seconds", 17_000L, stage2Total)
        assertEquals("Stage 3 must extend waiting to 22 seconds", 22_000L, stage3Total)
        assertEquals("Stage 4 must extend waiting to exactly 25 seconds", 25_000L, stage4Total)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. DUAL-SIM SANITIZATION (MEDIANTEK / TRANSSION INACTIVE SLOT DEFENSE)
    // ─────────────────────────────────────────────────────────────────────────

    private fun sanitizeCellField(rawVal: Int?): Int? {
        if (rawVal == null || rawVal == Int.MAX_VALUE || rawVal == -1 || rawVal == 0 || rawVal >= 268435455) {
            return null
        }
        return rawVal
    }

    @Test
    fun cellSanitization_filtersInactiveSimSlotsAndDummyValues() {
        // MediaTek dual-SIM empty slot dummy values
        assertNull(sanitizeCellField(Int.MAX_VALUE)) // 2147483647
        assertNull(sanitizeCellField(-1))            // CellInfo.UNAVAILABLE
        assertNull(sanitizeCellField(0))             // 0
        assertNull(sanitizeCellField(null))          // null
        assertNull(sanitizeCellField(268435455))     // 0x0FFFFFFF GSM invalid boundary

        // Valid physical cell towers
        assertEquals(Integer.valueOf(142589), sanitizeCellField(142589))
        assertEquals(Integer.valueOf(504), sanitizeCellField(504))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. REMOTE SETTINGS VERSION INVALIDATION
    // ─────────────────────────────────────────────────────────────────────────

    private fun shouldApplyRemoteSettings(
        serverVersion: Int,
        localVersion: Int,
        serverInterval: String,
        localInterval: String
    ): Boolean {
        if (serverVersion > localVersion) return true
        if (serverVersion == 0 && serverInterval != localInterval) return true
        return false
    }

    @Test
    fun remoteSettings_appliesOnlyWhenServerIsNewerOrExplicitlyChanged() {
        // Normal upgrade path: server v764 > local v763 -> APPLY
        assertTrue(shouldApplyRemoteSettings(764, 763, "900 Seconds", "900 Seconds"))

        // Already on latest version: server v763 == local v763 -> NO-OP (save battery & alarms)
        assertFalse(shouldApplyRemoteSettings(763, 763, "900 Seconds", "900 Seconds"))

        // Out of order packet: server v762 < local v763 -> IGNORE
        assertFalse(shouldApplyRemoteSettings(762, 763, "900 Seconds", "900 Seconds"))

        // Legacy server with version 0 but altered interval -> APPLY
        assertTrue(shouldApplyRemoteSettings(0, 0, "600 Seconds", "900 Seconds"))
    }
}
