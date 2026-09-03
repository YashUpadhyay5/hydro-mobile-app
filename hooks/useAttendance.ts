import { useState, useEffect, useRef } from "react";
import { Platform, Alert, NativeModules, Linking, Vibration } from "react-native";
const { LocationTracking } = NativeModules;
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Device from 'expo-device';
import { USER_CONFIG } from "@/constants/UserRoles";
import axios from "axios";
import api from "@/services/api";
import { API_BASE_URL } from "@/constants/API";
import { useAuth } from "@/context/AuthContext";
import CellularTracker from "../modules/cellular-tracker";
import { BACKGROUND_LOCATION_TASK } from "../services/BackgroundLocationTask";
import * as Notifications from "expo-notifications";
import AttendanceServiceBridge from "@/services/AttendanceServiceBridge";
import { registerForPushNotificationsAsync } from "@/services/NotificationService";
import { logDebug, checkStartupBackendUrl } from "@/services/DebugLogger";
import { fetchAppSettings, getCachedAppSettings, parseIntervalMs, DEFAULT_APP_SETTINGS, AppSettings, getShiftDurationSeconds } from "@/services/settingsService";
import { requestAppStartupPermissions, requestAllTimeLocationPermission } from "@/services/DeviceHealthService";

const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDateISO = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const checkGeofenceBoundaries = async (lat: number, lon: number) => {
  try {
    const geoRes = await api.get('/geofence');
    const geofences = Array.isArray(geoRes.data) ? geoRes.data : [geoRes.data];
    
    if (geofences.length > 0) {
      let minDistance = Infinity;
      let matchingRadius = 100.0;
      
      for (const gf of geofences) {
        const dist = getDistanceFromLatLonInMeters(lat, lon, Number(gf.latitude), Number(gf.longitude));
        if (dist <= Number(gf.radius)) {
          return { inside: true, minDistance: dist, maxRadius: Number(gf.radius) };
        }
        if (dist < minDistance) {
          minDistance = dist;
          matchingRadius = Number(gf.radius);
        }
      }
      return { inside: false, minDistance, maxRadius: matchingRadius };
    }
  } catch (err) {
    console.warn("Could not fetch geofence settings, using default:", err);
  }
  
  const defaultDist = getDistanceFromLatLonInMeters(lat, lon, 28.5099, 77.3807);
  return { inside: defaultDist <= 100.0, minDistance: defaultDist, maxRadius: 100.0 };
};

