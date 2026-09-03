import { getCachedAppSettings, fetchAppSettings, AppSettings } from './settingsService';
import CellularTracker from '../modules/cellular-tracker';
import { Platform } from 'react-native';

export interface InitializationResult {
  settings: AppSettings;
  isOnline: boolean;
  initializedAt: string;
}

/**
 * Crash-Safe Enterprise App Initializer.
 * Sequential execution pipeline:
 * 1. Load Local Cached Configuration
 * 2. Initialize Native Service with Cached Settings (Zero UI Blocking)
 * 3. Asynchronously Poll Remote Server for Version Updates
 */
export const initializeAppServices = async (userId?: string, userToken?: string): Promise<InitializationResult> => {
  const timestamp = new Date().toISOString();
  console.log(`[AppInitializer] Starting fail-safe app initialization sequence at ${timestamp}...`);

  // 1. Load Local Cached Configuration
  const cachedSettings = await getCachedAppSettings();
  console.log(`[AppInitializer] Step 1: Loaded local cached configuration v${cachedSettings.config_version || 1}.`);

  // 2. Initialize Native Android Foreground Service if user is clocked in
  if (Platform.OS === 'android' && userId && CellularTracker && CellularTracker.updateTrackingSettings !== undefined) {
    try {
      CellularTracker.updateTrackingSettings(
        cachedSettings.location_provider,
        cachedSettings.gps_ratio_count || 1,
        cachedSettings.cellular_ratio_count || 2,
        cachedSettings.location_update_interval
      );
      console.log(`[AppInitializer] Step 2: Native Android tracking service configured with cached settings.`);
    } catch (nativeErr: any) {
      console.warn(`[AppInitializer] Step 2 Warning: Native module initialization warning:`, nativeErr.message);
    }
  }

  // 3. Asynchronously Check Remote Server for Configuration Version Updates
  let activeSettings = cachedSettings;
  let isOnline = false;

  try {
    const remoteSettings = await fetchAppSettings(cachedSettings.config_version);
    if (remoteSettings) {
      activeSettings = remoteSettings;
      isOnline = true;
      console.log(`[AppInitializer] Step 3: Remote config check completed. Active version: v${activeSettings.config_version || 1}.`);

      if (Platform.OS === 'android' && userId && CellularTracker && CellularTracker.updateTrackingSettings) {
        CellularTracker.updateTrackingSettings(
          activeSettings.location_provider,
          activeSettings.gps_ratio_count || 1,
          activeSettings.cellular_ratio_count || 2,
          activeSettings.location_update_interval
        );
      }
    }
  } catch (err: any) {
    console.warn(`[AppInitializer] Step 3 Warning: Remote server unreachable, continuing on cached config v${cachedSettings.config_version || 1}:`, err.message);
  }

  // 4. Initialize Offline Geotagged Photo Repository and Sync Listeners
  try {
    const { offlinePhotoRepository } = require('./OfflinePhotoRepository');
    const { geotagPhotoSyncManager } = require('./GeotagPhotoSyncManager');
    await offlinePhotoRepository.init();
    geotagPhotoSyncManager.startListening();
    console.log('[AppInitializer] Step 4: Offline geotagged photo engine initialized & sync listener active.');
  } catch (photoInitErr: any) {
    console.warn('[AppInitializer] Step 4 Warning: Offline photo repository initialization notice:', photoInitErr.message);
  }

  return {
    settings: activeSettings,
    isOnline,
    initializedAt: timestamp
  };
};
