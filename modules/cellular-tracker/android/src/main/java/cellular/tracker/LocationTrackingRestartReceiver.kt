package cellular.tracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Resumes tracking for a clocked-in user after the phone reboots or the app is updated mid-shift.
 * Both kill the service, and a reboot also clears the wake-up alarm that would otherwise revive it,
 * so without this no pings are recorded until the user happens to open the app.
 */
class LocationTrackingRestartReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "LocTrackRestartRecv"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return

        val sharedPrefs = context.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val isClockedIn = sharedPrefs.getBoolean("isClockedIn", false)
        val userId = sharedPrefs.getString("userId", null)

        if (!isClockedIn || userId.isNullOrEmpty()) {
            Log.i(TAG, "onReceive(${intent.action}): User is clocked out. Nothing to resume.")
            return
        }

        if (!canStartLocationServiceFromBackground(context)) {
            // Without "Allow all the time" the service can't get location from here (and on
            // Android 14+ its startForeground() would crash the app), so ask the user to open the app.
            Log.w(TAG, "onReceive(${intent.action}): Background location not granted. Asking user to resume tracking.")
            TrackingAlerts.showTrackingInterrupted(context)
            return
        }

        val serviceIntent = Intent(context, LocationTrackingService::class.java).apply {
            putExtra("userId", userId)
            putExtra("apiBaseUrl", sharedPrefs.getString("apiBaseUrl", null))
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            Log.i(TAG, "onReceive(${intent.action}): Resumed LocationTrackingService for user $userId.")
        } catch (e: Exception) {
            Log.e(TAG, "onReceive(${intent.action}): Failed to resume service: ${e.message}", e)
            TrackingAlerts.showTrackingInterrupted(context)
        }
    }
}
