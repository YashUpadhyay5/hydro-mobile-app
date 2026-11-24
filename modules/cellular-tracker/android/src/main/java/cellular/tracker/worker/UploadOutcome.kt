package cellular.tracker.worker

/**
 * Result of uploading a location record. Only [REJECTED] (the server refused this record) counts
 * against the record's retry budget; a record is never given up on because the network or the
 * server was unavailable, or that would drop every point captured during a long bad-signal stretch.
 */
internal enum class UploadOutcome { ACCEPTED, REJECTED, TRANSIENT_FAILURE }

internal fun classifyHttpStatus(code: Int): UploadOutcome = when {
    code in 200..299 -> UploadOutcome.ACCEPTED
    // Expired token, request timeout and rate limiting say nothing about the record itself.
    code == 401 || code == 403 || code == 408 || code == 429 -> UploadOutcome.TRANSIENT_FAILURE
    code in 400..499 -> UploadOutcome.REJECTED
    else -> UploadOutcome.TRANSIENT_FAILURE
}
