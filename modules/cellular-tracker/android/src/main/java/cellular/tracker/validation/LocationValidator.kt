package cellular.tracker.validation

import kotlin.math.abs

object FixSource {
    const val FUSED_HIGH_ACCURACY = "FUSED_HIGH_ACCURACY"
    const val FUSED_BALANCED = "FUSED_BALANCED"
    const val FUSED_LAST_LOCATION = "FUSED_LAST_LOCATION"
}

/** Plain snapshot of an android.location.Location so validation runs on the JVM without Android. */
data class FixCandidate(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float?,
    val fixTimeMs: Long,
    val fixElapsedRealtimeNanos: Long,
    val provider: String?,
    val isMock: Boolean,
    val source: String
)

/** Identity of the last fix that was stored; persisted so repeat detection survives service restarts. */
data class RecordedFix(
    val fixTimeMs: Long,
    val latitude: Double,
    val longitude: Double
)

enum class FixVerdict {
    ACCEPTED,
    REJECTED_INVALID_COORDINATES,
    REJECTED_REPEATED_FIX,
    REJECTED_STALE,
    REJECTED_NO_ACCURACY,
    REJECTED_LOW_ACCURACY
}

data class FixEvaluation(
    val verdict: FixVerdict,
    val fixAgeMs: Long?,
    val detail: String
) {
    val isAccepted: Boolean get() = verdict == FixVerdict.ACCEPTED
}

class LocationValidator(
    private val maxFixAgeMs: Long = DEFAULT_MAX_FIX_AGE_MS,
    private val maxAccuracyMeters: Float = DEFAULT_MAX_ACCURACY_METERS
) {
    companion object {
        const val DEFAULT_MAX_FIX_AGE_MS = 120_000L
        const val DEFAULT_MAX_ACCURACY_METERS = 150f
        private const val COORDINATE_EPSILON = 1e-7
    }

    fun evaluate(candidate: FixCandidate, nowElapsedRealtimeNanos: Long, lastRecorded: RecordedFix?): FixEvaluation {
        if (!hasValidCoordinates(candidate)) {
            return FixEvaluation(FixVerdict.REJECTED_INVALID_COORDINATES, null, "Coordinates out of range, NaN, or 0,0")
        }

        val ageMs = fixAgeMs(candidate, nowElapsedRealtimeNanos)

        if (lastRecorded != null && isSameFix(candidate, lastRecorded)) {
            return FixEvaluation(FixVerdict.REJECTED_REPEATED_FIX, ageMs, "Same fix (time ${candidate.fixTimeMs}) was already recorded")
        }

        // Age comes from the monotonic elapsedRealtime clock, so a user changing the wall clock cannot
        // make an old fix look fresh. A fix from before the last reboot has no comparable age.
        if (ageMs == null) {
            return FixEvaluation(FixVerdict.REJECTED_STALE, null, "Fix age unknown (elapsedRealtimeNanos missing or from a previous boot)")
        }
        if (ageMs > maxFixAgeMs) {
            return FixEvaluation(FixVerdict.REJECTED_STALE, ageMs, "Fix is ${ageMs / 1000}s old (limit ${maxFixAgeMs / 1000}s)")
        }

        val accuracy = candidate.accuracyMeters
        if (accuracy == null || accuracy.isNaN() || accuracy <= 0f) {
            return FixEvaluation(FixVerdict.REJECTED_NO_ACCURACY, ageMs, "Fix has no accuracy estimate")
        }
        if (accuracy > maxAccuracyMeters) {
            return FixEvaluation(FixVerdict.REJECTED_LOW_ACCURACY, ageMs, "Accuracy ${accuracy}m exceeds limit ${maxAccuracyMeters}m")
        }

        return FixEvaluation(FixVerdict.ACCEPTED, ageMs, "Fresh (${ageMs / 1000}s) and accurate (${accuracy}m)")
    }

    fun fixAgeMs(candidate: FixCandidate, nowElapsedRealtimeNanos: Long): Long? {
        if (candidate.fixElapsedRealtimeNanos <= 0L) return null
        val ageNanos = nowElapsedRealtimeNanos - candidate.fixElapsedRealtimeNanos
        if (ageNanos < 0L) return null
        return ageNanos / 1_000_000L
    }

    private fun hasValidCoordinates(c: FixCandidate): Boolean {
        if (c.latitude.isNaN() || c.longitude.isNaN()) return false
        if (c.latitude < -90.0 || c.latitude > 90.0) return false
        if (c.longitude < -180.0 || c.longitude > 180.0) return false
        return !(c.latitude == 0.0 && c.longitude == 0.0)
    }

    private fun isSameFix(c: FixCandidate, recorded: RecordedFix): Boolean =
        c.fixTimeMs == recorded.fixTimeMs &&
            abs(c.latitude - recorded.latitude) < COORDINATE_EPSILON &&
            abs(c.longitude - recorded.longitude) < COORDINATE_EPSILON
}
