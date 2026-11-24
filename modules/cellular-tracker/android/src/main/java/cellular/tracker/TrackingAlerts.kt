package cellular.tracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * User-facing alerts for the cases where location pings would otherwise be missed silently
 * during a shift: device location switched off, or tracking that could not (re)start by itself.
 */
internal object TrackingAlerts {
    private const val TAG = "TrackingAlerts"
    private const val CHANNEL_ID = "cellular_tracker_alerts_channel"
    private const val LOCATION_OFF_ID = 8828
    private const val TRACKING_INTERRUPTED_ID = 8829

    fun showLocationOff(context: Context) = notify(
        context,
        LOCATION_OFF_ID,
        "Location is turned off",
        "You are clocked in, but attendance location tracking is paused. Tap to turn location back on.",
        Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
    )

    fun showTrackingInterrupted(context: Context) = notify(
        context,
        TRACKING_INTERRUPTED_ID,
        "Attendance tracking stopped",
        "You are still clocked in. Tap to open HRMS and resume location tracking.",
        context.packageManager.getLaunchIntentForPackage(context.packageName)
    )

    fun clearLocationOff(context: Context) = cancel(context, LOCATION_OFF_ID)

    fun clearTrackingInterrupted(context: Context) = cancel(context, TRACKING_INTERRUPTED_ID)

    fun clearAll(context: Context) {
        clearLocationOff(context)
        clearTrackingInterrupted(context)
    }

    private fun notify(context: Context, id: Int, title: String, text: String, intent: Intent?) {
        try {
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                manager.createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "HRMS Attendance Alerts", NotificationManager.IMPORTANCE_HIGH)
                )
                Notification.Builder(context, CHANNEL_ID)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(context).setPriority(Notification.PRIORITY_HIGH)
            }
            builder
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(Notification.BigTextStyle().bigText(text))
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setAutoCancel(true)
                // Re-posted on every ping while the problem lasts; only the first post should alert.
                .setOnlyAlertOnce(true)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                builder.setContentIntent(
                    PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                )
            }
            manager.notify(id, builder.build())
        } catch (e: Exception) {
            Log.w(TAG, "Could not post tracking alert $id", e)
        }
    }

    private fun cancel(context: Context, id: Int) {
        try {
            context.getSystemService(NotificationManager::class.java)?.cancel(id)
        } catch (e: Exception) {
            Log.w(TAG, "Could not cancel tracking alert $id", e)
        }
    }
}
