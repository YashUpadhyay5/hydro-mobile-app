package cellular.tracker

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import cellular.tracker.logging.DebugLogger

/** Restarts [LocationTrackingService] from the background when Android killed it mid-shift. */
internal object TrackingServiceReviver {
    private const val TAG = "TrackingServiceReviver"

    /** Call only while the user is clocked in. [caller] is used in logs. */
    fun reviveIfKilled(context: Context, caller: String) {
        try {
            if (isServiceRunning(context)) return

            if (!canStartLocationServiceFromBackground(context)) {
                // Without "Allow all the time" the revived service cannot get location from the
                // background, and its failed startForeground() would crash the app process.
                DebugLogger.log("SERVICE_HEARTBEAT", "SERVICE_RESURRECT_SKIPPED", "NO_PERMISSION", details = "Caller: $caller | Background location permission not granted")
                Log.w(TAG, "[$caller] Background location not granted. Not resurrecting LocationTrackingService.")
                TrackingAlerts.showTrackingInterrupted(context)
                return
            }

            val serviceIntent = Intent(context, LocationTrackingService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            DebugLogger.log("SERVICE_HEARTBEAT", "SERVICE_RESURRECTED", "SUCCESS", details = "Caller: $caller | Resurrected LocationTrackingService during active shift (isClockedIn=true)")
            Log.w(TAG, "[$caller] LocationTrackingService was killed by OS mid-shift. Automatically resurrected service!")
        } catch (e: Exception) {
            // Android 12+ refuses background foreground-service starts unless the app is exempt
            // from battery optimization (or has another exemption).
            DebugLogger.log("SERVICE_HEARTBEAT", "SERVICE_RESURRECT_FAILED", "FAILURE", details = "Caller: $caller | ${e.javaClass.simpleName}: ${e.message}")
            Log.e(TAG, "[$caller] Failed to resurrect service", e)
            TrackingAlerts.showTrackingInterrupted(context)
        }
    }

    private fun isServiceRunning(context: Context): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        @Suppress("DEPRECATION")
        for (service in manager?.getRunningServices(Int.MAX_VALUE) ?: emptyList()) {
            if (LocationTrackingService::class.java.name == service.service.className) {
                return true
            }
        }
        return false
    }
}
