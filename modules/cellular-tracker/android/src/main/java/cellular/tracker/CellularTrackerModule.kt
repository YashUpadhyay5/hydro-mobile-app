package cellular.tracker

import android.content.ComponentName
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
import java.util.Locale
import cellular.tracker.activities.ActivityAlarm
import cellular.tracker.reminders.AndroidReminderAlarmScheduler
import cellular.tracker.reminders.AttendanceSnapshot
import cellular.tracker.reminders.ReminderActivity
import cellular.tracker.reminders.ReminderCatchUpWorker
import cellular.tracker.reminders.ReminderEngines
import cellular.tracker.reminders.ReminderKind
import cellular.tracker.reminders.ReminderNotifier
import cellular.tracker.reminders.ReminderPlanner
import cellular.tracker.reminders.ReminderReceiver
import cellular.tracker.reminders.ReminderStore
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
      val existingProvider = prefs.getString("locationProvider", "GPS Preferred") ?: "GPS Preferred"
      val existingGpsRatio = prefs.getInt("gpsRatioCount", 1)
      val existingCellularRatio = prefs.getInt("cellularRatioCount", 2)
      val existingInterval = prefs.getString("locationUpdateInterval", "30 Seconds") ?: "30 Seconds"

      val resolvedProvider = locationProvider ?: existingProvider
      val resolvedGpsRatio = gpsRatioCount ?: existingGpsRatio
      val resolvedCellularRatio = cellularRatioCount ?: existingCellularRatio
      val resolvedInterval = locationUpdateInterval ?: existingInterval

      prefs.edit()
        .putString("userId", userId)
        .putString("apiBaseUrl", apiBaseUrl)
        .putString("locationProvider", resolvedProvider)
        .putInt("gpsRatioCount", resolvedGpsRatio)
        .putInt("cellularRatioCount", resolvedCellularRatio)
        .putString("locationUpdateInterval", resolvedInterval)
        .putBoolean("isClockedIn", true)
        .apply()

      if (!userToken.isNullOrEmpty()) {
        val sessionPrefs = context.getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
        sessionPrefs.edit().putString("userToken", userToken).apply()
      }
      if (!hasLocationPermission(context)) {
        // Starting the service now would crash the app (see hasLocationPermission). The session is
        // saved above, so the next call after the user grants location will start tracking.
        Log.w("CellularTrackerModule", "Location permission not granted. Not starting LocationTrackingService.")
        return@Function false
      }
      try {
        val intent = Intent(context, LocationTrackingService::class.java).apply {
          putExtra("userId", userId)
          putExtra("apiBaseUrl", apiBaseUrl)
          if (!userToken.isNullOrEmpty()) {
            putExtra("userToken", userToken)
          }
          putExtra("locationProvider", resolvedProvider)
          putExtra("gpsRatioCount", resolvedGpsRatio)
          putExtra("cellularRatioCount", resolvedCellularRatio)
          putExtra("locationUpdateInterval", resolvedInterval)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "Could not start LocationTrackingService safely", e)
        false
      }
    }

    Function("updateTrackingSettings") { locationProvider: String?, gpsRatioCount: Int?, cellularRatioCount: Int?, locationUpdateInterval: String? ->
      val prefs = context.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
      val existingProvider = prefs.getString("locationProvider", "GPS Preferred") ?: "GPS Preferred"
      val existingGpsRatio = prefs.getInt("gpsRatioCount", 1)
      val existingCellularRatio = prefs.getInt("cellularRatioCount", 2)
      val existingInterval = prefs.getString("locationUpdateInterval", "30 Seconds") ?: "30 Seconds"

      val resolvedProvider = locationProvider ?: existingProvider
      val resolvedGpsRatio = gpsRatioCount ?: existingGpsRatio
      val resolvedCellularRatio = cellularRatioCount ?: existingCellularRatio
      val resolvedInterval = locationUpdateInterval ?: existingInterval

      prefs.edit()
        .putString("locationProvider", resolvedProvider)
        .putInt("gpsRatioCount", resolvedGpsRatio)
        .putInt("cellularRatioCount", resolvedCellularRatio)
        .putString("locationUpdateInterval", resolvedInterval)
        .apply()

      // The settings are persisted above and picked up whenever the service next starts. Only
      // push them to a live service: when clocked out the service would just stop itself, and
      // without location permission starting it would crash the app.
      if (!prefs.getBoolean("isClockedIn", false) || !hasLocationPermission(context)) {
        return@Function false
      }

      val intent = Intent(context, LocationTrackingService::class.java).apply {
        action = "cellular.tracker.ACTION_UPDATE_SETTINGS"
        putExtra("locationProvider", resolvedProvider)
        putExtra("gpsRatioCount", resolvedGpsRatio)
        putExtra("cellularRatioCount", resolvedCellularRatio)
        putExtra("locationUpdateInterval", resolvedInterval)
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "Could not send update settings intent to LocationTrackingService", e)
        false
      }
    }

    Function("recordOfflineClockOut") { payloadJson: String ->
      try {
        val sessionPrefs = context.getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
        sessionPrefs.edit().putString("pendingOfflineClockOut", payloadJson).apply()
        Log.d("CellularTrackerModule", "[OfflineClockOut] Saved pending offline clock out to AttendanceSessionPrefs: $payloadJson")
        true
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "Failed to save offline clock out", e)
        false
      }
    }

    Function("clearOfflineClockOut") {
      try {
        val sessionPrefs = context.getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
        sessionPrefs.edit().remove("pendingOfflineClockOut").apply()
        Log.d("CellularTrackerModule", "[OfflineClockOut] Cleared pending offline clock out from AttendanceSessionPrefs.")
        true
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "Failed to clear offline clock out", e)
        false
      }
    }

    Function("stopTrackingService") {
      val prefs = context.getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
      prefs.edit()
        .remove("userId")
        .putBoolean("isClockedIn", false)
        .putInt("pingCounter", 0)
        .putString("cachedFootprintsJson", "[]")
        .apply()

      // 1. Cancel AlarmManager — this is the key missing piece.
      //    Without this, ACTION_ALARM_TICK keeps firing every interval and
      //    causes Android to restart the service even after stopService().
      try {
        val alarmManager = context.getSystemService(android.content.Context.ALARM_SERVICE) as android.app.AlarmManager
        val alarmIntent = android.content.Intent(context, LocationTrackingService::class.java).apply {
          action = "cellular.tracker.ACTION_ALARM_TICK"
        }
        val pendingIntent = android.app.PendingIntent.getService(
          context,
          888,
          alarmIntent,
          android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
        Log.d("CellularTrackerModule", "[ClockOut] AlarmManager cancelled successfully.")
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "[ClockOut] Could not cancel AlarmManager: ${e.message}")
      }

      // 2. Flush the offline queue. Points captured before clock-out (e.g. while offline) must
      //    still reach the server; the worker sees isClockedIn=false and won't resurrect the service.
      LocationRepository.getInstance(context).apply {
        cancelTrackingHeartbeat()
        triggerBatchUploadWork(forceReplace = true)
      }
      TrackingAlerts.clearAll(context)

      // 3. Stop the foreground service
      try {
        val intent = Intent(context, LocationTrackingService::class.java)
        context.stopService(intent)
        Log.d("CellularTrackerModule", "[ClockOut] LocationTrackingService stopped.")
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "Could not stop LocationTrackingService safely", e)
      }
    }

    // Returns false when the exemption dialog could not be shown (some OEM builds lack it), so the
    // caller can send the user to the battery settings screen instead.
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
        true
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "Could not request battery optimization exemption safely", e)
        false
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

    // ── Attendance reminders (see cellular.tracker.reminders) ──────────────────────────────

    // Stores the shift schedule from services/AttendanceReminderService.ts and arms the next alarm.
    // Returns true when a reminder is scheduled.
    Function("configureAttendanceReminders") { configJson: String ->
      val config = ReminderStore.parseConfig(configJson)
      ReminderNotifier(context).ensureChannels()
      val next = ReminderEngines.create(context).configure(config)
      if (config.enabled) ReminderCatchUpWorker.schedule(context) else ReminderCatchUpWorker.cancel(context)
      next != null
    }

    // The app reports clock-in/out (also after restoring state from the server) so pending reminders stop.
    Function("updateAttendanceReminderState") { date: String, clockedIn: Boolean, clockedOut: Boolean ->
      ReminderEngines.create(context).onAttendanceChanged(AttendanceSnapshot(date, clockedIn, clockedOut))
      // Clocking out also ends the Day Activity alarms for the day.
      ActivityAlarm(context).onAttendanceChanged(date, clockedIn, clockedOut)
      Unit
    }

    // Logout or the user turning reminders off.
    Function("disableAttendanceReminders") {
      val store = ReminderStore(context)
      val engine = ReminderEngines.create(context)
      store.config()?.let { engine.configure(it.copy(enabled = false)) } ?: run {
        AndroidReminderAlarmScheduler(context).cancel()
        ReminderNotifier(context).dismissShown()
      }
      ReminderCatchUpWorker.cancel(context)
    }

    // ── Day Activities alarm (see cellular.tracker.activities) ─────────────────────────────

    // Arms the "time is up" alarm for the running activity. Safe to call on every refresh with the same deadline.
    Function("scheduleActivityAlarm") { id: String, title: String, deadlineAtMs: Double ->
      ActivityAlarm(context).schedule(id, title, deadlineAtMs.toLong())
    }

    // Extend, finish, cancel, sign-out: nothing more to ring for.
    Function("cancelActivityAlarm") {
      ActivityAlarm(context).cancel()
      Unit
    }

    // The employee opened the Extra time screen: stop the sound. The next repeat stays scheduled until they answer.
    Function("silenceActivityAlarm") {
      ActivityAlarm(context).silence()
      Unit
    }

    // Creates the alarm channel (id "activity_alarm") so the server's push can use it.
    Function("ensureActivityAlarmChannel") {
      ActivityAlarm(context).ensureChannel()
      Unit
    }

    // Device test: rings the activity alarm after [delaySeconds] through the real alarm path.
    Function("scheduleTestActivityAlarm") { delaySeconds: Int ->
      ActivityAlarm(context).schedule("test", "Test activity", System.currentTimeMillis() + delaySeconds.coerceIn(5, 3600) * 1000L)
    }

    // What can and cannot work on this device, for the settings / diagnostics screens.
    AsyncFunction("getAttendanceReminderStatus") { promise: Promise ->
      try {
        val store = ReminderStore(context)
        val config = store.config()
        val next = config?.let { ReminderPlanner().next(System.currentTimeMillis(), it, store.state()) }
        val notificationManager = context.getSystemService(android.app.NotificationManager::class.java)
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        promise.resolve(mapOf(
          "enabled" to (config?.enabled == true),
          "nextReminderAt" to (next?.atMs?.toDouble() ?: 0.0),
          "nextReminderKind" to (next?.kind?.name ?: ""),
          "notificationsEnabled" to notificationManager.areNotificationsEnabled(),
          "exactAlarmsAllowed" to AndroidReminderAlarmScheduler.canScheduleExact(context),
          "fullScreenAllowed" to ReminderNotifier.canUseFullScreenIntent(context),
          "batteryOptimizationIgnored" to (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || pm.isIgnoringBatteryOptimizations(context.packageName)),
          "manufacturer" to Build.MANUFACTURER
        ))
      } catch (e: Exception) {
        promise.reject("REMINDER_STATUS_ERROR", e.message, e)
      }
    }

    // Opens the system screen where the user grants what reminders need. Returns false if unavailable.
    Function("openAttendanceReminderSettings") { target: String ->
      val pkg = context.packageName
      val intent = when (target) {
        "exactAlarm" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
          Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$pkg")) else null
        "fullScreen" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$pkg")) else null
        "notifications" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg) else null
        "autoStart" -> getAutoStartIntent(context)
        else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
      } ?: return@Function false
      try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (e: Exception) {
        Log.w("CellularTrackerModule", "Could not open reminder settings '$target'", e)
        false
      }
    }

    // Device test: shows a reminder via the real alarm path after [delaySeconds], skipping the
    // attendance check. Lock the phone or swipe the app away after triggering to test delivery.
    Function("scheduleTestAttendanceReminder") { kind: String, delaySeconds: Int ->
      val reminderKind = runCatching { ReminderKind.valueOf(kind) }.getOrNull() ?: return@Function false
      if (ReminderStore(context).config() == null) return@Function false
      val operation = android.app.PendingIntent.getBroadcast(
        context, AndroidReminderAlarmScheduler.REQUEST_TEST,
        Intent(context, ReminderReceiver::class.java).setAction(ReminderReceiver.ACTION_TEST)
          .putExtra(ReminderActivity.EXTRA_KIND, reminderKind.name)
          .putExtra(ReminderActivity.EXTRA_DATE, ReminderPlanner().dateString(System.currentTimeMillis())),
        android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
      )
      AndroidReminderAlarmScheduler.setAlarm(context, System.currentTimeMillis() + delaySeconds.coerceIn(5, 3600) * 1000L, operation)
      true
    }
  }

  companion object {
    fun getAutoStartIntent(context: Context): Intent {
      val pkg = context.packageName
      val mfg = Build.MANUFACTURER.lowercase(Locale.ROOT)
      val autoStartIntents = mutableListOf<Intent>()

      if (mfg.contains("transsion") || mfg.contains("infinix") || mfg.contains("tecno") || mfg.contains("itel")) {
        autoStartIntents.add(
          Intent().setComponent(
            ComponentName("com.transsion.phonemaster", "com.transsion.phonemaster.AutoStartManagementActivity")
          )
        )
        autoStartIntents.add(
          Intent().setComponent(
            ComponentName("com.transsion.phonemaster", "com.transsion.phonemaster.MainActivity")
          )
        )
        autoStartIntents.add(
          Intent().setComponent(
            ComponentName("com.transsion.powersave", "com.transsion.powersave.PowerSaveMainActivity")
          )
        )
      } else if (mfg.contains("xiaomi") || mfg.contains("redmi") || mfg.contains("poco")) {
        autoStartIntents.add(
          Intent().setComponent(
            ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
          )
        )
      } else if (mfg.contains("oppo") || mfg.contains("realme")) {
        autoStartIntents.add(
          Intent().setComponent(
            ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")
          )
        )
        autoStartIntents.add(
          Intent().setComponent(
            ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")
          )
        )
      } else if (mfg.contains("vivo") || mfg.contains("iqoo")) {
        autoStartIntents.add(
          Intent().setComponent(
            ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")
          )
        )
        autoStartIntents.add(
          Intent().setComponent(
            ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")
          )
        )
      }

      val pm = context.packageManager
      for (candidate in autoStartIntents) {
        if (candidate.resolveActivity(pm) != null) {
          return candidate
        }
      }

      return Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
    }
  }
}
