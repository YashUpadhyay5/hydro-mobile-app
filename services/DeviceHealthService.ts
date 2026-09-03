import { Platform, Linking, NativeModules } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import CellularTracker from '../modules/cellular-tracker';

export interface DeviceHealthReport {
  manufacturer: string;
  brand: string;
  model: string;
  release: string;
  sdk: number;
  isBatteryOptimized: boolean;
  isPowerSaveMode: boolean;
  isGpsEnabled: boolean;
  isNotificationGranted: boolean;
  isForegroundGranted: boolean;
  isBackgroundGranted: boolean;
  isCameraGranted: boolean;
  isFgsLocationGranted: boolean;
  riskLevel: 'Low' | 'Medium' | 'High';
  compatibilityScore: number;
  isInternetAvailable: boolean;
  killsOnSwipe: boolean;
  batteryWeight: number;
  autostartWeight: number;
}

export interface ReliabilityResult {
  score: number;
  level: 'Excellent' | 'Good' | 'Warning' | 'High Risk' | 'Critical';
  color: string;
}

/**
 * Enterprise Device Health & Permission Diagnostic Service
 */
export async function getDeviceHealthReport(): Promise<DeviceHealthReport> {
  const manufacturer = Device.manufacturer || 'Android';
  const brand = Device.brand || manufacturer;
  const model = Device.modelName || 'Device';
  const release = Device.osVersion || '14';
  const sdk = typeof Device.platformApiLevel === 'number' ? Device.platformApiLevel : 34;

  let isGpsEnabled = false;
  let isForegroundGranted = false;
  let isBackgroundGranted = false;
  let isNotificationGranted = false;
  let isCameraGranted = false;
  let isBatteryOptimized = true;
  let isPowerSaveMode = false;

  try {
    if (Platform.OS !== 'web') {
      // 1. Location Services Check
      isGpsEnabled = await Location.hasServicesEnabledAsync();

      // 2. Foreground & Background Location Permissions
      const fgPerm = await Location.getForegroundPermissionsAsync();
      isForegroundGranted = fgPerm.granted || fgPerm.status === 'granted';

      const bgPerm = await Location.getBackgroundPermissionsAsync();
      isBackgroundGranted = bgPerm.granted || bgPerm.status === 'granted';

      // 3. Notifications Permission
      const notifPerm = await Notifications.getPermissionsAsync();
      isNotificationGranted = notifPerm.granted || notifPerm.status === 'granted';

      // 4. Camera Permission
      const camPerm = await Camera.getCameraPermissionsAsync();
      isCameraGranted = camPerm.granted || camPerm.status === 'granted';

      // 5. Battery Optimization Exemption
      if (Platform.OS === 'android' && CellularTracker && CellularTracker.getDiagnostics) {
        try {
          const diag = await CellularTracker.getDiagnostics();
          if (diag && typeof diag.isBatteryOptimizationIgnored === 'boolean') {
            isBatteryOptimized = !diag.isBatteryOptimizationIgnored;
          }
        } catch (e) {
          // fallback
          isBatteryOptimized = false;
        }
      } else {
        isBatteryOptimized = false;
      }

      // 6. Power Save Mode
      try {
        isPowerSaveMode = await Battery.isLowPowerModeEnabledAsync();
      } catch (e) {
        isPowerSaveMode = false;
      }
    } else {
      // Web defaults
      isGpsEnabled = true;
      isForegroundGranted = true;
      isBackgroundGranted = true;
      isNotificationGranted = true;
      isCameraGranted = true;
      isBatteryOptimized = false;
    }
  } catch (err) {
    console.warn('[DeviceHealthService] Diagnostic query error:', err);
  }

  const mfg = manufacturer.toLowerCase();
  const isHighRiskOEM = 
    mfg.includes('transsion') || 
    mfg.includes('infinix') || 
    mfg.includes('tecno') || 
    mfg.includes('itel') ||
    mfg.includes('xiaomi') ||
    mfg.includes('redmi') ||
    mfg.includes('poco') ||
    mfg.includes('oppo') ||
    mfg.includes('realme') ||
    mfg.includes('vivo') ||
    mfg.includes('huawei');

  const riskLevel: 'Low' | 'Medium' | 'High' = isHighRiskOEM ? 'High' : 'Low';

  let score = 0;
  if (isGpsEnabled) score += 20;
  if (isForegroundGranted) score += 20;
  if (isBackgroundGranted) score += 20;
  if (!isBatteryOptimized) score += 15;
  if (isNotificationGranted) score += 15;
  if (isCameraGranted) score += 10;

  return {
    manufacturer,
    brand,
    model,
    release,
    sdk,
    isBatteryOptimized,
    isPowerSaveMode,
    isGpsEnabled,
    isNotificationGranted,
    isForegroundGranted,
    isBackgroundGranted,
    isCameraGranted,
    isFgsLocationGranted: isBackgroundGranted,
    riskLevel,
    compatibilityScore: Math.min(100, score),
    isInternetAvailable: true,
    killsOnSwipe: isHighRiskOEM,
    batteryWeight: 15,
    autostartWeight: 15,
  };
}