export default function useAttendance(targetUserId?: string) {
  const { user } = useAuth();
  const [status, setStatus] = useState("Not checked in");
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [checkInTimestamp, setCheckInTimestamp] = useState<number | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [liveTimer, setLiveTimer] = useState("00:00:00");
  const [locationHistory, setLocationHistory] = useState<any[]>([]);
  const [geofenceCountdown, setGeofenceCountdown] = useState<string | null>(null);
  
  // Timer pausing states & refs
  const [accumulatedSeconds, setAccumulatedSeconds] = useState<number>(0);
  const accumulatedSecondsRef = useRef<number>(0);
  const isOutsideGeofenceRef = useRef<boolean>(false);
  const [totalPausedSeconds, setTotalPausedSeconds] = useState<number>(0);
  const totalPausedSecondsRef = useRef<number>(0);
  
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const cellChecksCount = useRef<number>(0);
  const pingRatioCounter = useRef<number>(0);
  const lastKnownCoords = useRef<{ latitude: number, longitude: number } | null>(null);
  const locationAlertCountRef = useRef<number>(0);

  // Device Health & Setup Wizard States
  const [isSetupWizardVisible, setIsSetupWizardVisible] = useState(false);
  const [deviceHealthReport, setDeviceHealthReport] = useState<any | null>(null);
  const [selectedWorkType, setSelectedWorkTypeState] = useState<string>('OFFICE');

  const setSelectedWorkType = (type: string | null) => {
    setSelectedWorkTypeState(type || 'OFFICE');
    if (user?.id) {
      if (type) {
        AsyncStorage.setItem(`selectedWorkType_${user.id}`, type).catch(() => {});
      } else {
        AsyncStorage.removeItem(`selectedWorkType_${user.id}`).catch(() => {});
      }
    }
  };
  const [isGpsOffWarning, setIsGpsOffWarning] = useState<boolean>(false);
  const [bypassSetupWizard, setBypassSetupWizard] = useState(false);
  const [workMode, setWorkMode] = useState<'office' | 'field'>('office');
  const [canSwitchMode, setCanSwitchMode] = useState(true);
  const [primaryWorkMode, setPrimaryWorkMode] = useState('office');
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const appSettingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS);


  useEffect(() => {
    loadData();
    const initializePermissions = async () => {
      if (Platform.OS !== 'web') {
        try {
          await requestAppStartupPermissions();
        } catch (err) {
          console.warn("[useAttendance] Sequential startup permissions warning:", err);
        }
      }
    };
    initializePermissions();
    return () => { 
      // Removed stopWatchingLocation() so tracking persists even if app unmounts
    };
  }, [targetUserId, user?.id]);

  useEffect(() => {
    let interval: any;
    if (status === "Checked In" && checkInTimestamp) {
      interval = setInterval(async () => {
        const diffMs = Date.now() - checkInTimestamp;
        const shiftDurationSecs = getShiftDurationSeconds(appSettingsRef.current.punch_in_start, appSettingsRef.current.punch_out_time);
        const shiftReminderSecs = Math.max(0, shiftDurationSecs - 120);
        
        // 1. Shift Auto Clock-out based on configured settings
        const elapsedSecs = Math.floor(diffMs / 1000);
        if (workMode === 'office' && elapsedSecs >= shiftDurationSecs) {
          const activeUid = user?.id;
          const isOffice = (selectedWorkType || user?.designation || 'OFFICE').toUpperCase() === 'OFFICE';
          if (isOffice) {
            const endReminderKey = `sentClockOutAlarm_${activeUid}_${formatDateISO(new Date())}`;
            const hasSentAlarm = await AsyncStorage.getItem(endReminderKey);
            if (!hasSentAlarm) {
              await AsyncStorage.setItem(endReminderKey, 'true');
              Vibration.vibrate([0, 1000, 500, 1000, 500, 1000]);
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: "⏰ Shift Completed - Action Required",
                    body: `Your shift (${appSettingsRef.current.punch_in_start} - ${appSettingsRef.current.punch_out_time}) is complete. Please Clock Out immediately.`,
                    sound: true,
                    vibrate: [0, 500, 200, 500],
                  },
                  trigger: null,
                });
              } catch (notifErr: any) {
                console.warn("[useAttendance Hook] Failed to trigger alarm notification:", notifErr.message);
              }
              Alert.alert(
                "⏰ Shift Completed",
                `Your shift (${appSettingsRef.current.punch_in_start} - ${appSettingsRef.current.punch_out_time}) is complete. Please Clock Out immediately.`,
                [{ text: "Clock Out Now", onPress: () => clockOut() }]
              );
            }
          } else {
            console.log("[Shift Timer] Shift duration exceeded! Auto clock-out for non-office worker.");
            clockOut();
          }
        } else {
          // Calculate elapsed seconds dynamically from timestamps to support background state
          const activeUid = user?.id;
          let workingSecs = 0;
          if (activeUid) {
            const outTimeStr = await AsyncStorage.getItem(`outOfGeofenceTime_${activeUid}`);
            const pausedSecsStr = await AsyncStorage.getItem(`totalPausedSeconds_${activeUid}`);
            const pausedSecs = pausedSecsStr ? Number(pausedSecsStr) : 0;
            
            if (user?.designation === 'OFFICE' && outTimeStr) {
              const outTime = Number(outTimeStr);
              workingSecs = Math.floor((outTime - checkInTimestamp) / 1000) - pausedSecs;
            } else {
              workingSecs = Math.floor((Date.now() - checkInTimestamp) / 1000) - pausedSecs;
            }
          } else {
            workingSecs = Math.floor((Date.now() - checkInTimestamp) / 1000);
          }

          if (workingSecs < 0) workingSecs = 0;

          accumulatedSecondsRef.current = workingSecs;
          setAccumulatedSeconds(workingSecs);

          // 2.5 Clock-out Local Notification Reminder (Phase 10)
          if (workMode === 'office' && workingSecs >= shiftReminderSecs && workingSecs < shiftDurationSecs) {
            const reminderKey = `sentClockOutReminder_${activeUid}_${formatDateISO(new Date())}`;
            const hasSent = await AsyncStorage.getItem(reminderKey);
            if (!hasSent) {
              await AsyncStorage.setItem(reminderKey, 'true');
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: "HRMS Reminder",
                    body: "Your shift is almost complete. Please remember to clock out.",
                  },
                  trigger: null,
                });
              } catch (notifErr: any) {
                console.warn("[useAttendance Hook] Failed to send clock-out reminder:", notifErr.message);
              }
            }
          }

          // 3. Format Timer to HH:MM:SS
          const h = Math.floor(workingSecs / 3600);
          const m = Math.floor((workingSecs % 3600) / 60);
          const s = workingSecs % 60;
          const timerString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          
          setLiveTimer(timerString);
          setWorkingHours(timerString);
          saveState("Checked In", checkInTime, "", timerString, checkInTimestamp, workingSecs);
        }
      }, 1000);
      startWatchingLocation();
    } else {
      stopWatchingLocation();
    }
    return () => { clearInterval(interval); };
  }, [status, checkInTimestamp, attendanceHistory, checkInTime]);

  const refreshData = async () => {
    await loadData();
  };

  useEffect(() => {
    let footprintInterval: any;
    let consoleLogInterval: any;
    const intervalMs = parseIntervalMs(appSettings.location_update_interval || appSettingsRef.current.location_update_interval);
    
    if (status === "Checked In") {
      const isNativeActive = Platform.OS === 'android' && CellularTracker && CellularTracker.isNative;

      if (isNativeActive) {
        try {
          CellularTracker.requestBatteryOptimizationExemption();
          CellularTracker.startTrackingService(
            user?.id || "", 
            API_BASE_URL, 
            user?.token,
            appSettings.location_provider || appSettingsRef.current.location_provider || "GPS Preferred",
            appSettings.gps_ratio_count !== undefined ? appSettings.gps_ratio_count : (appSettingsRef.current.gps_ratio_count || 1),
            appSettings.cellular_ratio_count !== undefined ? appSettings.cellular_ratio_count : (appSettingsRef.current.cellular_ratio_count || 6),
            appSettings.location_update_interval || appSettingsRef.current.location_update_interval || "30 Seconds"
          );
          console.log("[useAttendance] Native Android CellularTracker service active. Suppressing JS duplicate poller.");
        } catch (cErr) {
          console.warn("[useAttendance] CellularTracker start warning:", cErr);
        }
      } else {
        // Web / Expo fallback poller
        grabFootprint();
        footprintInterval = setInterval(grabFootprint, intervalMs);
      }
    }
    
    let settingsInterval: any = null;
    if (status === "Checked In") {
      const pollIntervalMs = (appSettings.auto_sync_interval_seconds ? appSettings.auto_sync_interval_seconds * 1000 : 0) || parseIntervalMs(appSettings.location_update_interval || appSettingsRef.current.location_update_interval);
      console.log(`[useAttendance Hook] Dynamic server settings polling active with intervalMs: ${pollIntervalMs}`);

      settingsInterval = setInterval(() => {
        fetchAppSettings(appSettingsRef.current.config_version).then(settings => {
          if (settings) {
            const current = appSettingsRef.current;
            const hasChanged = 
              current.config_version !== settings.config_version ||
              current.location_provider !== settings.location_provider ||
              current.location_update_interval !== settings.location_update_interval ||
              current.gps_ratio_count !== settings.gps_ratio_count ||
              current.cellular_ratio_count !== settings.cellular_ratio_count ||
              current.auto_sync_interval_seconds !== settings.auto_sync_interval_seconds;

            if (hasChanged) {
              console.log("[useAttendance Hook] Server settings changed! Updating native tracker live:", settings);
              setAppSettings(settings);
              appSettingsRef.current = settings;
              if (Platform.OS === 'android' && CellularTracker && CellularTracker.updateTrackingSettings) {
                CellularTracker.updateTrackingSettings(
                  settings.location_provider,
                  settings.gps_ratio_count ?? appSettingsRef.current.gps_ratio_count ?? 1,
                  settings.cellular_ratio_count ?? appSettingsRef.current.cellular_ratio_count ?? 6,
                  settings.location_update_interval
                );
              }
            }
          }
        }).catch(() => {});
      }, pollIntervalMs);
    }
    
    return () => {
      if (footprintInterval) clearInterval(footprintInterval);
      if (consoleLogInterval) clearInterval(consoleLogInterval);
      if (settingsInterval) clearInterval(settingsInterval);
    };
  }, [status, user?.id, appSettings.location_update_interval, appSettings.location_provider, appSettings.auto_sync_interval_seconds]);

  useEffect(() => {
    let countdownInterval: any;
    if (status === "Checked In" && user?.id) {
      countdownInterval = setInterval(async () => {
        try {
          const outTimeStr = await AsyncStorage.getItem(`outOfGeofenceTime_${user.id}`);
          if (outTimeStr) {
            const outTime = Number(outTimeStr);
            const elapsedMs = Date.now() - outTime;
            const remainingSecs = 28800 - Math.floor(elapsedMs / 1000); // 8 hours = 28800 seconds
            if (remainingSecs > 0) {
              const hrs = Math.floor(remainingSecs / 3600);
              const mins = Math.floor((remainingSecs % 3600) / 60);
              const secs = remainingSecs % 60;
              const countdownStr = hrs > 0 
                ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
                : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
              setGeofenceCountdown(countdownStr);
            } else {
              setGeofenceCountdown(null);
            }
          } else {
            setGeofenceCountdown(null);
          }
        } catch (e) {
          console.warn("Countdown sync error:", e);
        }
      }, 1000);
    } else {
      setGeofenceCountdown(null);
    }
    return () => {
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [status, user?.id]);

  const saveState = async (
    newStatus: string,
    inTime: string,
    outTime: string,
    workHrs: string,
    inTimestamp: number | null,
    accumSecs?: number
  ) => {
    if (!user?.id) return;
    try {
      const stateObj = {
        status: newStatus,
        checkInTime: inTime,
        checkOutTime: outTime,
        workingHours: workHrs,
        checkInTimestamp: inTimestamp,
        accumulatedSeconds: accumSecs !== undefined ? accumSecs : accumulatedSecondsRef.current
      };
      await AsyncStorage.setItem(`attendanceState_${user.id}`, JSON.stringify(stateObj));
    } catch (e) {
      console.error("Failed to save attendance state", e);
    }
  };

  const queueOfflineFootprint = async (point: any) => {
    if (!user?.id) return;
    try {
      const queueStr = await AsyncStorage.getItem(`offline_footprints_${user.id}`);
      const queue = queueStr ? JSON.parse(queueStr) : [];
      queue.push(point);
      await AsyncStorage.setItem(`offline_footprints_${user.id}`, JSON.stringify(queue));
    } catch (e) {
      console.error("Failed to queue offline footprint", e);
    }
  };

  const syncOfflineFootprints = async () => {
    if (!user?.id) return;
    try {
      const queueStr = await AsyncStorage.getItem(`offline_footprints_${user.id}`);
      if (!queueStr) return;
      const queue = JSON.parse(queueStr);
      if (queue.length === 0) return;

      const syncedIndexes: number[] = [];
      let locationHistoryUpdated = false;

      for (let i = 0; i < queue.length; i++) {
        let point = queue[i];
        
        // Reverse geocode if missing address but has coordinates
        if (!point.address && point.latitude && point.longitude) {
          try {
            const addresses = await Location.reverseGeocodeAsync({
              latitude: point.latitude,
              longitude: point.longitude
            });
            if (addresses && addresses.length > 0) {
              const addr = addresses[0];
              const parts = [addr.name, addr.street, addr.city, addr.region].filter(Boolean);
              if (parts.length > 0) {
                point.address = parts.join(", ");
              }
            }
          } catch (geoErr) {
            console.warn("Offline sync reverse geocode failed:", geoErr);
          }
        }

        try {
          await api.post('/footprints', point);
          syncedIndexes.push(i);
          locationHistoryUpdated = true;
        } catch (postErr) {
          console.warn("Offline sync post failed, will retry later.");
          break; // Stop syncing if connection fails again
        }
      }

      // Remove synced items
      if (syncedIndexes.length > 0) {
        const newQueue = queue.filter((_: any, idx: number) => !syncedIndexes.includes(idx));
        await AsyncStorage.setItem(`offline_footprints_${user.id}`, JSON.stringify(newQueue));
        
        if (locationHistoryUpdated) {
           const footprintsResponse = await api.get('/footprints', {
             params: { userId: user.id }
           });
           if (footprintsResponse.data) {
             const activeUid = targetUserId || user?.id;
             if (activeUid === user.id) {
               setLocationHistory(footprintsResponse.data);
             }
           }
        }
      }
    } catch (e) {
      console.error("Failed to sync offline footprints", e);
    }
  };

  const grabFootprint = async () => {
    const activeUid = user?.id;
    if (!activeUid) return;

    try {
      let lat: number | null = null;
      let lon: number | null = null;
      let locationEnabled = false;
      let trackingMethod = 'UNAVAILABLE';
      let reason: string | undefined = undefined;
      let accuracy: number | null = null;
      let isMockLoc = false;

      if (Platform.OS !== 'web') {
        const { status: permStatus } = await Location.getForegroundPermissionsAsync();
        const servicesEnabled = await Location.hasServicesEnabledAsync();

        if (permStatus === 'granted' && servicesEnabled) {
          locationEnabled = true;
          locationAlertCountRef.current = 0;
          const providerSetting = (appSettings.location_provider || appSettingsRef.current.location_provider || 'GPS + Cellular').trim();
          const gpsRatio = Math.max(1, Number(appSettings.gps_ratio_count || appSettingsRef.current.gps_ratio_count || 1));
          const cellularRatio = Math.max(1, Number(appSettings.cellular_ratio_count || appSettingsRef.current.cellular_ratio_count || 2));

          if (providerSetting === 'GPS Only') {
            trackingMethod = 'GPS';
          } else if (providerSetting === 'Cellular Only') {
            trackingMethod = 'CELLULAR';
          } else {
            // Mode: 'GPS + Cellular' or 'GPS Preferred' -> Custom Sequence Ratio (e.g. 1 GPS : 2 Cellular)
            const cycleLength = gpsRatio + cellularRatio;
            const stepInCycle = pingRatioCounter.current % cycleLength;

            if (stepInCycle < gpsRatio) {
              trackingMethod = 'GPS';
            } else {
              trackingMethod = 'CELLULAR';
            }
          }

          pingRatioCounter.current += 1;

          if (trackingMethod === 'GPS') {
            try {
              let loc: any;
              try {
                loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
              } catch (highErr) {
                console.warn("[useAttendance Hook] High accuracy failed, retrying with Balanced accuracy:", highErr);
                loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              }
              lat = loc.coords.latitude;
              lon = loc.coords.longitude;
              accuracy = loc.coords.accuracy;
              isMockLoc = loc.mocked || loc.coords?.isMocked || false;
              if (isMockLoc) {
                reason = 'MOCK_LOCATION_DETECTED';
              }
              if (lat !== null && lon !== null) {
                lastKnownCoords.current = { latitude: lat, longitude: lon };
              }
              setIsGpsOffWarning(false);
              locationAlertCountRef.current = 0;
              console.log(`[useAttendance Hook] Grabbing coordinates via GPS: ${lat}, ${lon} (mock=${isMockLoc})`);
            } catch (err) {
              console.warn("[useAttendance Hook] GPS query failed:", err);
              lat = null;
              lon = null;
              accuracy = null;
              trackingMethod = 'UNAVAILABLE';
              reason = 'GPS_SIGNAL_UNAVAILABLE';
            }
          } else {
            console.log(`[useAttendance Hook] Tracking method configured as GPS + Cellular. Fetching cell tower/network location.`);
            try {
              let loc: any;
              try {
                loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              } catch (balErr) {
                loc = await Location.getLastKnownPositionAsync();
              }
              if (loc && loc.coords) {
                lat = loc.coords.latitude;
                lon = loc.coords.longitude;
                accuracy = loc.coords.accuracy;
                isMockLoc = loc.mocked || loc.coords?.isMocked || false;
                if (lat !== null && lon !== null) {
                  lastKnownCoords.current = { latitude: lat, longitude: lon };
                }
                setIsGpsOffWarning(false);
                locationAlertCountRef.current = 0;
              } else {
                lat = null;
                lon = null;
                accuracy = null;
                trackingMethod = 'UNAVAILABLE';
                reason = 'CELLULAR_SIGNAL_UNAVAILABLE';
              }
            } catch (cellLocErr) {
              lat = null;
              lon = null;
              accuracy = null;
              trackingMethod = 'UNAVAILABLE';
              reason = 'CELLULAR_SIGNAL_UNAVAILABLE';
            }
          }
        } else {
          locationEnabled = false;
          trackingMethod = 'GPS_OFF';
          reason = 'GPS_DISABLED';
          lat = null;
          lon = null;
          accuracy = null;
          lastKnownCoords.current = null; // Clear in-memory coordinates to prevent fraud
          setIsGpsOffWarning(true);
          console.warn("[useAttendance Hook] Location services disabled. Reporting GPS_OFF footprint without coordinates.");
          
          if (locationAlertCountRef.current < 3) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: '⚠️ Location Services (GPS) Disabled',
                body: 'Your GPS is turned OFF. Shift attendance tracking is halted. Please enable GPS immediately to record attendance.',
              },
              trigger: null,
            });
            locationAlertCountRef.current += 1;
          }
        }
      } else {
        // Web Implementation - No Faking
        locationEnabled = true;
        const currentCount = cellChecksCount.current;
        trackingMethod = currentCount === 0 ? 'GPS' : 'CELLULAR';
        console.log(`[useAttendance Hook Web] Tick: ${trackingMethod} (never fake coordinates)`);
        
        const nextCount = currentCount + 1;
        cellChecksCount.current = nextCount >= 5 ? 0 : nextCount;
      }

      const newPoint: any = {
        userId: activeUid,
        latitude: lat,
        longitude: lon,
        timestamp: Date.now(),
        date: formatDateISO(new Date()),
        locationEnabled: locationEnabled && lat !== null && lon !== null,
        trackingMethod,
        locationSource: trackingMethod,
        accuracy,
        batteryLevel: Platform.OS === 'android' && CellularTracker ? CellularTracker.getBatteryLevel() : 1.0,
        batteryTemp: Platform.OS === 'android' && CellularTracker ? CellularTracker.getBatteryTemperature() : null,
        isMockLocation: !!isMockLoc
      };

      if (reason) {
        newPoint.reason = reason;
      }


      try {
        const response = await api.post('/footprints', newPoint);
        const currentViewedUid = targetUserId || user?.id;
        if (currentViewedUid === activeUid) {
          setLocationHistory(prev => [...prev, response.data]);
        }
        console.log("Footprint saved to DB successfully:", response.data);
        
        // Trigger offline sync since we are online!
        syncOfflineFootprints();
      } catch (dbErr: any) {
        console.warn("Failed to sync footprint to DB:", dbErr.message);
        if (Platform.OS !== 'android') {
          await queueOfflineFootprint(newPoint);
        } else {
          console.log("[useAttendance Hook] Native Android Room SQLite is sole location queue. Bypassing AsyncStorage duplication.");
        }
        const currentViewedUid = targetUserId || user?.id;
        if (currentViewedUid === activeUid) {
          setLocationHistory(prev => [...prev, newPoint]);
        }
      }

      // Geofence auto clock-out timer for OFFICE workers only (bypassed on Field Duty)
      let userDesignation = user?.designation || 'OFFICE';
      try {
        const empRes = await api.get(`/employees/${user.id}`);
        if (empRes.data) {
          userDesignation = empRes.data.designation;
        }
      } catch (err) {
        console.warn("Could not fetch user designation for auto clock-out:", err);
      }

      const isFieldDutyForFootprint = 
        workMode === 'field' || 
        (selectedWorkType || '').toUpperCase() === 'FIELD' || 
        (user?.designation || '').toUpperCase() === 'FIELD' || 
        (userDesignation || '').toUpperCase() === 'FIELD';

      if (!isFieldDutyForFootprint && userDesignation === 'OFFICE' && workMode === 'office' && lat !== null && lon !== null) {
        const gfCheck = await checkGeofenceBoundaries(lat, lon);
        if (!gfCheck.inside) {
          // User is outside office geofence!
          isOutsideGeofenceRef.current = true;
          let outTimeStr = await AsyncStorage.getItem(`outOfGeofenceTime_${user.id}`);
          let outTime = outTimeStr ? Number(outTimeStr) : null;

          if (outTime === null) {
            outTime = Date.now();
            await AsyncStorage.setItem(`outOfGeofenceTime_${user.id}`, String(outTime));
            console.log(`[Geofence Timer] User went outside geofence. Starting 8-hour timer.`);
          } else {
            const elapsedMs = Date.now() - outTime;
            const outTimeDate = new Date(outTime).toDateString();
            const todayDate = new Date().toDateString();

            if (outTimeDate !== todayDate) {
              // Stale timestamp from a previous day. Reset/clear it.
              console.log("[Geofence Timer] Found stale out-of-geofence time from a previous day. Resetting timer.");
              await AsyncStorage.removeItem(`outOfGeofenceTime_${user.id}`);
            } else if (elapsedMs >= 28800000) { // 8 hours = 28,800,000 ms
              console.log(`[Geofence Timer] 8 hours exceeded! Triggering auto clock-out.`);
              isOutsideGeofenceRef.current = false;
              await AsyncStorage.removeItem(`outOfGeofenceTime_${user.id}`);
              
              // Trigger clock-out
              await clockOut();
              
              if (Platform.OS === 'web') {
                window.alert("Auto Clock-Out: You have been outside the office geofence for more than 8 hours and have been automatically clocked out.");
              } else {
                Alert.alert(
                  "Auto Clock-Out",
                  "You have been outside the office geofence for more than 8 hours and have been automatically clocked out."
                );
              }
            }
          }
        } else {
          // User is inside geofence, reset/remove timer
          isOutsideGeofenceRef.current = false;
          let outTimeStr = await AsyncStorage.getItem(`outOfGeofenceTime_${user.id}`);
          if (outTimeStr) {
            const outTime = Number(outTimeStr);
            const pausedSecsForThisEvent = Math.floor((Date.now() - outTime) / 1000);
            
            // Load current paused total
            const currentPausedStr = await AsyncStorage.getItem(`totalPausedSeconds_${user.id}`);
            const currentPaused = currentPausedStr ? Number(currentPausedStr) : 0;
            const newTotalPaused = currentPaused + pausedSecsForThisEvent;
            
            totalPausedSecondsRef.current = newTotalPaused;
            setTotalPausedSeconds(newTotalPaused);
            await AsyncStorage.setItem(`totalPausedSeconds_${user.id}`, String(newTotalPaused));
            await AsyncStorage.removeItem(`outOfGeofenceTime_${user.id}`);
            console.log(`[Geofence Timer] User came back inside geofence. Added paused seconds: ${pausedSecsForThisEvent}. New total: ${newTotalPaused}`);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to record location footprint", e);
    }
  };

  const startWatchingLocation = async () => {
    if (Platform.OS === 'web') return;
    if (Platform.OS === 'android' && CellularTracker && CellularTracker.isNative) {
      console.log("[useAttendance Hook] Native CellularTracker active; suppressing duplicate Expo background location task.");
      return;
    }
    let { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== "granted") return;
    
    const intervalMs = parseIntervalMs(appSettingsRef.current.location_update_interval);

    let { status: bgPermStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgPermStatus === "granted") {
      try {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: intervalMs,
          distanceInterval: 0,
          deferredUpdatesInterval: intervalMs,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: "HRMS Shift Active",
            notificationBody: "Location tracking enabled for shift validation",
            notificationColor: "#2563eb",
            killServiceOnDestroy: false
          }
        });
        console.log("[useAttendance Hook] Background location updates started with intervalMs:", intervalMs);
      } catch (bgErr) {
        console.warn("[useAttendance Hook] startLocationUpdatesAsync failed:", bgErr);
      }
    }
    
    try {
      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: intervalMs, distanceInterval: 1 },
        async (loc) => {
          const { latitude, longitude } = loc.coords;
          const userRole = user?.role || USER_CONFIG.role;
          if (userRole === 'FIELD') {
            const site = USER_CONFIG.sites.find(s => getDistanceFromLatLonInMeters(latitude, longitude, s.lat, s.lon) <= s.radius);
            if (site) {
               console.log(`Tracking: Operator at ${site.name}`);
            }
          }
        }
      );
    } catch (err) {
      console.warn("[useAttendance Hook] watchPositionAsync failed (Location services might be turned off):", err);
    }
  };

  const stopWatchingLocation = async () => { 
    if (Platform.OS !== 'web') {
      try {
        const hasTask = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (hasTask) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          console.log("[useAttendance Hook] Background location updates stopped.");
        }
      } catch (err) {
        console.warn("Could not stop background location updates:", err);
      }

      if (CellularTracker && CellularTracker.stopTrackingService) {
        try {
          CellularTracker.stopTrackingService();
          console.log("[useAttendance Hook] CellularTracker service stopped.");
        } catch (err) {
          console.warn("Could not stop CellularTracker service:", err);
        }
      }
    }

    if (locationSubscription.current) { 
      try {
        locationSubscription.current.remove(); 
      } catch (err) {
        console.warn("Could not cleanly remove location subscription:", err);
      }
      locationSubscription.current = null; 
    } 
  };

  const loadData = async () => {
    const activeUid = targetUserId || user?.id;
    if (!activeUid) return;

    // Load local cached settings first for instant startup
    getCachedAppSettings().then(cached => {
      if (cached) {
        setAppSettings(cached);
        appSettingsRef.current = cached;
      }
    });

    // Fetch dynamic system settings from server
    fetchAppSettings(appSettingsRef.current?.config_version).then(settings => {
      if (settings) {
        const current = appSettingsRef.current;
        const hasChanged = 
          current.config_version !== settings.config_version ||
          current.location_provider !== settings.location_provider ||
          current.location_update_interval !== settings.location_update_interval ||
          current.gps_ratio_count !== settings.gps_ratio_count ||
          current.cellular_ratio_count !== settings.cellular_ratio_count;

        if (hasChanged) {
          setAppSettings(settings);
          appSettingsRef.current = settings;
          if (Platform.OS === 'android' && CellularTracker && CellularTracker.updateTrackingSettings) {
            CellularTracker.updateTrackingSettings(
              settings.location_provider,
              settings.gps_ratio_count,
              settings.cellular_ratio_count,
              settings.location_update_interval
            );
          }
          console.log(`[useAttendance Hook] System settings updated to v${settings.config_version || 1}:`, settings);
        }
      }
    }).catch(err => console.warn("[useAttendance Hook] Settings fetch error:", err));

    // Load cached history first (instantly shows up in UI)
    try {
      const cachedHistory = await AsyncStorage.getItem(`attendanceHistory_${activeUid}`);
      if (cachedHistory) {
        setAttendanceHistory(JSON.parse(cachedHistory));
      }
    } catch (e) {
      console.warn("Failed to load cached attendance history:", e);
    }

    // Register Push Notification Token to Backend (Phase 16)
    if (activeUid === user?.id) {
      registerForPushNotificationsAsync().then(async pushToken => {
        if (pushToken) {
          await api.post('/employees/fcm-token', { token: pushToken })
            .then(() => console.log("[Push Register] Successfully mapped token to backend:", pushToken))
            .catch(err => console.warn("[Push Register Warning]:", err.message));
        }
      }).catch(err => console.warn("[Push Token Resolution Warning]:", err));
    }

    // 1. Fetch remote history in background (non-blocking)
    try {
      api.get('/attendance').then(async res => {
        if (res.data && Array.isArray(res.data)) {
          const empCode = user?.empCode || user?.employeeCode;
          const uId = activeUid || user?.id;
          const uName = user?.name?.toLowerCase();

          const userRecords = res.data.filter((r: any) => {
            return (
              (empCode && r.userId === empCode) ||
              (uId && r.userId === uId) ||
              (empCode && r.empCode === empCode) ||
              (uId && r.empCode === uId) ||
              (uName && r.userName && r.userName.toLowerCase() === uName)
            );
          });

          const dataset = userRecords.length > 0 ? userRecords : res.data;
          setAttendanceHistory(dataset);
          await AsyncStorage.setItem(`attendanceHistory_${activeUid}`, JSON.stringify(dataset));

          // Sync workMode from the live open session (server is source of truth)
          const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
          const openSession = dataset.find(
            (s: any) => s.date === today && (s.checkOut === null || s.checkOut === undefined || s.checkOut === '')
          );
          if (openSession && openSession.workMode) {
            const serverMode = openSession.workMode;
            setWorkMode(serverMode);
            await AsyncStorage.setItem(`workMode_${activeUid}`, serverMode);
            console.log(`[workMode Sync] Restored workMode='${serverMode}' from active session (id=${openSession.id}).`);
          }
        }
      }).catch(err => console.warn("Failed to fetch attendance history", err.message));

      api.get('/footprints').then(res => {
        if (res.data && Array.isArray(res.data)) {
          const empCode = user?.empCode || user?.employeeCode;
          const uId = activeUid || user?.id;
          const uName = user?.name?.toLowerCase();

          const userFootprints = res.data.filter((f: any) => {
            return (
              (empCode && f.userId === empCode) ||
              (uId && f.userId === uId) ||
              (empCode && f.empCode === empCode) ||
              (uId && f.empCode === uId) ||
              (uName && f.userName && f.userName.toLowerCase() === uName)
            );
          });
          setLocationHistory(userFootprints.length > 0 ? userFootprints : res.data);
        }
      }).catch(err => console.warn("Failed to fetch location history", err.message));

      // Fetch employee designation preferences (Phase 1 & 2)
      api.get(`/employees/${activeUid}`).then(res => {
        if (res.data) {
          setPrimaryWorkMode(res.data.primaryWorkMode || 'office');
          setCanSwitchMode(res.data.canSwitchMode !== undefined ? res.data.canSwitchMode : true);
          
          // Initialise workMode to primary work mode if not already saved locally
          AsyncStorage.getItem(`workMode_${activeUid}`).then(savedMode => {
            if (!savedMode) {
              setWorkMode(res.data.primaryWorkMode || 'office');
            }
          });
        }
      }).catch(err => console.warn("Failed to fetch employee details in loadData:", err.message));
    } catch (e) {
      console.warn("Background history fetches failed:", e);
    }

    // 2. Restore local states from AsyncStorage and nativeState (always run)
    try {
      // Restore geofence outside ref state on mount
      const outTimeStr = await AsyncStorage.getItem(`outOfGeofenceTime_${activeUid}`);
      isOutsideGeofenceRef.current = outTimeStr !== null;

      // Restore saved workMode
      const savedWorkMode = await AsyncStorage.getItem(`workMode_${activeUid}`);
      if (savedWorkMode === 'office' || savedWorkMode === 'field') {
        setWorkMode(savedWorkMode);
      }

      // Restore selected work type
      const savedWorkType = await AsyncStorage.getItem(`selectedWorkType_${activeUid}`);
      setSelectedWorkTypeState(savedWorkType || 'OFFICE');

      // Restore active attendance state from AsyncStorage
      const savedStateStr = await AsyncStorage.getItem(`attendanceState_${activeUid}`);
      
      let nativeState: any = null;
      if (Platform.OS === 'android' && LocationTracking && LocationTracking.getTrackingState) {
          try {
              nativeState = await LocationTracking.getTrackingState();
          } catch (e) { console.warn("Failed to get native tracking state", e); }
      }

      if (nativeState?.isTracking) {
        setStatus("Checked In");
        setCheckInTimestamp(nativeState.clockInTime);
        const date = new Date(nativeState.clockInTime);
        setCheckInTime(date.toLocaleTimeString());
        
        // Native is the source of truth, bypass AsyncStorage discrepancies
      } else if (savedStateStr) {
        const savedState = JSON.parse(savedStateStr);
        setStatus(savedState.status || "Not checked in");
        setCheckInTime(savedState.checkInTime || "");
        setCheckOutTime(savedState.checkOutTime || "");
        setWorkingHours(savedState.workingHours || "");
        setCheckInTimestamp(savedState.checkInTimestamp || null);
        
        // Load totalPausedSeconds
        const pausedSecsStr = await AsyncStorage.getItem(`totalPausedSeconds_${activeUid}`);
        const pausedSecs = pausedSecsStr ? Number(pausedSecsStr) : 0;
        totalPausedSecondsRef.current = pausedSecs;
        setTotalPausedSeconds(pausedSecs);

        // Calculate actual working seconds elapsed since checkInTimestamp
        if (savedState.status === "Checked In" && savedState.checkInTimestamp) {
          const checkInTimeTs = savedState.checkInTimestamp;
          const outTimeStr = await AsyncStorage.getItem(`outOfGeofenceTime_${activeUid}`);
          let workingSecs = 0;
          if (outTimeStr) {
            const outTime = Number(outTimeStr);
            workingSecs = Math.floor((outTime - checkInTimeTs) / 1000) - pausedSecs;
          } else {
            workingSecs = Math.floor((Date.now() - checkInTimeTs) / 1000) - pausedSecs;
          }
          if (workingSecs < 0) workingSecs = 0;
          
          accumulatedSecondsRef.current = workingSecs;
          setAccumulatedSeconds(workingSecs);
          
          const h = Math.floor(workingSecs / 3600);
          const m = Math.floor((workingSecs % 3600) / 60);
          const s = workingSecs % 60;
          const timerString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          setLiveTimer(timerString);
          setWorkingHours(timerString);
        } else {
          const accumSecs = savedState.accumulatedSeconds || 0;
          accumulatedSecondsRef.current = accumSecs;
          setAccumulatedSeconds(accumSecs);
          setLiveTimer(savedState.workingHours || "00:00:00");
        }
      } else {
        setStatus("Not checked in");
        setCheckInTime("");
        setCheckOutTime("");
        setWorkingHours("");
        setCheckInTimestamp(null);
        accumulatedSecondsRef.current = 0;
        setAccumulatedSeconds(0);
        setLiveTimer("00:00:00");
      }
    } catch (e: any) {
      console.warn("Failed to load local attendance state:", e.message);
    }
  };

  const checkDeviceHealth = async (): Promise<{ isReady: boolean; reason?: string }> => {
    try {
      let isGpsEnabled = false;
      let isForegroundGranted = false;
      let isBackgroundGranted = false;
      let isNotificationGranted = false;
      let isInternetAvailable = false;
      
      if (Platform.OS !== 'web') {
        isGpsEnabled = await Location.hasServicesEnabledAsync();
        const fgRes = await Location.getForegroundPermissionsAsync();
        isForegroundGranted = fgRes.status === 'granted';
        const bgRes = await Location.getBackgroundPermissionsAsync();
        isBackgroundGranted = bgRes.status === 'granted';
        
        const notifRes = await Notifications.getPermissionsAsync();
        isNotificationGranted = notifRes.status === 'granted';
      } else {
        isGpsEnabled = true;
        isForegroundGranted = true;
        isBackgroundGranted = true;
        isNotificationGranted = true;
      }
      
      try {
        const netCheck = await axios.head("https://www.google.com", { timeout: 3000 });
        isInternetAvailable = netCheck.status >= 200 && netCheck.status < 400;
      } catch (_) {
        isInternetAvailable = false;
      }

      const isBatteryOptimized = false;

      const report = {
        manufacturer: Device.manufacturer || "Generic",
        brand: Device.brand || "Generic",
        model: Device.modelName || "Device",
        release: Device.osVersion || "1.0",
        sdk: Device.platformApiLevel || 30,
        isBatteryOptimized,
        isPowerSaveMode: false,
        isGpsEnabled,
        isNotificationGranted,
        isForegroundGranted,
        isBackgroundGranted,
        isFgsLocationGranted: true,
        riskLevel: (!isBackgroundGranted || isBatteryOptimized) ? 'High' : 'Low' as 'High' | 'Low',
        compatibilityScore: 100,
        isInternetAvailable,
        killsOnSwipe: false,
        batteryWeight: 20,
        autostartWeight: 20,
      };

      setDeviceHealthReport(report);
      return { isReady: true };
    } catch (err) {
      console.warn("[useAttendance Hook] Failed to check device health:", err);
      return { isReady: true };
    }
  };

  const switchWorkMode = async (explicitTargetMode?: 'office' | 'field') => {
    if (!user?.id) return;
    const targetMode = explicitTargetMode || (workMode === 'office' ? 'field' : 'office');
    const designationTarget = targetMode === 'field' ? 'FIELD' : 'OFFICE';
    
    try {
      // Notify attendance switch-mode endpoint if backend supports it
      try {
        await api.post('/attendance/switch-mode', { 
          userId: user.id,
          targetMode 
        });
      } catch (e: any) {
        console.warn("[useAttendance Hook] switch-mode endpoint warning:", e.message);
      }

      setWorkMode(targetMode);
      setSelectedWorkType(designationTarget);
      await AsyncStorage.setItem(`workMode_${user.id}`, targetMode);
      await AsyncStorage.setItem(`selectedWorkType_${user.id}`, designationTarget);

      // If switched to field duty, clear any active geofence countdown timer
      if (targetMode === 'field') {
        isOutsideGeofenceRef.current = false;
        await AsyncStorage.removeItem(`outOfGeofenceTime_${user.id}`).catch(() => {});
      }

      // Also patch the cached attendanceState so restores pick up new mode
      try {
        const stateStr = await AsyncStorage.getItem(`attendanceState_${user.id}`);
        if (stateStr) {
          const state = JSON.parse(stateStr);
          state.workMode = targetMode;
          state.workType = designationTarget;
          await AsyncStorage.setItem(`attendanceState_${user.id}`, JSON.stringify(state));
        }
      } catch (_) {}
      
      // Notify native service to update parameters
      if (Platform.OS === 'android' && AttendanceServiceBridge) {
        await AttendanceServiceBridge.startAttendanceService(user.id, user.token || "", API_BASE_URL, designationTarget);
      }
      
      const modeLabel = targetMode === 'field' ? 'Field Duty' : 'Office Shift';
      const modeDesc = targetMode === 'field' 
        ? 'Geofence restrictions disabled. You can now clock in and clock out from anywhere.' 
        : 'Standard office geofence rules are now active.';
      Alert.alert("Shift Mode Updated", `You are now on ${modeLabel}.\n\n${modeDesc}`);
    } catch (err: any) {
      console.warn("[useAttendance Hook] Failed to switch work mode, applying locally:", err.message);
      
      setWorkMode(targetMode);
      setSelectedWorkType(designationTarget);
      await AsyncStorage.setItem(`workMode_${user.id}`, targetMode);
      await AsyncStorage.setItem(`selectedWorkType_${user.id}`, designationTarget);

      if (targetMode === 'field') {
        isOutsideGeofenceRef.current = false;
        await AsyncStorage.removeItem(`outOfGeofenceTime_${user.id}`).catch(() => {});
      }

      const modeLabel = targetMode === 'field' ? 'Field Duty' : 'Office Shift';
      Alert.alert("Shift Mode Updated (Offline)", `You are now on ${modeLabel}.`);
    }
  };

  const clockIn = async (workType?: string, forceBypass = false) => {
    if (!user?.id) return;

    // Strict prerequisite validations with clear, non-silent feedback
    if (Platform.OS !== 'web') {
      // 1. Check Foreground Permission
      let { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        const reqFg = await Location.requestForegroundPermissionsAsync();
        fgStatus = reqFg.status;
      }
      if (fgStatus !== 'granted') {
        Alert.alert(
          "Location Permission Required",
          "Because location access is required to track shift attendance, you are unable to clock in. Please allow location access.",
          [
            { text: "Open Settings", onPress: () => Linking.openSettings() },
            { text: "Cancel", style: "cancel" }
          ]
        );
        return;
      }

      // 2. Check Background Permission ("Allow all the time")
      let { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        try {
          const reqBg = await Location.requestBackgroundPermissionsAsync();
          bgStatus = reqBg.status;
        } catch (_) {}
      }
      if (bgStatus !== 'granted') {
        Alert.alert(
          "Background Location Required",
          "Because shift attendance must be validated continuously even when the app is minimized or your phone screen is locked, you are unable to clock in without 'Allow all the time' location permission.\n\nPlease select 'Allow all the time' in Settings.",
          [
            { text: "Open Settings", onPress: () => Linking.openSettings() },
            { text: "Cancel", style: "cancel" }
          ]
        );
        return;
      }

      // 3. Check GPS Services
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        Alert.alert(
          "Location Services (GPS) Disabled",
          "Because device GPS / Location Services is turned off, you are unable to clock in. Please turn ON GPS on your device.",
          [
            { 
              text: "Open GPS Settings", 
              onPress: () => {
                if (Platform.OS === 'android') {
                  Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings());
                } else {
                  Linking.openSettings();
                }
              } 
            },
            { text: "Cancel", style: "cancel" }
          ]
        );
        return;
      }
    }

    const typeToSet = workType || (user?.workTypes && user.workTypes.length === 1 ? user.workTypes[0] : (workMode === 'field' ? 'FIELD' : 'OFFICE'));
    setSelectedWorkType(typeToSet);
    await AsyncStorage.setItem(`selectedWorkType_${user.id}`, typeToSet);
    
    // Enterprise Integration: Force Battery Optimization & Auto-Start Whitelisting
    if (Platform.OS === 'android' && LocationTracking && LocationTracking.checkBatteryOptimization) {
      try {
        const isIgnoring = await LocationTracking.checkBatteryOptimization();
        const hasConfigured = await AsyncStorage.getItem('hasConfiguredBackgroundSettings');
        if (!isIgnoring || !hasConfigured) {
          await AsyncStorage.setItem('hasConfiguredBackgroundSettings', 'true');
          try {
            await LocationTracking.requestBatteryOptimization();
          } catch (optErr) {
            console.warn("[useAttendance Hook] Failed to request battery optimization:", optErr);
          }
        }
      } catch (err) {
        console.warn("Battery optimization check failed", err);
      }
    }

    try {
      setCheckInTime("");
      setCheckOutTime("");
      setWorkingHours("");
      setLiveTimer("00:00:00");
      
      // Reset tracking counter to start with GPS on clock in
      cellChecksCount.current = 0;

      let lat: number | null = null;
      let lon: number | null = null;
      if (Platform.OS !== 'web') {
        try {
          let loc;
          try {
            loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          } catch (highErr) {
            console.warn("High accuracy failed, retrying with Balanced accuracy:", highErr);
            loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          }
          lat = loc.coords.latitude;
          lon = loc.coords.longitude;
          lastKnownCoords.current = { latitude: lat, longitude: lon };
        } catch (err) {
          console.warn("Could not get position on native device, attempting IP fallback:", err);
          try {
            const geoRes = await axios.get('http://ip-api.com/json/', { timeout: 3000 });
            if (geoRes.data && geoRes.data.status === 'success') {
              lat = geoRes.data.lat;
              lon = geoRes.data.lon;
            }
          } catch (ipErr) {
            Alert.alert("Unable to Clock In", "Location coordinates could not be acquired. Please ensure GPS has a clear view of the sky.");
            return;
          }
        }
      } else {
        // Web Platform: Try browser location
        try {
          const pos = await new Promise<any>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 3000 });
          });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        } catch (webGeoErr) {
          lat = 28.6692;
          lon = 77.4538;
        }
      }

      // Geofence enforcement: Completely bypassed on Field Duty (clock in from any place)
      const activeWorkMode = workMode;
      const isFieldDuty = 
        activeWorkMode === 'field' || 
        (typeToSet || '').toUpperCase() === 'FIELD' || 
        (selectedWorkType || '').toUpperCase() === 'FIELD' || 
        (user?.designation || '').toUpperCase() === 'FIELD';

      if (!isFieldDuty) {
        if (lat === null || lon === null) {
          const msg = "Because location coordinates could not be determined, you are unable to clock in. Office employees must be within the office geofence.";
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert("Unable to Clock In", msg);
          return;
        }

        const gfCheck = await checkGeofenceBoundaries(lat, lon);
        if (!gfCheck.inside) {
          const msg = `Because you are outside the office geofence boundary, you are unable to clock in.\n\n• Nearest boundary: ${Math.round(gfCheck.minDistance)}m away\n• Allowed radius: ${Math.round(gfCheck.maxRadius)}m\n\nIf you are on field duty, please switch to Field Duty shift on the home screen to clock in from anywhere.`;
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert("Outside Office Geofence", msg);
          return;
        }
      } else {
        console.log("[useAttendance Hook] Field duty active. Bypassing office geofence verification on clock-in.");
      }
      
      const time = new Date().toLocaleTimeString();
      const timestamp = Date.now();

      logDebug("ATTENDANCE", "CLOCK_IN_INITIATE", "PENDING", user.id, `WorkMode: ${activeWorkMode}`);

      // Post active check-in session to backend for tracking
      const empCode = user.empCode || user.employeeCode || user.id;
      const clockInRecord = {
        userId: empCode,
        empCode: empCode,
        employeeId: user.id,
        userName: user.name || "Employee",
        date: formatDateISO(new Date()),
        checkIn: time,
        checkOut: null,
        workingHours: null,
        coords: (lat !== null && lon !== null) ? { lat, lon } : null,
        workMode: isFieldDuty ? 'field' : 'office',
        workType: typeToSet
      };

      try {
        const response = await api.post('/attendance', clockInRecord);
        logDebug("ATTENDANCE", "CLOCK_IN_HTTP_SYNC", "SUCCESS", user.id, JSON.stringify(response.data));
        console.log("[Clock-In Sync] Active session registered on backend:", response.data);
      } catch (postErr: any) {
        logDebug("ATTENDANCE", "CLOCK_IN_HTTP_SYNC", "FAILURE", user.id, postErr.message);
        if (postErr.response?.data?.error === 'CLOCK_IN_LIMIT_EXCEEDED') {
          Alert.alert(
            "Clock-In Limit Exceeded",
            "Because you have reached the maximum daily limit of 3 clock-ins, you are unable to clock in. Please contact your HR Admin for override permission.",
            [{ text: "OK" }]
          );
          return; // Abort local clock-in
        } else {
          console.warn("[Clock-In Sync Warning] Network error, permitting local offline clock-in:", postErr.message);
        }
      }

      accumulatedSecondsRef.current = 0;
      setAccumulatedSeconds(0);
      isOutsideGeofenceRef.current = false;
      setCheckInTimestamp(timestamp); 
      setCheckInTime(time); 
      setStatus("Checked In");
      await saveState("Checked In", time, "", "", timestamp, 0);
      await AsyncStorage.setItem(`workMode_${user.id}`, isFieldDuty ? 'field' : 'office');

      logDebug("ATTENDANCE", "CLOCK_IN_COMPLETE", "SUCCESS", user.id, `Time: ${time}`);

      if (Platform.OS === 'android') {
        if (LocationTracking) {
          LocationTracking.startTracking(user.id, user.token || "");
        }
        if (AttendanceServiceBridge) {
          await AttendanceServiceBridge.startAttendanceService(user.id, user.token || "", API_BASE_URL, typeToSet);
        }
      }
    } catch (e: any) { 
      console.error("Clock-in failed", e);
      Alert.alert("Clock-In Error", e?.message || "An unexpected error occurred during clock-in.");
    }
  };


  const clockOut = async () => {
    if (!user?.id) return;
    if (status !== "Checked In") {
      if (Platform.OS === 'web') {
        window.alert("You must clock in first before you can clock out.");
      } else {
        Alert.alert("Error", "You must clock in first before you can clock out.");
      }
      return;
    }

    try {
      let lat: number | null = null;
      let lon: number | null = null;
      if (Platform.OS !== 'web') {
        try {
          const servicesEnabled = await Location.hasServicesEnabledAsync();
          let permStatus = 'denied';
          if (servicesEnabled) {
            const perm = await Location.getForegroundPermissionsAsync();
            permStatus = perm.status;
            if (permStatus !== 'granted') {
              const req = await Location.requestForegroundPermissionsAsync();
              permStatus = req.status;
            }
          }

          if (servicesEnabled && permStatus === 'granted') {
            let loc;
            try {
              loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            } catch (highErr) {
              console.warn("High accuracy failed, retrying with Balanced accuracy:", highErr);
              loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            }
            lat = loc.coords.latitude;
            lon = loc.coords.longitude;
            lastKnownCoords.current = { latitude: lat, longitude: lon };
          } else {
            console.log("Location services off or permissions denied. Attempting IP Geolocation fallback for clock-out.");
            try {
              const geoRes = await axios.get('http://ip-api.com/json/', { timeout: 3000 });
              if (geoRes.data && geoRes.data.status === 'success') {
                lat = geoRes.data.lat;
                lon = geoRes.data.lon;
                console.log(`Clock-out IP Geolocation successful: ${lat}, ${lon} (${geoRes.data.city})`);
              } else {
                Alert.alert("Location Error", "Location services are turned off and network IP Geolocation failed.");
                return;
              }
            } catch (ipErr: any) {
              console.warn("IP Geolocation failed for clock-out:", ipErr.message);
              Alert.alert("Location Error", "Please enable Location Services or connect to the internet to clock out.");
              return;
            }
          }
        } catch (err) {
          console.warn("Could not get position on native device:", err);
        }
      } else {
        // Web Platform: Try browser location
        try {
          const pos = await new Promise<any>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 3000 });
          });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        } catch (webGeoErr) {
          console.warn("Web browser geolocation query failed:", webGeoErr);
          // Mock near seeded geofence for simple local development
          lat = 28.6692;
          lon = 77.4538;
        }
      }

      // Geofence enforcement: Completely bypassed on Field Duty (clock out from any place)
      let userDesignation = user?.designation || 'OFFICE';
      try {
        const empRes = await api.get(`/employees/${user.id}`);
        if (empRes.data) {
          userDesignation = empRes.data.designation;
        }
      } catch (err) {
        console.warn("Could not fetch user designation, falling back to cached:", err);
      }

      const isFieldDuty = 
        workMode === 'field' || 
        (selectedWorkType || '').toUpperCase() === 'FIELD' || 
        (user?.designation || '').toUpperCase() === 'FIELD' || 
        (userDesignation || '').toUpperCase() === 'FIELD';

      if (!isFieldDuty) {
        if (lat === null || lon === null) {
          const msg = "Because location coordinates could not be determined, you are unable to clock out. Office employees must be within the office geofence.";
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert("Geofence Verification", msg);
          return;
        }

        const gfCheck = await checkGeofenceBoundaries(lat, lon);
        if (!gfCheck.inside) {
          const msg = `Because you are outside the office geofence area (${Math.round(gfCheck.minDistance)}m away, allowed: ${Math.round(gfCheck.maxRadius)}m), you are unable to clock out in Office Shift mode.\n\nSwitch to Field Duty shift on the home screen or return within the office boundary to clock out.`;
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert("Outside Office Geofence", msg);
          return;
        }
      } else {
        console.log("[useAttendance Hook] Field duty active. Bypassing office geofence verification on clock-out.");
      }


      const time = new Date().toLocaleTimeString();
      const currentCheckIn = checkInTime;

      const totalSecs = accumulatedSecondsRef.current;
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      const finalWorkingHours = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      logDebug("ATTENDANCE", "CLOCK_OUT_INITIATE", "PENDING", user.id, `WorkingHours: ${finalWorkingHours}`);

      const empCode = user.empCode || user.employeeCode || user.id;
      const newRecord = {
        userId: empCode,
        empCode: empCode,
        employeeId: user.id,
        userName: user.name || "Employee",
        date: formatDateISO(new Date()),
        checkIn: currentCheckIn,
        checkOut: time,
        workingHours: finalWorkingHours,
        coords: (lat !== null && lon !== null) ? { lat, lon } : null,
        workMode: isFieldDuty ? 'field' : 'office',
        workType: isFieldDuty ? 'FIELD' : (selectedWorkType || (user?.workTypes && user.workTypes.length === 1 ? user.workTypes[0] : 'Office'))
      };

      setCheckInTime("");
      setCheckOutTime("");
      setWorkingHours("");
      setStatus("Not checked in");
      setCheckInTimestamp(null);
      setLiveTimer("00:00:00");
      setAccumulatedSeconds(0);
      accumulatedSecondsRef.current = 0;
      isOutsideGeofenceRef.current = false;

      try {
        const response = await api.post('/attendance', newRecord);
        logDebug("ATTENDANCE", "CLOCK_OUT_HTTP_SYNC", "SUCCESS", user.id, `Time: ${time}`);
        const activeUid = targetUserId || user?.id;
        if (activeUid === user.id) {
          setAttendanceHistory(prev => {
            const updated = [response.data, ...prev];
            AsyncStorage.setItem(`attendanceHistory_${activeUid}`, JSON.stringify(updated)).catch(e => console.warn("Failed to cache history:", e));
            return updated;
          });
        }
        console.log("Attendance record synced to DB successfully:", response.data);
      } catch (dbErr: any) {
        logDebug("ATTENDANCE", "CLOCK_OUT_HTTP_SYNC", "FAILURE", user.id, dbErr.message);
        console.error("Failed to sync attendance to DB:", dbErr.message);
        const activeUid = targetUserId || user?.id;
        if (activeUid === user.id) {
          setAttendanceHistory(prev => {
            const updated = [newRecord, ...prev];
            AsyncStorage.setItem(`attendanceHistory_${activeUid}`, JSON.stringify(updated)).catch(e => console.warn("Failed to cache offline history:", e));
            return updated;
          });
        }
      }

      await AsyncStorage.removeItem(`attendanceState_${user.id}`);
      await AsyncStorage.removeItem(`outOfGeofenceTime_${user.id}`);
      await AsyncStorage.removeItem(`totalPausedSeconds_${user.id}`);
      await AsyncStorage.removeItem(`sentClockOutReminder_${user.id}_${formatDateISO(new Date())}`);
      await AsyncStorage.removeItem(`sentClockOutAlarm_${user.id}_${formatDateISO(new Date())}`);
      await AsyncStorage.removeItem(`selectedWorkType_${user.id}`);
      setSelectedWorkType(null);
      setTotalPausedSeconds(0);
      totalPausedSecondsRef.current = 0;
      
      await stopWatchingLocation();

      if (Platform.OS === 'android') {
        if (LocationTracking) {
          LocationTracking.stopTracking();
        }
        if (AttendanceServiceBridge) {
          await AttendanceServiceBridge.stopAttendanceService();
        }
        if (CellularTracker && CellularTracker.stopTrackingService) {
          CellularTracker.stopTrackingService();
        }
      }
    } catch (e) { console.error("Clock-out failed", e); }
  };

  const clearHistory = async () => { 
    const activeUid = targetUserId || user?.id;
    if (!activeUid) return;

    try {
      await api.delete(`${API_BASE_URL}/attendance`, { params: { userId: activeUid } });
      await api.delete(`${API_BASE_URL}/footprints`, { params: { userId: activeUid } });
    } catch (e: any) {
      console.warn("Failed to clear DB history:", e.message);
    }
    
    if (user?.id) {
      await AsyncStorage.removeItem(`attendanceState_${user.id}`); 
      await AsyncStorage.removeItem(`outOfGeofenceTime_${user.id}`);
      await AsyncStorage.removeItem(`totalPausedSeconds_${user.id}`);
      await AsyncStorage.removeItem(`workMode_${user.id}`);
    }
    setAttendanceHistory([]); 
    setLocationHistory([]);
    setStatus("Not checked in");
    setCheckInTime("");
    setCheckOutTime("");
    setWorkingHours("");
    setCheckInTimestamp(null);
    setLiveTimer("00:00:00");
  };

  return {
    status,
    setStatus,
    clockIn,
    clockOut,
    checkInTime,
    checkOutTime,
    workingHours,
    attendanceHistory,
    clearHistory,
    liveTimer,
    locationHistory,
    geofenceCountdown,
    refreshData,
    isSetupWizardVisible,
    setIsSetupWizardVisible,
    deviceHealthReport,
    checkDeviceHealth,
    selectedWorkType,
    setSelectedWorkType,
    checkInTimestamp,
    bypassSetupWizard,
    setBypassSetupWizard,
    workMode,
    setWorkMode,
    canSwitchMode,
    primaryWorkMode,
    switchWorkMode,
    accumulatedSeconds,
    appSettings,
    isGpsOffWarning
  };
}