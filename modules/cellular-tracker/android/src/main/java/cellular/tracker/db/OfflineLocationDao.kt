package cellular.tracker.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface OfflineLocationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun insert(location: OfflineLocation): Long

    @Query("SELECT * FROM offline_locations WHERE (uploadStatus IN ('PENDING', 'FAILED', 'RETRYING') OR (uploadStatus = 'UPLOADING' AND updatedAt < :staleThresholdMs)) AND retryCount < 15 ORDER BY timestamp ASC LIMIT :limit")
    fun getPendingLocations(limit: Int = 50, staleThresholdMs: Long = System.currentTimeMillis() - 120000L): List<OfflineLocation>

    @Query("UPDATE offline_locations SET uploadStatus = 'PENDING' WHERE uploadStatus = 'UPLOADING' AND updatedAt < :staleThresholdMs")
    fun resetStaleUploadingRecords(staleThresholdMs: Long = System.currentTimeMillis() - 120000L): Int

    @Query("UPDATE offline_locations SET uploadStatus = :status, updatedAt = :updatedAt WHERE id IN (:ids)")
    fun updateUploadStatus(ids: List<String>, status: String, updatedAt: Long = System.currentTimeMillis())

    @Query("UPDATE offline_locations SET retryCount = retryCount + 1, uploadStatus = 'RETRYING', updatedAt = :updatedAt WHERE id IN (:ids)")
    fun incrementRetryCount(ids: List<String>, updatedAt: Long = System.currentTimeMillis())

    @Query("DELETE FROM offline_locations WHERE id IN (:ids)")
    fun deleteUploadedLocations(ids: List<String>): Int

    @Query("DELETE FROM offline_locations WHERE uploadStatus = 'UPLOADED' OR timestamp < :thresholdMs")
    fun deleteOldUploadedRecords(thresholdMs: Long): Int

    @Query("SELECT COUNT(*) FROM offline_locations WHERE uploadStatus IN ('PENDING', 'FAILED', 'RETRYING')")
    fun getPendingCount(): Int

    @Query("SELECT COUNT(*) FROM offline_locations WHERE uploadStatus = 'UPLOADED' AND timestamp >= :startOfDayMs")
    fun getUploadedCountToday(startOfDayMs: Long): Int

    @Query("SELECT COUNT(*) FROM offline_locations WHERE uploadStatus = 'FAILED'")
    fun getFailedCount(): Int

    @Query("SELECT * FROM offline_locations ORDER BY timestamp DESC LIMIT 1")
    fun getLastLocationRecord(): OfflineLocation?
}
