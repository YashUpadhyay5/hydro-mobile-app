package cellular.tracker

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.net.Uri
import android.util.Log
import cellular.tracker.repository.LocationRepository
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CellularTrackerModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("CellularTracker")

    Function("isLocationEnabled") {
      val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      val gpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
      val networkEnabled = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
      gpsEnabled || networkEnabled
    }

    Function("getBatteryLevel") {
      val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
      bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) / 100.0f
    }

    Function("getBatteryTemperature") {
      val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      val temp = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
      temp / 10.0f
    }

    Function("startTrackingService") { userId: String, apiBaseUrl: String, userToken: String?, locationProvider: String?, gpsRatioCount: Int?, cellularRatioCount: Int?, locationUpdateInterval: String? ->
      val prefs = context.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
      prefs.edit()
        .putString("userId", userId)
        .putString("apiBaseUrl", apiBaseUrl)
        .putString("locationProvider", locationProvider ?: "GPS Preferred")
        .putInt("gpsRatioCount", gpsRatioCount ?: 1)
        .putInt("cellularRatioCount", cellularRatioCount ?: 6)
        .putString("locationUpdateInterval", locationUpdateInterval ?: "10 Seconds")
        .putBoolean("isClockedIn", true)
        .apply()

      if (!userToken.isNullOrEmpty()) {
        val sessionPrefs = context.getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
        sessionPrefs.edit().putString("userToken", userToken).apply()
      }
      try {
        val intent = Intent(context, LocationTrackingService::class.java).apply {
          putExtra("userId", userId)
          putExtra("apiBaseUrl", apiBaseUrl)
          if (!userToken.isNullOrEmpty()) {
            putExtra("userToken", userToken)
          }
          putExtra("locationProvider", locationProvider ?: "GPS Preferred")
          putExtra("gpsRatioCount", gpsRatioCount ?: 1)
          putExtra("cellularRatioCount", cellularRatioCount ?: 6)
          putExtra("locationUpdateInterval", locationUpdateInterval ?: "10 Seconds")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "Could not start LocationTrackingService safely", e)
      }
    }

    Function("updateTrackingSettings") { locationProvider: String, gpsRatioCount: Int, cellularRatioCount: Int, locationUpdateInterval: String? ->
      val prefs = context.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
      prefs.edit()
        .putString("locationProvider", locationProvider)
        .putInt("gpsRatioCount", gpsRatioCount)
        .putInt("cellularRatioCount", cellularRatioCount)
        .putString("locationUpdateInterval", locationUpdateInterval ?: "10 Seconds")
        .apply()

      val intent = Intent(context, LocationTrackingService::class.java).apply {
        action = "cellular.tracker.ACTION_UPDATE_SETTINGS"
        putExtra("locationProvider", locationProvider)
        putExtra("gpsRatioCount", gpsRatioCount)
        putExtra("cellularRatioCount", cellularRatioCount)
        putExtra("locationUpdateInterval", locationUpdateInterval ?: "10 Seconds")
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "Could not send update settings intent to LocationTrackingService", e)
      }
    }

    Function("stopTrackingService") {
      val prefs = context.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
      prefs.edit()
        .remove("userId")
        .putBoolean("isClockedIn", false)
        .putString("cachedFootprintsJson", "[]")
        .apply()

      try {
        val intent = Intent(context, LocationTrackingService::class.java)
        context.stopService(intent)
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "Could not stop LocationTrackingService safely", e)
      }
    }

    Function("requestBatteryOptimizationExemption") {
      try {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          if (!pm.isIgnoringBatteryOptimizations(context.packageName)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
              data = Uri.parse("package:${context.packageName}")
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
          }
        }
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "Could not request battery optimization exemption safely", e)
      }
    }

    AsyncFunction("getDiagnostics") { promise: Promise ->
      try {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val isBatteryOptimizationIgnored = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          pm.isIgnoringBatteryOptimizations(context.packageName)
        } else true

        val prefs = context.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val isClockedIn = prefs.getBoolean("isClockedIn", false)

        LocationRepository.getInstance(context).getDiagnostics { data ->
          val resultMap = mapOf(
            "isClockedIn" to isClockedIn,
            "isBatteryOptimizationIgnored" to isBatteryOptimizationIgnored,
            "pendingCount" to data.pendingCount,
            "failedCount" to data.failedCount,
            "uploadedToday" to data.uploadedToday,
            "lastFixTimestamp" to data.lastFixTimestamp,
            "lastFixSource" to data.lastFixSource,
            "lastFixAccuracy" to data.lastFixAccuracy
          )
          promise.resolve(resultMap)
        }
      } catch (e: Exception) {
        promise.reject("DIAGNOSTICS_ERROR", e.message, e)
      }
    }
  }
}
