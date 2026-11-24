package cellular.tracker.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [OfflineLocation::class], version = 2, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun offlineLocationDao(): OfflineLocationDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        // Explicit migration so an app update keeps pending (not yet uploaded) offline records;
        // fallbackToDestructiveMigration would otherwise drop them.
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE offline_locations ADD COLUMN fixTimestamp INTEGER")
                db.execSQL("ALTER TABLE offline_locations ADD COLUMN fixElapsedRealtimeNanos INTEGER")
                db.execSQL("ALTER TABLE offline_locations ADD COLUMN fixAgeMs INTEGER")
                db.execSQL("ALTER TABLE offline_locations ADD COLUMN speed REAL")
                db.execSQL("ALTER TABLE offline_locations ADD COLUMN bearing REAL")
                db.execSQL("ALTER TABLE offline_locations ADD COLUMN captureSource TEXT")
                db.execSQL("ALTER TABLE offline_locations ADD COLUMN validationStatus TEXT")
            }
        }

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "hrms_location_tracking.db"
                )
                .addMigrations(MIGRATION_1_2)
                .fallbackToDestructiveMigration()
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
