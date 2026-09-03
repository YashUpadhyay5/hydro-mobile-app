package cellular.tracker.db

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(tableName = "offline_locations")
data class OfflineLocation(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    val userId: String,
    val timestamp: Long = System.currentTimeMillis(),
    val date: String,
    val latitude: Double?,
    val longitude: Double?,
    val accuracy: Double?,
    val provider: String?,
    val trackingMethod: String,
    val locationSource: String, // GPS, NETWORK, CELLULAR, LAST_KNOWN, IP, NO_LOCATION
    val batteryLevel: Int,
    val batteryTemperature: Float,
    val isMock: Boolean,
    val address: String? = null,
    val cellId: Int? = null,
    val lac: Int? = null,
    val tac: Int? = null,
    val mcc: Int? = null,
    val mnc: Int? = null,
    val signalStrength: Int? = null,
    val networkType: String? = null,
    var uploadStatus: String = UPLOAD_STATUS_PENDING, // PENDING, UPLOADING, UPLOADED, FAILED, RETRYING
    var retryCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    var updatedAt: Long = System.currentTimeMillis()
) {
    companion object {
        const val UPLOAD_STATUS_PENDING = "PENDING"
        const val UPLOAD_STATUS_UPLOADING = "UPLOADING"
        const val UPLOAD_STATUS_UPLOADED = "UPLOADED"
        const val UPLOAD_STATUS_FAILED = "FAILED"
        const val UPLOAD_STATUS_RETRYING = "RETRYING"

        const val SOURCE_GPS = "GPS"
        const val SOURCE_NETWORK = "NETWORK"
        const val SOURCE_CELLULAR = "CELLULAR"
        const val SOURCE_LAST_KNOWN = "LAST_KNOWN"
        const val SOURCE_IP = "IP"
        const val SOURCE_NO_LOCATION = "NO_LOCATION"
    }
}