export function computeReliabilityScore(report: DeviceHealthReport | null, autoStartMarkedDone: boolean = false): ReliabilityResult {
  if (!report) {
    return { score: 0, level: 'Critical', color: '#EF4444' };
  }

  let score = 0;
  if (report.isGpsEnabled) score += 20;
  if (report.isForegroundGranted) score += 20;
  if (report.isBackgroundGranted) score += 20;
  if (!report.isBatteryOptimized) score += 15;
  if (report.isNotificationGranted) score += 15;
  if (report.isCameraGranted) score += 10;

  score = Math.min(100, score);

  let level: 'Excellent' | 'Good' | 'Warning' | 'High Risk' | 'Critical' = 'High Risk';
  let color = '#EF4444';

  if (score >= 90) {
    level = 'Excellent';
    color = '#10B981';
  } else if (score >= 75) {
    level = 'Good';
    color = '#3B82F6';
  } else if (score >= 50) {
    level = 'Warning';
    color = '#F59E0B';
  } else {
    level = 'Critical';
    color = '#EF4444';
  }

  return { score, level, color };
}

/**
 * Requests location permission ensuring "Allow all the time" / Background access
 */
export async function requestAllTimeLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      return false;
    }
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus === 'granted') {
      return true;
    } else {
      // If background wasn't granted directly, prompt user to open app settings
      Linking.openSettings();
      return false;
    }
  } catch (e) {
    console.warn('[DeviceHealthService] Location request failed, opening settings:', e);
    Linking.openSettings();
    return false;
  }
}

/**
 * Requests Battery Optimization Exemption
 */
export function requestBatteryOptimizationExemption(): void {
  if (Platform.OS === 'android' && CellularTracker && CellularTracker.requestBatteryOptimizationExemption) {
    CellularTracker.requestBatteryOptimizationExemption();
  } else {
    try {
      Linking.openSettings();
    } catch (_) {}
  }
}

/**
 * Requests Camera Permission
 */
export async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status === 'granted') {
      return true;
    } else {
      Linking.openSettings();
      return false;
    }
  } catch (e) {
    console.warn('[DeviceHealthService] Camera request failed:', e);
    Linking.openSettings();
    return false;
  }
}

/**
 * Requests Notification Permission
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      return true;
    } else {
      Linking.openSettings();
      return false;
    }
  } catch (e) {
    console.warn('[DeviceHealthService] Notification request failed:', e);
    Linking.openSettings();
    return false;
  }
}

/**
 * Sequential Enterprise App Startup Permission Pipeline
 * 1. Foreground Location
 * 2. Background Location ("Allow all the time")
 * 3. Push Notifications
 * 4. Camera (for geotagged selfie attendance)
 * 5. Battery Optimization Exemption
 * (Note: Storage/Media library permission is NOT requested here; it is requested just-in-time when picking documents/photos)
 */
export async function requestAppStartupPermissions(): Promise<{
  foregroundLocation: boolean;
  backgroundLocation: boolean;
  notifications: boolean;
  camera: boolean;
  allGranted: boolean;
}> {
  if (Platform.OS === 'web') {
    return {
      foregroundLocation: true,
      backgroundLocation: true,
      notifications: true,
      camera: true,
      allGranted: true,
    };
  }

  let fgGranted = false;
  let bgGranted = false;
  let notifGranted = false;
  let camGranted = false;

  try {
    // Step 1: Foreground Location
    const fgCheck = await Location.getForegroundPermissionsAsync();
    if (fgCheck.status === 'granted') {
      fgGranted = true;
    } else if (fgCheck.canAskAgain) {
      const fgRes = await Location.requestForegroundPermissionsAsync();
      fgGranted = fgRes.status === 'granted';
    }

    // Step 2: Background Location ("Allow all the time")
    if (fgGranted) {
      const bgCheck = await Location.getBackgroundPermissionsAsync();
      if (bgCheck.status === 'granted') {
        bgGranted = true;
      }
    }

    // Step 3: Push Notifications
    const notifCheck = await Notifications.getPermissionsAsync();
    if (notifCheck.status === 'granted') {
      notifGranted = true;
    } else if (notifCheck.canAskAgain) {
      try {
        const notifRes = await Notifications.requestPermissionsAsync();
        notifGranted = notifRes.status === 'granted';
      } catch (notifErr) {
        console.warn('[Startup Permissions] Notification request error:', notifErr);
      }
    }

    // Step 4: Camera
    const camCheck = await Camera.getCameraPermissionsAsync();
    if (camCheck.status === 'granted') {
      camGranted = true;
    }
  } catch (err) {
    console.warn('[Startup Permissions Pipeline Warning]:', err);
  }

  const allGranted = fgGranted && bgGranted && notifGranted && camGranted;
  console.log('[Startup Permissions] Pipeline result:', { fgGranted, bgGranted, notifGranted, camGranted, allGranted });

  return {
    foregroundLocation: fgGranted,
    backgroundLocation: bgGranted,
    notifications: notifGranted,
    camera: camGranted,
    allGranted,
  };
}

