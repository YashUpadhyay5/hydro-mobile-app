package cellular.tracker

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
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
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.tasks.Tasks
import cellular.tracker.db.OfflineLocation
import cellular.tracker.repository.LocationRepository
import cellular.tracker.logging.DebugLogger
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit

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

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationRepository: LocationRepository

    private var wakeLock: PowerManager.WakeLock? = null
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var lastKnownValidLocation: Location? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForegroundNotification()

        DebugLogger.init(this)
        DebugLogger.log("FOREGROUND_SERVICE", "SERVICE_CREATED", "SUCCESS")
        serviceHandler = Handler(Looper.getMainLooper())
        
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        locationRepository = LocationRepository.getInstance(this)

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "HRMS:LocationTrackingWakeLock")
        
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
            val provider = intent.getStringExtra("locationProvider") ?: "GPS Preferred"
            val gRatio = intent.getIntExtra("gpsRatioCount", 1)
            val cRatio = intent.getIntExtra("cellularRatioCount", 6)
            val interval = intent.getStringExtra("locationUpdateInterval") ?: "10 Seconds"

            sharedPrefs.edit()
                .putString("locationProvider", provider)
                .putInt("gpsRatioCount", gRatio)
                .putInt("cellularRatioCount", cRatio)
                .putString("locationUpdateInterval", interval)
                .apply()

            DebugLogger.log("FOREGROUND_SERVICE", "SETTINGS_UPDATED_LIVE", "SUCCESS", details = "Dynamic settings applied: provider=$provider, interval=$interval")
            Log.d(TAG, "Dynamic settings updated live: provider=$provider, interval=$interval. Restarting tracking loop & alarms...")

            cancelWakeAlarm()
            stopTrackingLoop()
            startTrackingLoop()
            scheduleNextWakeAlarm()
            return START_STICKY
        }

        if (intent?.action == ACTION_ALARM_TICK) {
            Log.d(TAG, "AlarmManager WAKEUP tick received. Acquiring temporary WakeLock and capturing location...")
            DebugLogger.log("ALARM_MANAGER", "ALARM_TRIGGERED", "SUCCESS", details = "WAKEUP tick received")
            
            // Acquire temporary PARTIAL_WAKE_LOCK (30s) to keep CPU active during sampling
            try {
                if (wakeLock?.isHeld == false) {
                    wakeLock?.acquire(30000L)
                }
            } catch (e: Exception) {
                Log.w(TAG, "WakeLock acquire error", e)
            }

            Thread {
                try {
                    captureAndSaveLocation()
                } catch (e: Exception) {
                    DebugLogger.log("ALARM_MANAGER", "ALARM_EXECUTION_ERROR", "FAILURE", details = e.message)
                    Log.e(TAG, "Error in AlarmManager WAKEUP tick execution", e)
                }
                scheduleNextWakeAlarm()
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

        startForegroundNotification()

        if (trackingRunnable == null) {
            startTrackingLoop()
        }

        if (wakeLock?.isHeld == false) {
            wakeLock?.acquire(24 * 60 * 60 * 1000L) // 24 hours max timeout
        }

        return START_STICKY
    }

    private fun startForegroundNotification() {
        val notificationBuilder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        val notification = notificationBuilder
            .setContentTitle("HRMS Location Tracker")
            .setContentText("Active background attendance verification running.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException starting foreground service", e)
            stopSelf()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "HRMS Location Tracking Channel",
                NotificationManager.IMPORTANCE_LOW
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
                if (cleanStr.contains("min")) parsed * 60L else parsed
            } catch (e: Exception) {
                30L
            }
        } else {
            30L
        }

        val finalSeconds = seconds.coerceIn(1L, 86400L)
        return finalSeconds * 1000L
    }

    private fun scheduleNextWakeAlarm() {
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
            val triggerAtWallClockMs = System.currentTimeMillis() + intervalMs
            val nextTriggerDate = Date(triggerAtWallClockMs)

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
                    DebugLogger.log("ALARM_MANAGER", "ALARM_SCHEDULED", "SUCCESS_ALARM_CLOCK", details = "setAlarmClock scheduled for +${intervalMs / 1000}s. NextTriggerTime: $nextTriggerDate (triggerAtWallClockMs=$triggerAtWallClockMs)")
                } else {
                    alarmManager.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + intervalMs, pendingIntent)
                    DebugLogger.log("ALARM_MANAGER", "ALARM_SCHEDULED", "SUCCESS", details = "setExact scheduled for +${intervalMs / 1000}s. NextTriggerTime: $nextTriggerDate")
                }
                Log.d(TAG, "Scheduled setAlarmClock WAKEUP timer for +${intervalMs / 1000} seconds ($nextTriggerDate).")
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
                    val triggerAtMs = SystemClock.elapsedRealtime() + intervalMs
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAtMs, pendingIntent)
                    } else {
                        alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAtMs, pendingIntent)
                    }
                    DebugLogger.log("ALARM_MANAGER", "ALARM_SCHEDULED", "SUCCESS_FALLBACK", details = "Inexact Alarm scheduled as fallback for +${intervalMs / 1000}s. NextTriggerTime: $nextTriggerDate")
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

    private fun startTrackingLoop() {
        stopTrackingLoop()

        trackingRunnable = object : Runnable {
            override fun run() {
                val sharedPrefs = getSharedPreferences("LocationTrackingPrefs", Context.MODE_PRIVATE)
                val isClockedIn = sharedPrefs.getBoolean("isClockedIn", false)
                if (!isClockedIn) return

                val now = System.currentTimeMillis()
                val intervalMs = getIntervalMs()

                Thread {
                    try {
                        captureAndSaveLocation()
                    } catch (e: Exception) {
                        Log.e(TAG, "Error in captureAndSaveLocation tick", e)
                    }
                }.start()

                // Grid-aligned timer: aligns ticks to exact wall-clock boundaries (00s, 30s) to eliminate drift
                val offsetInCycle = now % intervalMs
                val delayUntilNextTick = (intervalMs - offsetInCycle).coerceAtLeast(1000L)
                serviceHandler?.postDelayed(this, delayUntilNextTick)
            }
        }

        serviceHandler?.post(trackingRunnable!!)
        scheduleNextWakeAlarm()
    }

    private fun stopTrackingLoop() {
        cancelWakeAlarm()
        trackingRunnable?.let { serviceHandler?.removeCallbacks(it) }
        trackingRunnable = null
    }

    private var pingCounter: Int = 0
    @Volatile
    private var lastSavedTimestamp: Long = 0L

    private fun captureAndSaveLocation() {
        val now = System.currentTimeMillis()
        synchronized(this) {
            if (now - lastSavedTimestamp < 2500L) {
                DebugLogger.log("LOCATION", "CAPTURE_SKIPPED", "DUPLICATE_SUPPRESSED", details = "Suppressed duplicate capture call within 2.5 seconds")
                Log.d(TAG, "Suppressed duplicate location capture within 2.5 seconds.")
                return
            }
            lastSavedTimestamp = now
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
        val cellularRatio = sharedPrefs.getInt("cellularRatioCount", 6).coerceAtLeast(1)

        val cleanProvider = locationProvider.trim().lowercase(Locale.ROOT)
        val isGpsTurn = when {
            cleanProvider.contains("gps only") || cleanProvider == "gps_only" || cleanProvider == "gps" -> true
            cleanProvider.contains("cellular only") || cleanProvider == "cellular_only" || cleanProvider == "cellular" -> false
            else -> {
                val cycleLength = gpsRatio + cellularRatio
                val stepInCycle = pingCounter % cycleLength
                stepInCycle < gpsRatio
            }
        }
        pingCounter++

        val timestamp = System.currentTimeMillis()
        val dateString = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date(timestamp))
        val battery = getBatteryLevel()
        val batteryTemp = getBatteryTemperature()

        var location: Location? = null
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

        if (!isLocationMasterEnabled) {
            location = null
            lastKnownValidLocation = null // Clear in-memory last known location so it is never reused when GPS is disabled
            locationSource = OfflineLocation.SOURCE_NO_LOCATION
            trackingMethod = "GPS_OFF"
            cellInfoData = getCellTowerInfo()
            DebugLogger.log("LOCATION", "GPS_OFF_DETECTED", "WARNING", details = "Location master switch is turned OFF by user. Sending GPS_OFF status without coordinates.")
        } else if (isGpsTurn) {
            DebugLogger.log("LOCATION", "GPS_STARTED", "PENDING", details = "Requesting high accuracy location fix (15s timeout) [Ping #$pingCounter (GPS)]...")

            // 1. Request Fresh Location via FusedLocationProviderClient (High Accuracy, 5s timeout)
            val tokenHigh = CancellationTokenSource()
            try {
                val locationTask = fusedLocationClient.getCurrentLocation(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    tokenHigh.token
                )
                location = Tasks.await(locationTask, 2, TimeUnit.SECONDS)
                if (location != null) {
                    lastKnownValidLocation = location
                    DebugLogger.log("LOCATION", "GPS_SUCCESS", "SUCCESS", details = "Lat=${location.latitude}, Lng=${location.longitude}, Acc=${location.accuracy}m, Provider=${location.provider}")
                }
            } catch (e: Exception) {
                tokenHigh.cancel()
            }

            // 2. Fallback to PRIORITY_BALANCED_POWER_ACCURACY (2s timeout - works in Doze / screen-off mode)
            if (location == null) {
                val tokenBalanced = CancellationTokenSource()
                try {
                    val balancedTask = fusedLocationClient.getCurrentLocation(
                        Priority.PRIORITY_BALANCED_POWER_ACCURACY,
                        tokenBalanced.token
                    )
                    location = Tasks.await(balancedTask, 2, TimeUnit.SECONDS)
                    if (location != null) {
                        locationSource = OfflineLocation.SOURCE_GPS
                        trackingMethod = "GPS"
                        lastKnownValidLocation = location
                        DebugLogger.log("LOCATION", "BALANCED_POWER_SUCCESS", "SUCCESS", details = "Lat=${location.latitude}, Lng=${location.longitude}, Acc=${location.accuracy}m")
                    }
                } catch (e: Exception) {
                    tokenBalanced.cancel()
                }
            }

            // 3. Fallback to getLastLocation() (3s timeout)
            if (location == null) {
                try {
                    val lastLocTask = fusedLocationClient.lastLocation
                    location = Tasks.await(lastLocTask, 3, TimeUnit.SECONDS)
                    if (location != null) {
                        locationSource = OfflineLocation.SOURCE_LAST_KNOWN
                        trackingMethod = "GPS"
                        lastKnownValidLocation = location
                        DebugLogger.log("LOCATION", "GPS_FALLBACK_SUCCESS", "SUCCESS", details = "Lat=${location.latitude}, Lng=${location.longitude}, Acc=${location.accuracy}m")
                    }
                } catch (e: Exception) {
                    DebugLogger.log("LOCATION", "GPS_FALLBACK_ERROR", "FAILURE", details = "Exception: ${e.javaClass.simpleName} | Message: ${e.message}")
                    Log.e(TAG, "[LocationCapture] Exception fetching lastLocation fallback", e)
                }
            }

            // 4. Fallback to lastKnownValidLocation only if fresh (< 5 mins) and GPS hardware is active
            if (location == null && lastKnownValidLocation != null && isLocationMasterEnabled) {
                val ageMs = now - lastKnownValidLocation!!.time
                if (ageMs < 300000L) {
                    location = lastKnownValidLocation
                    locationSource = OfflineLocation.SOURCE_LAST_KNOWN
                    trackingMethod = "GPS"
                    DebugLogger.log("LOCATION", "STATIONARY_PRESERVED_SUCCESS", "SUCCESS", details = "Using in-memory last known location (Age: ${ageMs/1000}s): Lat=${lastKnownValidLocation?.latitude}, Lng=${lastKnownValidLocation?.longitude}")
                }
            }

            if (location == null) {
                if (cleanProvider.contains("gps only") || cleanProvider == "gps_only" || cleanProvider == "gps") {
                    locationSource = OfflineLocation.SOURCE_GPS
                    trackingMethod = "GPS"
                    DebugLogger.log("LOCATION", "GPS_ONLY_ENFORCED", "SUCCESS", details = "Enforced GPS trackingMethod without Cellular fallback")
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
                // If cellular tower info is not available, check last known valid location as fallback (only if fresh < 5 mins)
                val ageMs = if (lastKnownValidLocation != null) now - lastKnownValidLocation!!.time else Long.MAX_VALUE
                if (lastKnownValidLocation != null && ageMs < 300000L && isLocationMasterEnabled) {
                    location = lastKnownValidLocation
                    locationSource = OfflineLocation.SOURCE_LAST_KNOWN
                    trackingMethod = "CELLULAR_LAST_KNOWN"
                    DebugLogger.log("LOCATION", "CELLULAR_LAST_KNOWN_SUCCESS", "SUCCESS", details = "Using last known location for cellular ping: Lat=${lastKnownValidLocation?.latitude}, Lng=${lastKnownValidLocation?.longitude}")
                } else {
                    locationSource = OfflineLocation.SOURCE_NO_LOCATION
                    trackingMethod = "UNAVAILABLE"
                    DebugLogger.log("LOCATION", "LOCATION_UNAVAILABLE", "FAILURE", details = "Cellular and Last Known location unavailable")
                }
            }
        }

        val isMock = if (location != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                location.isMock
            } else {
                @Suppress("DEPRECATION")
                location.isFromMockProvider
            }
        } else false

        val recordId = UUID.randomUUID().toString()
        val offlineRecord = OfflineLocation(
            id = recordId,
            userId = activeUid,
            timestamp = timestamp,
            date = dateString,
            latitude = location?.latitude,
            longitude = location?.longitude,
            accuracy = location?.accuracy?.toDouble(),
            provider = location?.provider,
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
            updatedAt = timestamp
        )

        val locDetails = "Lat=${location?.latitude}, Lng=${location?.longitude}, Acc=${location?.accuracy}, Speed=${location?.speed}, Heading=${location?.bearing}, Alt=${location?.altitude}, Battery=$battery%, Provider=${location?.provider}, Method=$trackingMethod, Source=$locationSource"
        DebugLogger.log("LOCATION", "CAPTURE_COMPLETE", "SUCCESS", uuid = recordId, details = locDetails)
        Log.d(TAG, "[LocationCapture] Captured location record: ID = $recordId, $locDetails")

        // Save entry directly to Room SQLite
        locationRepository.saveLocation(offlineRecord)
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
                                return CellTowerInfoData(
                                    cellId = identity.ci,
                                    lac = null,
                                    tac = identity.tac,
                                    mcc = mcc,
                                    mnc = mnc,
                                    signalStrength = signal.dbm,
                                    type = "LTE"
                                )
                            }
                            is CellInfoGsm -> {
                                val identity = info.cellIdentity
                                val signal = info.cellSignalStrength
                                val mcc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) identity.mccString?.toIntOrNull() else identity.mcc
                                val mnc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) identity.mncString?.toIntOrNull() else identity.mnc
                                return CellTowerInfoData(
                                    cellId = identity.cid,
                                    lac = identity.lac,
                                    tac = null,
                                    mcc = mcc,
                                    mnc = mnc,
                                    signalStrength = signal.dbm,
                                    type = "GSM"
                                )
                            }
                            is CellInfoWcdma -> {
                                val identity = info.cellIdentity
                                val signal = info.cellSignalStrength
                                val mcc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) identity.mccString?.toIntOrNull() else identity.mcc
                                val mnc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) identity.mncString?.toIntOrNull() else identity.mnc
                                return CellTowerInfoData(
                                    cellId = identity.cid,
                                    lac = identity.lac,
                                    tac = null,
                                    mcc = mcc,
                                    mnc = mnc,
                                    signalStrength = signal.dbm,
                                    type = "WCDMA"
                                )
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
