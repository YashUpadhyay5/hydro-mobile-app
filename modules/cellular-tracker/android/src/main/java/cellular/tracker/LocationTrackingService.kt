package cellular.tracker

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.telephony.CellInfo
import android.telephony.CellInfoGsm
import android.telephony.CellInfoLte
import android.telephony.CellInfoNr
import android.telephony.CellInfoWcdma
import android.telephony.TelephonyManager
import android.util.Log
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.Granularity
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.tasks.Tasks
import cellular.tracker.db.OfflineLocation
import cellular.tracker.repository.LocationRepository
import cellular.tracker.logging.DebugLogger
import cellular.tracker.validation.FixCandidate
import cellular.tracker.validation.FixEvaluation
import cellular.tracker.validation.FixSource
import cellular.tracker.validation.LocationValidator
import cellular.tracker.validation.RecordedFix
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * A location-type foreground service may only start while a location permission is granted
 * (Android 14+ throws from startForeground() otherwise). Check this before every
 * startForegroundService(): if startForeground() then fails, the service stops without having
 * entered the foreground and the OS kills the whole app process
 * ("Context.startForegroundService() did not then call Service.startForeground()").
 */
internal fun hasLocationPermission(context: Context): Boolean =
    context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

/**
 * Stricter check for startForegroundService() while the app is in the background (worker, boot).
 * A location service started from the background only gets location access with
 * "Allow all the time"; with only "While using the app", startForeground() throws on Android 14+.
 */
internal fun canStartLocationServiceFromBackground(context: Context): Boolean =
    hasLocationPermission(context) && (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
        context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED)

class LocationTrackingService : Service() {
    private val TAG = "LocationTrackingService"
    private val NOTIFICATION_ID = 8827
    private val CHANNEL_ID = "cellular_tracker_service_channel"
    private val ACTION_ALARM_TICK = "cellular.tracker.ACTION_ALARM_TICK"
    val ACTION_UPDATE_SETTINGS = "cellular.tracker.ACTION_UPDATE_SETTINGS"

    private var userId: String? = null
    private var apiBaseUrl: String? = null
    private var serviceHandler: Handler? = null
    private var trackingRunnable: Runnable? = null
    private var retryRunnable: Runnable? = null
    private val isCapturing = java.util.concurrent.atomic.AtomicBoolean(false)

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationRepository: LocationRepository

    private var wakeLock: PowerManager.WakeLock? = null
    private var isInForeground = false
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private val locationValidator = LocationValidator()
    private val recordedFixLock = Any()

    private val isTranssion: Boolean by lazy {
        val mfg = Build.MANUFACTURER.lowercase(Locale.ROOT)
        mfg.contains("transsion") || mfg.contains("infinix") || mfg.contains("tecno") || mfg.contains("itel")
    }

    private companion object {
        val FIX_SOURCES_IN_ORDER = listOf(FixSource.FUSED_HIGH_ACCURACY, FixSource.FUSED_BALANCED, FixSource.FUSED_LAST_LOCATION)
        // Lets the fused provider reuse a fix it computed very recently (saves a GPS spin-up);
        // capped at 10s so sub-minute cycles force a fresh computation rather than repeating.
        const val MAX_CACHED_FIX_AGE_MS = 10_000L
        const val NO_FIX_STATUS = "NO_FIX"
        const val PREF_LAST_FIX_TIME = "lastRecordedFixTimeMs"
        const val PREF_LAST_FIX_LAT_BITS = "lastRecordedFixLatBits"
        const val PREF_LAST_FIX_LNG_BITS = "lastRecordedFixLngBits"
    }

