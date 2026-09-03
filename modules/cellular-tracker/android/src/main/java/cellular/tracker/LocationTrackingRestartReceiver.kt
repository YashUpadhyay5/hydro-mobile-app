package cellular.tracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class LocationTrackingRestartReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "LocTrackRestartRecv"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "onReceive: Restart alarm triggered. Checking session...")
        
        val sharedPrefs = context.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val isClockedIn = sharedPrefs.getBoolean("isClockedIn", false)
        val userId = sharedPrefs.getString("userId", null)
        val apiBaseUrl = sharedPrefs.getString("apiBaseUrl", null)

        if (!isClockedIn || userId.isNullOrEmpty()) {
            Log.w(TAG, "onReceive: User is clocked out or missing userId. Blocking restart.")
            return
        }

        // Loop prevention: Limit restarts to max 3 attempts per 10 minutes
        val now = System.currentTimeMillis()
        val lastAttempt = sharedPrefs.getLong("lastRestartAttemptTime", 0L)
        var count = sharedPrefs.getInt("restartAttemptsCount", 0)

        if (now - lastAttempt < 600000L) { // 10 minutes window
            count++
            if (count > 3) {
                val timeSinceLast = now - lastAttempt
                if (timeSinceLast < 900000L) { // 15 minutes freeze window
                    Log.w(TAG, "onReceive: Restart loop detected! Restarts blocked to save battery. Time elapsed: ${timeSinceLast / 1000}s / 900s")
                    return
                } else {
                    count = 1
                }
            }
        } else {
            count = 1
        }

        sharedPrefs.edit()
            .putLong("lastRestartAttemptTime", now)
            .putInt("restartAttemptsCount", count)
            .apply()

        Log.i(TAG, "onReceive: Active session detected for User: $userId. Restart count: $count. Starting service...")
        val serviceIntent = Intent(context, LocationTrackingService::class.java).apply {
            putExtra("userId", userId)
            putExtra("apiBaseUrl", apiBaseUrl)
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            Log.i(TAG, "onReceive: LocationTrackingService start command issued successfully.")
        } catch (e: Exception) {
            Log.e(TAG, "onReceive: Failed to start service: ${e.message}", e)
        }
    }
}
