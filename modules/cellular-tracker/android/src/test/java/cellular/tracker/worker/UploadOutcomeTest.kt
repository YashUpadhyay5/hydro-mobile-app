package cellular.tracker.worker

import org.junit.Assert.assertEquals
import org.junit.Test

class UploadOutcomeTest {

    @Test
    fun successStatusesAreAccepted() {
        assertEquals(UploadOutcome.ACCEPTED, classifyHttpStatus(200))
        assertEquals(UploadOutcome.ACCEPTED, classifyHttpStatus(201))
        assertEquals(UploadOutcome.ACCEPTED, classifyHttpStatus(204))
    }

    @Test
    fun clientErrorsAboutTheRecordAreRejections() {
        assertEquals(UploadOutcome.REJECTED, classifyHttpStatus(400))
        assertEquals(UploadOutcome.REJECTED, classifyHttpStatus(404))
        assertEquals(UploadOutcome.REJECTED, classifyHttpStatus(409))
        assertEquals(UploadOutcome.REJECTED, classifyHttpStatus(422))
    }

    @Test
    fun authTimeoutAndRateLimitDoNotUseUpRetries() {
        assertEquals(UploadOutcome.TRANSIENT_FAILURE, classifyHttpStatus(401))
        assertEquals(UploadOutcome.TRANSIENT_FAILURE, classifyHttpStatus(403))
        assertEquals(UploadOutcome.TRANSIENT_FAILURE, classifyHttpStatus(408))
        assertEquals(UploadOutcome.TRANSIENT_FAILURE, classifyHttpStatus(429))
    }

    @Test
    fun serverErrorsDoNotUseUpRetries() {
        assertEquals(UploadOutcome.TRANSIENT_FAILURE, classifyHttpStatus(500))
        assertEquals(UploadOutcome.TRANSIENT_FAILURE, classifyHttpStatus(502))
        assertEquals(UploadOutcome.TRANSIENT_FAILURE, classifyHttpStatus(503))
    }
}