    override fun onCreate() {
        super.onCreate()
        DebugLogger.init(this)
        createNotificationChannel()
        startForegroundNotification()

        DebugLogger.log("FOREGROUND_SERVICE", "SERVICE_CREATED", "SUCCESS")
        serviceHandler = Handler(Looper.getMainLooper())
        
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        locationRepository = LocationRepository.getInstance(this)

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "HRMS:LocationTrackingWakeLock").apply {
            setReferenceCounted(false)
        }
        
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        setupNetworkCallback()
    }

    private fun setupNetworkCallback() {
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                val sharedPrefs = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
                val isClockedIn = sharedPrefs.getBoolean("isClockedIn", false)


                val capabilities = connectivityManager?.getNetworkCapabilities(network)
                val isWifi = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ?: false
                val isCellular = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ?: false
                val isVpn = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ?: false
                val isMetered = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)?.not() ?: false

                val connDetails = "WiFi=$isWifi, MobileData=$isCellular, VPN=$isVpn, Metered=$isMetered"
                
                locationRepository.getDiagnostics { diag ->
                    val timeStr = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.getDefault()).format(Date())
                    DebugLogger.log(
                        "NETWORK",
                        "NETWORK_AVAILABLE",
                        "ONLINE",
                        details = "Time: $timeStr | PendingQueue: ${diag.pendingCount} | FailedQueue: ${diag.failedCount} | Conn: $connDetails"
                    )
                }

                Log.d(TAG, "[NetworkCallback] Internet restored! Network is available. Details: $connDetails. User clocked in: $isClockedIn")
                Log.d(TAG, "[NetworkCallback] Triggering WorkManager batch upload for offline Room queue with forceReplace=true to bypass backoff delay.")
                locationRepository.triggerBatchUploadWork(forceReplace = true)
                DebugLogger.log("WORKMANAGER", "WORKER_ENQUEUED", "SUCCESS", details = "WorkName: LOCATION_BATCH_SYNC_WORK, Enqueued via NetworkCallback onAvailable() with forceReplace=true")
            }

            override fun onLost(network: Network) {
                DebugLogger.log("NETWORK", "CONNECTIVITY_CHANGE", "OFFLINE", details = "Network lost.")
            }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        try {
            connectivityManager?.registerNetworkCallback(request, networkCallback!!)
            DebugLogger.log("NETWORK", "REGISTER_CALLBACK", "SUCCESS")
            Log.d(TAG, "[NetworkCallback] Registered ConnectivityManager.NetworkCallback successfully.")
        } catch (e: Exception) {
            DebugLogger.log("NETWORK", "REGISTER_CALLBACK", "FAILURE", details = "Exception: ${e.javaClass.simpleName} | Message: ${e.message}")
            Log.e(TAG, "[NetworkCallback] Failed to register network callback", e)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "LocationTrackingService onStartCommand received. Action: ${intent?.action}")
        DebugLogger.log("FOREGROUND_SERVICE", "SERVICE_START_COMMAND", "SUCCESS", details = "Action: ${intent?.action}")

        if (!isInForeground) {
            // startForeground() failed in onCreate() and stopSelf() is already pending;
            // don't start tracking loops or alarms in a service that is about to be destroyed.
            Log.w(TAG, "onStartCommand: Service is not in the foreground. Ignoring command.")
            return START_NOT_STICKY
        }

        val sharedPrefs = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val isClockedIn = sharedPrefs.getBoolean("isClockedIn", false)

        if (!isClockedIn) {
            Log.w(TAG, "onStartCommand: User is clocked out. Cancelling alarms & stopping service.")
            DebugLogger.log("FOREGROUND_SERVICE", "SERVICE_STOPPING", "CLOCKED_OUT")
            cancelWakeAlarm()
            stopTrackingLoop()
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent?.action == ACTION_UPDATE_SETTINGS) {
            val provider = intent.getStringExtra("locationProvider")
                ?: sharedPrefs.getString("locationProvider", "GPS Preferred")
                ?: "GPS Preferred"
            val gRatio = if (intent.hasExtra("gpsRatioCount")) intent.getIntExtra("gpsRatioCount", 1)
                else sharedPrefs.getInt("gpsRatioCount", 1)
            val cRatio = if (intent.hasExtra("cellularRatioCount")) intent.getIntExtra("cellularRatioCount", 2)
                else sharedPrefs.getInt("cellularRatioCount", 2)
            val interval = intent.getStringExtra("locationUpdateInterval")
                ?: sharedPrefs.getString("locationUpdateInterval", "30 Seconds")
                ?: "30 Seconds"

            sharedPrefs.edit()
                .putString("locationProvider", provider)
                .putInt("gpsRatioCount", gRatio)
                .putInt("cellularRatioCount", cRatio)
                .putString("locationUpdateInterval", interval)
                .apply()

            DebugLogger.log("FOREGROUND_SERVICE", "SETTINGS_UPDATED_LIVE", "SUCCESS", details = "Dynamic settings applied: provider=$provider, interval=$interval, ratio=$gRatio:$cRatio")
            Log.d(TAG, "Dynamic settings updated live: provider=$provider, interval=$interval, ratio=$gRatio:$cRatio. Re-aligning next schedule...")

            cancelWakeAlarm()
            stopTrackingLoop()
            startTrackingLoop(captureImmediately = false)
            return START_STICKY
        }

        if (intent?.action == ACTION_ALARM_TICK) {
            /* =========================================================================
             * [PREVIOUS VERSION OF CODE - COMMENTED OUT FOR COMPARISON]:
             * // Problem: WakeLock was acquired on the caller thread without guaranteed
             * // release in finally, and it did not cancel pending Handler callbacks, causing
             * // dual-timer double-firing. It also unconditionally called scheduleNextWakeAlarm().
             *
             * Log.d(TAG, "AlarmManager WAKEUP tick received. Acquiring temporary WakeLock and capturing location...")
             * try {
             *     if (wakeLock?.isHeld == false) {
             *         wakeLock?.acquire(30000L)
             *     }
             * } catch (e: Exception) {
             *     Log.w(TAG, "WakeLock acquire error", e)
             * }
             * Thread {
             *     captureAndSaveLocation()
             *     scheduleNextWakeAlarm()
             * }.start()
             * return START_STICKY
             * =========================================================================
             * [LATEST VERSION OF CODE (ACTIVE)]:
             * Synchronizes timers, cancels duplicate pending callbacks, manages atomic
             * isCapturing, and arms the next alarm accurately.
             * ========================================================================= */
            Log.d(TAG, "AlarmManager WAKEUP tick received. Synchronizing timers & capturing location...")
            DebugLogger.log("ALARM_MANAGER", "ALARM_TRIGGERED", "SUCCESS", details = "WAKEUP tick received")
            
            // Remove pending Handler execution and pending retries so dual-timers do not double-fire
            trackingRunnable?.let { serviceHandler?.removeCallbacks(it) }
            retryRunnable?.let { serviceHandler?.removeCallbacks(it) }
            retryRunnable = null

            if (isCapturing.get()) {
                Log.d(TAG, "AlarmManager tick skipped: capture already in progress.")
                scheduleNextWakeAlarm(fromNow = true)
                return START_STICKY
            }

            // Arm the next wake alarm based on interval
            scheduleNextWakeAlarm(fromNow = true)

            Thread {
                try {
                    captureAndSaveLocation()
                } catch (e: Exception) {
                    DebugLogger.log("ALARM_MANAGER", "ALARM_EXECUTION_ERROR", "FAILURE", details = e.message)
                    Log.e(TAG, "Error in AlarmManager WAKEUP tick execution", e)
                } finally {
                    // Re-arm Handler for currentIntervalMs from completion of capture
                    val currentIntervalMs = getIntervalMs()
                    if (currentIntervalMs < 60_000L) {
                        trackingRunnable?.let { runnable ->
                            serviceHandler?.removeCallbacks(runnable)
                            serviceHandler?.postDelayed(runnable, currentIntervalMs)
                        }
                    }
                }
            }.start()
            return START_STICKY
        }

        val newUserId = intent?.getStringExtra("userId")
        val newApiBaseUrl = intent?.getStringExtra("apiBaseUrl")
        val newUserToken = intent?.getStringExtra("userToken")

        if (!newUserToken.isNullOrEmpty()) {
            getSharedPreferences("AttendanceSessionPrefs", Context.MODE_PRIVATE)
                .edit().putString("userToken", newUserToken).apply()
        }

        if (newUserId != null) {
            userId = newUserId
            sharedPrefs.edit().putString("userId", newUserId).putBoolean("isClockedIn", true).apply()
        } else {
            userId = sharedPrefs.getString("userId", null)
        }

        if (newApiBaseUrl != null) {
            apiBaseUrl = newApiBaseUrl
            sharedPrefs.edit().putString("apiBaseUrl", newApiBaseUrl).apply()
        } else {
            apiBaseUrl = sharedPrefs.getString("apiBaseUrl", null)
        }

        if (!startForegroundNotification()) {
            return START_NOT_STICKY
        }

        if (trackingRunnable == null) {
            startTrackingLoop()
        }
        locationRepository.scheduleTrackingHeartbeat()

        // Note: WakeLock is acquired per alarm tick (30s max) in ACTION_ALARM_TICK handler.
        // Do NOT hold a persistent WakeLock here — it keeps CPU alive even after clock-out.

        // Sticky so Android restarts the service if it kills the process mid-shift. This is safe
        // after clock-out: such a restart hits the isClockedIn check above and the service stops itself.
        return START_STICKY
    }

    /** Returns false (and stops the service) if the service could not enter the foreground. */
    private fun startForegroundNotification(): Boolean {
        if (!hasLocationPermission(this)) {
            Log.e(TAG, "Location permission not granted. Cannot run location foreground service.")
            DebugLogger.log("FOREGROUND_SERVICE", "START_FOREGROUND", "FAILURE", details = "Location permission not granted")
            return abortForegroundStart()
        }

        val notificationBuilder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        notificationBuilder
            .setContentTitle("HRMS Location Tracker")
            .setContentText("Active background attendance verification running.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
        packageManager.getLaunchIntentForPackage(packageName)?.let { launchIntent ->
            notificationBuilder.setContentIntent(
                PendingIntent.getActivity(this, 0, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            )
        }
        val notification = notificationBuilder.build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            isInForeground = true
            TrackingAlerts.clearTrackingInterrupted(this)
            return true
        } catch (e: Exception) {
            // SecurityException (permission revoked), ForegroundServiceStartNotAllowedException
            // (Android 12+, started from background, e.g. by the inexact fallback alarm) and
            // ForegroundServiceTypeException (Android 14+) all land here. Uncaught, they crash the app.
            Log.e(TAG, "Could not start foreground service: ${e.javaClass.simpleName}", e)
            DebugLogger.log("FOREGROUND_SERVICE", "START_FOREGROUND", "FAILURE", details = "Exception: ${e.javaClass.simpleName} | Message: ${e.message}")
            return abortForegroundStart()
        }
    }

    private fun abortForegroundStart(): Boolean {
        isInForeground = false
        // Mid-shift, pings stop until the app is opened again: tell the user instead of failing silently.
        if (getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE).getBoolean("isClockedIn", false)) {
            TrackingAlerts.showTrackingInterrupted(this)
        }
        stopSelf()
        return false
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = if (isTranssion) NotificationManager.IMPORTANCE_DEFAULT else NotificationManager.IMPORTANCE_LOW
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "HRMS Location Tracking Channel",
                importance
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(serviceChannel)
        }
    }

    private fun getIntervalMs(): Long {
        val sharedPrefs = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val intervalStr = sharedPrefs.getString("locationUpdateInterval", "30 Seconds") ?: "30 Seconds"
        val cleanStr = intervalStr.lowercase(Locale.ROOT).trim()

        val digitsOnly = cleanStr.replace(Regex("[^0-9]"), "")
        val seconds = if (digitsOnly.isNotEmpty()) {
            try {
                val parsed = digitsOnly.toLong()
                if (cleanStr.contains("hour") || cleanStr.contains("hr")) {
                    parsed * 3600L
                } else if (cleanStr.contains("min")) {
                    parsed * 60L
                } else {
                    parsed
                }
            } catch (e: Exception) {
                30L
            }
        } else {
            30L
        }

        val finalSeconds = seconds.coerceIn(1L, 86400L)
        return finalSeconds * 1000L
    }

    /* =========================================================================
     * [PREVIOUS VERSION OF CODE - COMMENTED OUT FOR COMPARISON]:
     * // Problem: Only scheduled from "now + intervalMs". When an early ping happened,
     * // this pushed the entire subsequent schedule +15m into the future (causing late pings).
     * // In addition, on Android 12+, setExactAndAllowWhileIdle without SCHEDULE_EXACT_ALARM
     * // permission fell back to inexact alarms that Android Doze batched/delayed by 15-30m.
     *
     * private fun scheduleNextWakeAlarm() {
     *     val sharedPrefs = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
     *     val isClockedIn = sharedPrefs.getBoolean("isClockedIn", false)
     *     if (!isClockedIn) return
     *     val intervalMs = getIntervalMs()
     *     val triggerAtMs = SystemClock.elapsedRealtime() + intervalMs
     *     if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
     *         alarmManager.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAtMs, pendingIntent)
     *     } else {
     *         alarmManager.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAtMs, pendingIntent)
     *     }
     * }
     * =========================================================================
     * [LATEST VERSION OF CODE (ACTIVE)]:
     * Supports `fromNow = false` to align alarms with the original 15m cadence on restart,
     * and uses `setAlarmClock()` to pierce Android Doze mode and aggressive OEM sleep.
     * ========================================================================= */
    private fun scheduleNextWakeAlarm(fromNow: Boolean = true, isFallback: Boolean = false) {
        val sharedPrefs = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val isClockedIn = sharedPrefs.getBoolean("isClockedIn", false)
        if (!isClockedIn) return

        try {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(this, LocationTrackingService::class.java).apply {
                action = ACTION_ALARM_TICK
            }
            val pendingIntent = PendingIntent.getService(
                this,
                888,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val intervalMs = getIntervalMs()
            val now = System.currentTimeMillis()
            // When used as an idle/Doze fallback for sub-minute Handler loops, add a 5s buffer
            // so AlarmManager doesn't race against the Handler while the phone is awake.
            val effectiveIntervalMs = if (isFallback && intervalMs < 60_000L) intervalMs + 5000L else intervalMs

            val triggerAtWallClockMs = if (!fromNow && lastSavedTimestamp > 0) {
                val nextExpected = lastSavedTimestamp + effectiveIntervalMs
                if (nextExpected > now + 5000L) nextExpected else now + effectiveIntervalMs
            } else {
                now + effectiveIntervalMs
            }

            val nextTriggerDate = Date(triggerAtWallClockMs)
            val delaySeconds = Math.max(1L, (triggerAtWallClockMs - now) / 1000L)

            val canScheduleExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                alarmManager.canScheduleExactAlarms()
            } else {
                true
            }

            if (canScheduleExact) {
                DebugLogger.log("ALARM_MANAGER", "ALARM_PERMISSION", "GRANTED", details = "canScheduleExactAlarms() = true")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val alarmClockInfo = AlarmManager.AlarmClockInfo(triggerAtWallClockMs, pendingIntent)
                    alarmManager.setAlarmClock(alarmClockInfo, pendingIntent)
                    DebugLogger.log("ALARM_MANAGER", "ALARM_SCHEDULED", "SUCCESS_ALARM_CLOCK", details = "setAlarmClock scheduled for +${delaySeconds}s ($nextTriggerDate)")
                } else {
                    alarmManager.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + (triggerAtWallClockMs - now), pendingIntent)
                    DebugLogger.log("ALARM_MANAGER", "ALARM_SCHEDULED", "SUCCESS", details = "setExact scheduled for +${delaySeconds}s ($nextTriggerDate)")
                }
                Log.d(TAG, "Scheduled setAlarmClock WAKEUP timer for +${delaySeconds} seconds ($nextTriggerDate).")
            } else {
                DebugLogger.log("ALARM_MANAGER", "ALARM_PERMISSION", "DENIED", details = "canScheduleExactAlarms() = false on Android 12+. Opening settings prompt and falling back to setAndAllowWhileIdle.")
                Log.w(TAG, "Exact Alarm permission missing (canScheduleExactAlarms=false). Prompting user and falling back to setAndAllowWhileIdle.")

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        val reqIntent = Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                            data = android.net.Uri.parse("package:$packageName")
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        startActivity(reqIntent)
                        DebugLogger.log("ALARM_MANAGER", "ALARM_PERMISSION_REQUESTED", "REQUESTED", details = "Opened Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM for $packageName")
                    } catch (intentErr: Exception) {
                        DebugLogger.log("ALARM_MANAGER", "ALARM_PERMISSION_REQUESTED", "FAILURE", details = "Could not open exact alarm settings: ${intentErr.message}")
                    }
                }

                try {
                    val triggerAtMs = SystemClock.elapsedRealtime() + (triggerAtWallClockMs - now)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAtMs, pendingIntent)
                    } else {
                        alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAtMs, pendingIntent)
                    }
                    DebugLogger.log("ALARM_MANAGER", "ALARM_SCHEDULED", "SUCCESS_FALLBACK", details = "Inexact Alarm scheduled as fallback for +${delaySeconds}s ($nextTriggerDate)")
                } catch (fallbackErr: Exception) {
                    DebugLogger.log("ALARM_MANAGER", "ALARM_FAILED", "FAILURE", details = "Fallback alarm schedule error: ${fallbackErr.message}")
                }
            }
        } catch (e: Exception) {
            DebugLogger.log("ALARM_MANAGER", "ALARM_FAILED", "FAILURE", details = "Exception: ${e.javaClass.simpleName} | Message: ${e.message}")
            Log.e(TAG, "Failed to schedule AlarmManager WAKEUP timer", e)
        }
    }

    private fun cancelWakeAlarm() {
        try {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(this, LocationTrackingService::class.java).apply {
                action = ACTION_ALARM_TICK
            }
            val pendingIntent = PendingIntent.getService(
                this,
                888,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager.cancel(pendingIntent)
            DebugLogger.log("ALARM_MANAGER", "CANCEL_ALARM", "SUCCESS")
            Log.d(TAG, "Cancelled AlarmManager WAKEUP timer.")
        } catch (e: Exception) {
            DebugLogger.log("ALARM_MANAGER", "CANCEL_ALARM", "FAILURE", details = e.message)
            Log.e(TAG, "Failed to cancel AlarmManager WAKEUP timer", e)
        }
    }

    /* =========================================================================
     * [PREVIOUS VERSION OF CODE - COMMENTED OUT FOR COMPARISON]:
     * // Problem: Ran a continuous Handler loop alongside AlarmManager for 15-minute
     * // intervals, causing timer collisions (pings at 8m, 12m). On service restart,
     * // it immediately captured location even if only 2 minutes had passed since the last ping.
     *
     * private fun startTrackingLoop() {
     *     stopTrackingLoop()
     *     trackingRunnable = object : Runnable {
     *         override fun run() {
     *             captureAndSaveLocation()
     *             serviceHandler?.postDelayed(this, getIntervalMs())
     *             scheduleNextWakeAlarm()
     *         }
     *     }
     *     serviceHandler?.post(trackingRunnable!!)
     * }
     * =========================================================================
     * [LATEST VERSION OF CODE (ACTIVE)]:
     * For intervals >= 60s (15m), AlarmManager is the sole authoritative driver.
     * If the service restarts mid-interval, it checks (now - lastSaved) < intervalMs
     * and aligns the next alarm instead of immediately firing an early ping.
     * ========================================================================= */
    private fun startTrackingLoop(captureImmediately: Boolean = true) {
        stopTrackingLoop()

        val intervalMs = getIntervalMs()
        val nowElapsed = SystemClock.elapsedRealtime()

        // For long intervals (>= 1 minute, e.g. 5m, 10m, 15m, 30m configured from dashboard),
        // AlarmManager is the sole authoritative driver.
        // Running an independent Handler loop causes dual-timer collision (8m, 9m, 12m gaps).
        if (intervalMs >= 60_000L) {
            Log.d(TAG, "Dynamic dashboard interval is ${intervalMs / 1000}s. Using AlarmManager as master driver.")
            val now = System.currentTimeMillis()
            val lastSaved = lastSavedTimestamp
            val shouldCaptureNow = captureImmediately && (lastSaved == 0L || (now - lastSaved) >= intervalMs)
            if (shouldCaptureNow) {
                if (!isCapturing.get()) {
                    Thread {
                        try {
                            captureAndSaveLocation()
                        } catch (e: Exception) {
                            Log.e(TAG, "Error in initial location capture", e)
                        }
                    }.start()
                }
                scheduleNextWakeAlarm(fromNow = true)
            } else {
                scheduleNextWakeAlarm(fromNow = false)
            }
            return
        }

        // For high-frequency sub-minute intervals (e.g. 10s, 30s), use Handler loop while awake
        trackingRunnable = object : Runnable {
            override fun run() {
                val sharedPrefs = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
                val isClockedIn = sharedPrefs.getBoolean("isClockedIn", false)
                if (!isClockedIn) return

                val currentIntervalMs = getIntervalMs()
                if (isCapturing.get()) {
                    Log.d(TAG, "Handler tick skipped: capture already in progress.")
                    serviceHandler?.postDelayed(this, currentIntervalMs)
                    return
                }

                Thread {
                    try {
                        captureAndSaveLocation()
                    } catch (e: Exception) {
                        Log.e(TAG, "Error in captureAndSaveLocation tick", e)
                    } finally {
                        val interval = getIntervalMs()
                        if (interval < 60_000L) {
                            trackingRunnable?.let { runnable ->
                                serviceHandler?.postDelayed(runnable, interval)
                            }
                        }
                    }
                }.start()

                // Synchronize alarm so it acts as background sleep fallback with safety buffer
                scheduleNextWakeAlarm(fromNow = true, isFallback = true)
            }
        }

        if (captureImmediately) {
            trackingRunnable?.let { serviceHandler?.post(it) }
        } else {
            trackingRunnable?.let { serviceHandler?.postDelayed(it, intervalMs) }
        }
        scheduleNextWakeAlarm(fromNow = captureImmediately, isFallback = true)
    }

    private fun stopTrackingLoop() {
        cancelWakeAlarm()
        trackingRunnable?.let { serviceHandler?.removeCallbacks(it) }
        trackingRunnable = null
        retryRunnable?.let { serviceHandler?.removeCallbacks(it) }
        retryRunnable = null
    }

    private var pingCounter: Int
        get() = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE).getInt("pingCounter", 0)
        set(value) = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE).edit().putInt("pingCounter", value).apply()

    /* =========================================================================
     * [PREVIOUS VERSION OF CODE - COMMENTED OUT FOR COMPARISON]:
     * // Problem: Stored in volatile RAM memory. Whenever the OS killed and restarted
     * // the service (or user reopened the app), this reset to 0L, causing an immediate
     * // duplicate/early capture before the 15 minutes elapsed.
     *
     * @Volatile
     * private var lastSavedTimestamp: Long = 0L
     * =========================================================================
     * [LATEST VERSION OF CODE (ACTIVE)]:
     * Backed by SharedPreferences so last saved timestamp survives process restarts.
     * ========================================================================= */
    private var lastSavedTimestamp: Long
        get() = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE).getLong("lastSavedTimestamp", 0L)
        set(value) = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE).edit().putLong("lastSavedTimestamp", value).apply()

    @Volatile
    private var lastSavedElapsedRealtimeMs: Long = 0L
    @Volatile
    private var lastAttemptTimestamp: Long = 0L
    @Volatile
    private var lastSuccessfulFixTimestamp: Long = 0L

    /* =========================================================================
     * [PREVIOUS VERSION OF CODE - COMMENTED OUT FOR COMPARISON]:
     * // Problem: No atomic lock against overlapping captures. Debounce only checked
     * // wall-clock time < 2500ms, which failed to prevent premature pings on 15m intervals
     * // and could be confused by NTP/clock adjustments. WakeLock was acquired on the caller thread.
     *
     * private fun captureAndSaveLocation() {
     *     val now = System.currentTimeMillis()
     *     synchronized(this) {
     *         if (now - lastSavedTimestamp < 2500L) {
     *             return
     *         }
     *         lastSavedTimestamp = now
     *     }
     *     ...
     * }
     * =========================================================================
     * [LATEST VERSION OF CODE (ACTIVE)]:
     * Uses atomic isCapturing, acquires 40s WakeLock inside try-finally, and uses
     * monotonic elapsedRealtime with 85% interval window debounce.
     * ========================================================================= */
    private fun captureAndSaveLocation(isRetry: Boolean = false, retryAttempt: Int = 0) {
        if (!isCapturing.compareAndSet(false, true)) {
            Log.d(TAG, "Location capture is already in progress. Skipping overlapping capture.")
            return
        }
        try {
            // Acquire temporary PARTIAL_WAKE_LOCK (40s safety limit) to keep CPU active during sampling.
            try {
                wakeLock?.acquire(40000L)
            } catch (e: Exception) {
                Log.w(TAG, "WakeLock acquire error", e)
            }

            val now = System.currentTimeMillis()
            val nowElapsed = SystemClock.elapsedRealtime()
            val intervalMs = getIntervalMs()

            // Strict debounce window:
            // Use 85% threshold across all intervals to prevent premature pings while accommodating normal jitter.
            val minGapMs = (intervalMs * 85 / 100).coerceAtLeast(3000L)

            synchronized(this) {
                val previousAttemptFailed = (lastAttemptTimestamp > 0 && lastSuccessfulFixTimestamp < lastAttemptTimestamp)
                val elapsedSinceLastSave = nowElapsed - lastSavedElapsedRealtimeMs
                if (!isRetry && !previousAttemptFailed && lastSavedElapsedRealtimeMs > 0L && elapsedSinceLastSave < minGapMs) {
                    val elapsedSec = elapsedSinceLastSave / 1000L
                    DebugLogger.log("LOCATION", "CAPTURE_SKIPPED", "DEBOUNCE_SUPPRESSED", details = "Suppressed capture after ${elapsedSec}s (minGap=${minGapMs / 1000}s for dashboard interval=${intervalMs / 1000}s)")
                    Log.d(TAG, "Suppressed duplicate location capture after ${elapsedSec}s.")
                    return
                }
                lastAttemptTimestamp = now
            }

        val sharedPrefs = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val activeUid = userId ?: sharedPrefs.getString("userId", null)
        if (activeUid.isNullOrEmpty()) {
            DebugLogger.log("LOCATION", "CAPTURE_SKIPPED", "SKIPPED", details = "userId is null or empty")
            Log.w(TAG, "[LocationCapture] captureAndSaveLocation skipped: userId is null or empty. Please clock in first.")
            return
        }

        val locationProvider = sharedPrefs.getString("locationProvider", "GPS Preferred") ?: "GPS Preferred"
        val gpsRatio = sharedPrefs.getInt("gpsRatioCount", 1).coerceAtLeast(1)
        val cellularRatio = sharedPrefs.getInt("cellularRatioCount", 2).coerceAtLeast(1)

        /* =========================================================================
         * [PREVIOUS VERSION OF CODE - COMMENTED OUT FOR COMPARISON]:
         * // Problem: If string was "GPS + Cellular", loose checking like
         * // locationProvider.contains("preferred") could misclassify ratio mode,
         * // or ratio mode (1 GPS : 2 Cellular) caused 45m-60m without GPS pins.
         *
         * val isGpsPreferred = locationProvider.contains("preferred", ignoreCase = true)
         * val isGpsOnly = locationProvider.contains("only", ignoreCase = true) && locationProvider.contains("gps", ignoreCase = true)
         * =========================================================================
         * [LATEST VERSION OF CODE (ACTIVE)]:
         * Exact normalized matching distinguishing GPS Only, Cellular Only, and Ratio sequences.
         * ========================================================================= */
        val cleanProvider = locationProvider.trim().lowercase(Locale.ROOT)
        val isGpsOnly = cleanProvider.contains("gps only") || cleanProvider == "gps_only" || cleanProvider == "gps"
        val isCellularOnly = cleanProvider.contains("cellular only") || cleanProvider == "cellular_only" || cleanProvider == "cellular"
        val isGpsAndCellular = (cleanProvider.contains("cellular") && cleanProvider.contains("gps")) || cleanProvider.contains("ratio")
        val isGpsPreferred = cleanProvider.contains("preferred") || (!isGpsOnly && !isCellularOnly && !isGpsAndCellular)

        val isGpsTurn = when {
            isGpsOnly || isGpsPreferred -> true
            isCellularOnly -> false
            isGpsAndCellular -> {
                val cycleLength = gpsRatio + cellularRatio
                val stepInCycle = pingCounter % cycleLength
                stepInCycle < gpsRatio
            }
            else -> true
        }
        pingCounter++

        val timestamp = System.currentTimeMillis()
        val dateString = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date(timestamp))
        val battery = getBatteryLevel()
        val batteryTemp = getBatteryTemperature()

        var location: Location? = null
        var fixEvaluation: FixEvaluation? = null
        var rejectedCandidate: FixCandidate? = null
        var captureSource: String? = null
        var validationStatus: String? = null
        var locationSource = OfflineLocation.SOURCE_GPS
        var trackingMethod = "GPS"
        var cellInfoData: CellTowerInfoData? = null

        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val isLocationMasterEnabled = try {
            val masterEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                locationManager.isLocationEnabled
            } else true
            val gpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            val networkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            masterEnabled && (gpsEnabled || networkEnabled)
        } catch (e: Exception) {
            false
        }

        if (isLocationMasterEnabled) {
            TrackingAlerts.clearLocationOff(this)
        } else {
            TrackingAlerts.showLocationOff(this)
        }

        if (!isLocationMasterEnabled) {
            locationSource = OfflineLocation.SOURCE_NO_LOCATION
            trackingMethod = "GPS_OFF"
            cellInfoData = getCellTowerInfo()
            DebugLogger.log("LOCATION", "GPS_OFF_DETECTED", "WARNING", details = "Location master switch is turned OFF by user. Sending GPS_OFF status without coordinates.")
        } else if (isGpsTurn) {
            DebugLogger.log("LOCATION", "GPS_STARTED", "PENDING", details = "Requesting validated location fix [Ping #$pingCounter (GPS)]...")

            // Every source, including the cached lastLocation, must pass the same age/accuracy/repeat
            // checks; the first fix that passes is recorded. A fix that fails is never stored as a position.
            for (source in FIX_SOURCES_IN_ORDER) {
                val raw = fetchFusedFix(source) ?: continue
                val candidate = raw.toFixCandidate(source)
                val evaluation = evaluateAndReserveFix(candidate, sharedPrefs)
                logFixEvaluation(raw, candidate, evaluation)
                fixEvaluation = evaluation
                if (evaluation.isAccepted) {
                    location = raw
                    captureSource = source
                    locationSource = locationSourceFor(source)
                    break
                }
                rejectedCandidate = candidate
            }
            validationStatus = fixEvaluation?.verdict?.name ?: NO_FIX_STATUS

            if (location == null) {
                captureSource = rejectedCandidate?.source
                if (isGpsOnly) {
                    locationSource = OfflineLocation.SOURCE_GPS
                    trackingMethod = "GPS"
                    DebugLogger.log("LOCATION", "GPS_ONLY_NO_VALID_FIX", "WARNING", details = "No fix passed validation ($validationStatus). Recording without coordinates; GPS-only mode has no cellular fallback.")
                } else {
                    cellInfoData = getCellTowerInfo()
                    if (cellInfoData != null && cellInfoData.cellId != null) {
                        locationSource = OfflineLocation.SOURCE_CELLULAR
                        trackingMethod = "CELLULAR"
                        DebugLogger.log("LOCATION", "CELLULAR_FALLBACK", "WARNING", details = "CellTowerInfo: CellId=${cellInfoData.cellId}, Type=${cellInfoData.type}")
                    } else {
                        locationSource = OfflineLocation.SOURCE_NO_LOCATION
                        trackingMethod = "UNAVAILABLE"
                        DebugLogger.log("LOCATION", "LOCATION_UNAVAILABLE", "FAILURE", details = "GPS, Cellular, and Last Known location unavailable")
                    }
                }
            }
        } else {
            // Cellular Turn (Pings #2 and #3 in the cycle)
            DebugLogger.log("LOCATION", "CELLULAR_STARTED", "PENDING", details = "Capturing Cellular ping for battery optimization [Ping #$pingCounter (Cellular)]...")
            cellInfoData = getCellTowerInfo()
            if (cellInfoData != null && cellInfoData.cellId != null) {
                locationSource = OfflineLocation.SOURCE_CELLULAR
                trackingMethod = "CELLULAR"
                DebugLogger.log("LOCATION", "CELLULAR_SUCCESS", "SUCCESS", details = "CellTowerInfo: CellId=${cellInfoData.cellId}, Type=${cellInfoData.type}")
            } else {
                // An earlier fix is not re-recorded here: that would store an old position under a new timestamp.
                locationSource = OfflineLocation.SOURCE_NO_LOCATION
                trackingMethod = "UNAVAILABLE"
                DebugLogger.log("LOCATION", "LOCATION_UNAVAILABLE", "FAILURE", details = "Cell tower info unavailable for cellular ping")
            }
        }

        // When no fix was accepted, the rejected fix's metadata (not its coordinates) is kept so the
        // server and dashboard can show why this record has no position.
        val diagnosticFix = if (location == null) rejectedCandidate else null
        val isMock = location?.isMockCompat() ?: diagnosticFix?.isMock ?: false

        val recordId = UUID.randomUUID().toString()
        val offlineRecord = OfflineLocation(
            id = recordId,
            userId = activeUid,
            timestamp = timestamp,
            date = dateString,
            latitude = location?.latitude,
            longitude = location?.longitude,
            accuracy = (location?.accuracy ?: diagnosticFix?.accuracyMeters)?.toDouble(),
            provider = location?.provider ?: diagnosticFix?.provider,
            trackingMethod = trackingMethod,
            locationSource = locationSource,
            batteryLevel = battery,
            batteryTemperature = batteryTemp,
            isMock = isMock,
            address = null,
            cellId = cellInfoData?.cellId,
            lac = cellInfoData?.lac,
            tac = cellInfoData?.tac,
            mcc = cellInfoData?.mcc,
            mnc = cellInfoData?.mnc,
            signalStrength = cellInfoData?.signalStrength,
            networkType = cellInfoData?.type,
            uploadStatus = OfflineLocation.UPLOAD_STATUS_PENDING,
            retryCount = 0,
            createdAt = timestamp,
            updatedAt = timestamp,
            fixTimestamp = location?.time ?: diagnosticFix?.fixTimeMs,
            fixElapsedRealtimeNanos = location?.elapsedRealtimeNanos ?: diagnosticFix?.fixElapsedRealtimeNanos,
            fixAgeMs = fixEvaluation?.fixAgeMs,
            speed = location?.takeIf { it.hasSpeed() }?.speed,
            bearing = location?.takeIf { it.hasBearing() }?.bearing,
            captureSource = captureSource,
            validationStatus = validationStatus
        )

        val locDetails = "Lat=${offlineRecord.latitude}, Lng=${offlineRecord.longitude}, Acc=${offlineRecord.accuracy}, " +
            "Provider=${offlineRecord.provider}, RecordTime=$timestamp, FixTime=${offlineRecord.fixTimestamp}, " +
            "FixAgeMs=${offlineRecord.fixAgeMs}, ElapsedRealtimeNanos=${offlineRecord.fixElapsedRealtimeNanos}, " +
            "Speed=${offlineRecord.speed}, Bearing=${offlineRecord.bearing}, Alt=${location?.altitude}, Mock=$isMock, " +
            "Battery=$battery%, Method=$trackingMethod, Source=$locationSource, CaptureSource=$captureSource, Validation=$validationStatus"
        DebugLogger.log("LOCATION", "CAPTURE_COMPLETE", "SUCCESS", uuid = recordId, details = locDetails)
        Log.d(TAG, "[LocationCapture] Captured location record: ID = $recordId, $locDetails")

        // Save entry directly to Room SQLite
        locationRepository.saveLocation(offlineRecord)

        synchronized(this) {
            lastSavedTimestamp = System.currentTimeMillis()
            lastSavedElapsedRealtimeMs = SystemClock.elapsedRealtime()
            if (location != null) {
                lastSuccessfulFixTimestamp = lastSavedTimestamp
            }
        }

        // Priority 1: If location fix produced no valid coordinates, schedule at most 1 quick recovery retry after 5 seconds
        if (location == null && isLocationMasterEnabled && !isRetry && retryAttempt < 1) {
            Log.w(TAG, "[LocationCapture] Fix produced no valid coordinates ($validationStatus). Scheduling 1 quick recovery retry in 5s.")
            retryRunnable?.let { serviceHandler?.removeCallbacks(it) }
            val r = Runnable {
                val prefs = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
                if (prefs.getBoolean("isClockedIn", false) && !isCapturing.get()) {
                    Thread {
                        try {
                            captureAndSaveLocation(isRetry = true, retryAttempt = 1)
                        } catch (e: Exception) {
                            Log.e(TAG, "Error in quick recovery retry capture", e)
                        }
                    }.start()
                }
            }
            retryRunnable = r
            serviceHandler?.postDelayed(r, 5000L)
        }
    } finally {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "WakeLock release error", e)
        }
        isCapturing.set(false)
    }
}

    /* =========================================================================
     * [PREVIOUS VERSION OF CODE - COMMENTED OUT FOR COMPARISON]:
     * // Problem: For a 15-minute interval, GPS timeout was hard-capped at 12 seconds:
     * // (15 * 60 * 1000 * 40 / 100000L).coerceIn(4L, 12L) == 12L.
     * // Cold GPS hardware indoors takes 15-25 seconds to lock onto satellites.
     * // Timing out at 12s caused 4 consecutive failed fixes (lat=null, lng=null),
     * // which resulted in a 1-HOUR EMPTY GAP on the map dashboard!
     *
     * private fun getGpsTimeoutSeconds(): Long {
     *     val intervalMs = getIntervalMs()
     *     return (intervalMs * 40 / 100000L).coerceIn(4L, 12L)
     * }
     * private fun getBalancedTimeoutSeconds(): Long = 3L
     * =========================================================================
     * [LATEST VERSION OF CODE (ACTIVE)]:
     * Grants 25s for GPS and 8s for Network fallback for long intervals (>= 1m).
     * ========================================================================= */
    private fun getGpsTimeoutSeconds(): Long {
        val sharedPrefs = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val configured = sharedPrefs.getLong("gpsTimeoutSeconds", 0L)
        if (configured > 0) return configured
        val intervalMs = getIntervalMs()
        // For long intervals (>= 1 min, e.g. 5m, 15m), GPS has been dormant and cold.
        // Grant up to 25 seconds (safe within the 40s WakeLock) to acquire satellite TTFF.
        return if (intervalMs >= 60_000L) {
            25L
        } else {
            (intervalMs * 40 / 100000L).coerceIn(4L, 12L)
        }
    }

    private fun getBalancedTimeoutSeconds(): Long {
        val sharedPrefs = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
        val configured = sharedPrefs.getLong("balancedTimeoutSeconds", 0L)
        if (configured > 0) return configured
        val intervalMs = getIntervalMs()
        return if (intervalMs >= 60_000L) 8L else 3L
    }

    /**
     * Executes GPS acquisition following the progressive waiting ladder flowchart:
     * 1. Start single high-accuracy location request.
     * 2. Stage 1: Wait up to 12s. If valid fresh fix received -> return immediately.
     * 3. Stage 2: If no fix at 12s, extend waiting by 5s (wait until 17s).
     * 4. Stage 3: If no fix at 17s, extend waiting by 5s (wait until 22s).
     * 5. Stage 4: If no fix at 22s, extend waiting by 3s (wait until 25s).
     * 6. If fix received at any stage -> cancel timeout callbacks, return fix.
     * 7. If 25s reached without fix -> cancel request, record timeout, return null.
     */
    private fun fetchFusedGpsWithProgressiveStages(): Location? {
        val token = CancellationTokenSource()
        val latch = java.util.concurrent.CountDownLatch(1)
        var resultLocation: Location? = null

        val request = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setGranularity(Granularity.GRANULARITY_FINE)
            .setMaxUpdateAgeMillis(MAX_CACHED_FIX_AGE_MS)
            .setDurationMillis(25000L) // 25s total ceiling
            .build()

        return try {
            val task = fusedLocationClient.getCurrentLocation(request, token.token)
            task.addOnSuccessListener { loc ->
                if (loc != null) {
                    resultLocation = loc
                    latch.countDown()
                }
            }
            task.addOnFailureListener {
                latch.countDown()
            }

            // Progressive ladder: 12s -> +5s (17s) -> +5s (22s) -> +3s (25s)
            val stages = listOf(12L, 5L, 5L, 3L)
            var elapsedSeconds = 0L

            for ((index, stepSeconds) in stages.withIndex()) {
                elapsedSeconds += stepSeconds
                val stageName = when (index) {
                    0 -> "Stage 1 (12s initial timer)"
                    1 -> "Stage 2 (+5s extension, wait until 17s)"
                    2 -> "Stage 3 (+5s extension, wait until 22s)"
                    else -> "Stage 4 (+3s extension, wait until 25s)"
                }

                DebugLogger.log("LOCATION", "GPS_STAGE_WAIT", "PENDING", details = "Awaiting GPS: $stageName")
                val completed = latch.await(stepSeconds, TimeUnit.SECONDS)

                if (completed && resultLocation != null) {
                    DebugLogger.log(
                        "LOCATION",
                        "GPS_FIX_ACQUIRED",
                        "SUCCESS",
                        details = "Valid fresh GPS fix received at ${elapsedSeconds}s ($stageName). Cancelling all remaining timeout callbacks."
                    )
                    Log.d(TAG, "[GPS Flowchart] Fix acquired at ${elapsedSeconds}s ($stageName).")
                    return resultLocation
                }

                if (index < stages.lastIndex) {
                    val nextExt = stages[index + 1]
                    val nextTarget = elapsedSeconds + nextExt
                    DebugLogger.log(
                        "LOCATION",
                        "GPS_TIMEOUT_EXTENDED",
                        "WARNING",
                        details = "No fix received at ${elapsedSeconds}s. Extending waiting by ${nextExt}s (Wait until ${nextTarget}s)..."
                    )
                    Log.d(TAG, "[GPS Flowchart] No fix at ${elapsedSeconds}s. Extending by ${nextExt}s (until ${nextTarget}s)...")
                }
            }

            // If 25 seconds reached without fix: Cancel location request and record acquisition timeout
            token.cancel()
            DebugLogger.log(
                "LOCATION",
                "GPS_ACQUISITION_TIMEOUT",
                "FAILURE",
                details = "No valid fresh GPS fix received after full 25s ladder (12s + 5s + 5s + 3s). Cancelled location request."
            )
            Log.w(TAG, "[GPS Flowchart] GPS acquisition timed out after 25s. Cancelled location request.")
            null
        } catch (e: Exception) {
            token.cancel()
            DebugLogger.log("LOCATION", "GPS_REQUEST_ERROR", "FAILURE", details = "${e.javaClass.simpleName}: ${e.message}")
            Log.e(TAG, "[GPS Flowchart] Error in GPS request", e)
            null
        }
    }

    private fun fetchFusedFix(source: String): Location? {
        val token = CancellationTokenSource()
        return try {
            when (source) {
                FixSource.FUSED_HIGH_ACCURACY -> {
                    fetchFusedGpsWithProgressiveStages()
                }
                FixSource.FUSED_BALANCED -> {
                    val timeout = getBalancedTimeoutSeconds()
                    val request = CurrentLocationRequest.Builder()
                        .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                        .setMaxUpdateAgeMillis(MAX_CACHED_FIX_AGE_MS)
                        .setDurationMillis(timeout * 1000L)
                        .build()
                    Tasks.await(fusedLocationClient.getCurrentLocation(request, token.token), timeout, TimeUnit.SECONDS)
                }
                else -> Tasks.await(fusedLocationClient.lastLocation, 3, TimeUnit.SECONDS)
            }
        } catch (e: Exception) {
            token.cancel()
            DebugLogger.log("LOCATION", "FIX_REQUEST_FAILED", "FAILURE", details = "Source=$source | ${e.javaClass.simpleName}: ${e.message}")
            null
        }
    }

    // Evaluate and, if accepted, remember the fix in one locked step so the handler loop and the
    // alarm tick cannot both record the same cached fix.
    private fun evaluateAndReserveFix(candidate: FixCandidate, prefs: SharedPreferences): FixEvaluation =
        synchronized(recordedFixLock) {
            val evaluation = locationValidator.evaluate(candidate, SystemClock.elapsedRealtimeNanos(), readLastRecordedFix(prefs))
            if (evaluation.isAccepted) {
                prefs.edit()
                    .putLong(PREF_LAST_FIX_TIME, candidate.fixTimeMs)
                    .putLong(PREF_LAST_FIX_LAT_BITS, candidate.latitude.toRawBits())
                    .putLong(PREF_LAST_FIX_LNG_BITS, candidate.longitude.toRawBits())
                    .apply()
            }
            evaluation
        }

    private fun readLastRecordedFix(prefs: SharedPreferences): RecordedFix? {
        if (!prefs.contains(PREF_LAST_FIX_TIME)) return null
        return RecordedFix(
            fixTimeMs = prefs.getLong(PREF_LAST_FIX_TIME, 0L),
            latitude = Double.fromBits(prefs.getLong(PREF_LAST_FIX_LAT_BITS, 0L)),
            longitude = Double.fromBits(prefs.getLong(PREF_LAST_FIX_LNG_BITS, 0L))
        )
    }

    private fun locationSourceFor(fixSource: String): String = when (fixSource) {
        FixSource.FUSED_HIGH_ACCURACY -> OfflineLocation.SOURCE_GPS
        FixSource.FUSED_BALANCED -> OfflineLocation.SOURCE_NETWORK
        else -> OfflineLocation.SOURCE_LAST_KNOWN
    }

    private fun Location.toFixCandidate(source: String) = FixCandidate(
        latitude = latitude,
        longitude = longitude,
        accuracyMeters = if (hasAccuracy()) accuracy else null,
        fixTimeMs = time,
        fixElapsedRealtimeNanos = elapsedRealtimeNanos,
        provider = provider,
        isMock = isMockCompat(),
        source = source
    )

    @Suppress("DEPRECATION")
    private fun Location.isMockCompat(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) isMock else isFromMockProvider

    private fun logFixEvaluation(raw: Location, candidate: FixCandidate, evaluation: FixEvaluation) {
        val details = "Source=${candidate.source} | Lat=${candidate.latitude} | Lng=${candidate.longitude} | " +
            "Acc=${candidate.accuracyMeters}m | Provider=${candidate.provider} | FixTime=${candidate.fixTimeMs} | " +
            "FixAgeMs=${evaluation.fixAgeMs} | ElapsedRealtimeNanos=${candidate.fixElapsedRealtimeNanos} | " +
            "Speed=${if (raw.hasSpeed()) raw.speed else null} | Bearing=${if (raw.hasBearing()) raw.bearing else null} | " +
            "Mock=${candidate.isMock} | ${evaluation.detail}"
        DebugLogger.log("LOCATION", "FIX_EVALUATED", evaluation.verdict.name, details = details)
        Log.d(TAG, "[FixValidation] ${evaluation.verdict}: $details")
    }

    private fun getBatteryLevel(): Int {
        val bm = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun getBatteryTemperature(): Float {
        val intent = registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val temp = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
        return temp / 10.0f
    }

    private data class CellTowerInfoData(
        val cellId: Int?,
        val lac: Int?,
        val tac: Int?,
        val mcc: Int?,
        val mnc: Int?,
        val signalStrength: Int?,
        val type: String
    )

    private fun getCellTowerInfo(): CellTowerInfoData? {
        val tm = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        try {
            val cellInfoList: List<CellInfo>? = tm.allCellInfo
            if (cellInfoList != null) {
                for (info in cellInfoList) {
                    if (info.isRegistered) {
                        when (info) {
                            is CellInfoLte -> {
                                val identity = info.cellIdentity
                                val signal = info.cellSignalStrength
                                val mcc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) identity.mccString?.toIntOrNull() else identity.mcc
                                val mnc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) identity.mncString?.toIntOrNull() else identity.mnc
                                val rawCi = identity.ci.takeIf { it != CellInfo.UNAVAILABLE && it != Int.MAX_VALUE && it > 0 }
                                val rawTac = identity.tac.takeIf { it != CellInfo.UNAVAILABLE && it != Int.MAX_VALUE && it > 0 }
                                if (rawCi != null) {
                                    return CellTowerInfoData(
                                        cellId = rawCi,
                                        lac = null,
                                        tac = rawTac,
                                        mcc = mcc?.takeIf { it > 0 },
                                        mnc = mnc?.takeIf { it >= 0 },
                                        signalStrength = signal.dbm.takeIf { it != CellInfo.UNAVAILABLE },
                                        type = "LTE"
                                    )
                                }
                            }
                            is CellInfoGsm -> {
                                val identity = info.cellIdentity
                                val signal = info.cellSignalStrength
                                val mcc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) identity.mccString?.toIntOrNull() else identity.mcc
                                val mnc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) identity.mncString?.toIntOrNull() else identity.mnc
                                val rawCid = identity.cid.takeIf { it != CellInfo.UNAVAILABLE && it != Int.MAX_VALUE && it > 0 }
                                val rawLac = identity.lac.takeIf { it != CellInfo.UNAVAILABLE && it != Int.MAX_VALUE && it > 0 }
                                if (rawCid != null) {
                                    return CellTowerInfoData(
                                        cellId = rawCid,
                                        lac = rawLac,
                                        tac = null,
                                        mcc = mcc?.takeIf { it > 0 },
                                        mnc = mnc?.takeIf { it >= 0 },
                                        signalStrength = signal.dbm.takeIf { it != CellInfo.UNAVAILABLE },
                                        type = "GSM"
                                    )
                                }
                            }
                            is CellInfoWcdma -> {
                                val identity = info.cellIdentity
                                val signal = info.cellSignalStrength
                                val mcc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) identity.mccString?.toIntOrNull() else identity.mcc
                                val mnc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) identity.mncString?.toIntOrNull() else identity.mnc
                                val rawCid = identity.cid.takeIf { it != CellInfo.UNAVAILABLE && it != Int.MAX_VALUE && it > 0 }
                                val rawLac = identity.lac.takeIf { it != CellInfo.UNAVAILABLE && it != Int.MAX_VALUE && it > 0 }
                                if (rawCid != null) {
                                    return CellTowerInfoData(
                                        cellId = rawCid,
                                        lac = rawLac,
                                        tac = null,
                                        mcc = mcc?.takeIf { it > 0 },
                                        mnc = mnc?.takeIf { it >= 0 },
                                        signalStrength = signal.dbm.takeIf { it != CellInfo.UNAVAILABLE },
                                        type = "WCDMA"
                                    )
                                }
                            }
                        }
                    }
                }
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException fetching CellInfo", e)
        } catch (e: Exception) {
            Log.e(TAG, "Exception fetching CellInfo", e)
        }
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        TrackingAlerts.clearLocationOff(this)
        stopTrackingLoop()
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager?.unregisterNetworkCallback(networkCallback!!)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to unregister network callback", e)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
