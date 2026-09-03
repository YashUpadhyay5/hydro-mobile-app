import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

let CellularTracker: any = null;
if (Platform.OS === 'android') {
  try {
    CellularTracker = requireNativeModule('CellularTracker');
  } catch (e) {
    console.warn('[CellularTracker] Native module not found. Falling back to mock tracking (Expo Go / Development).');
  }
}

export default {
  isLocationEnabled(): boolean {
    if (Platform.OS !== 'android' || !CellularTracker) return true;
    try {
      return CellularTracker.isLocationEnabled();
    } catch (e) {
      console.warn('[CellularTracker] Failed to check isLocationEnabled:', e);
      return true;
    }
  },
  getBatteryLevel(): number {
    if (Platform.OS !== 'android' || !CellularTracker) return 1.0;
    try {
      return CellularTracker.getBatteryLevel();
    } catch (e) {
      console.warn('[CellularTracker] Failed to check battery level:', e);
      return 1.0;
    }
  },
  getBatteryTemperature(): number | null {
    if (Platform.OS !== 'android' || !CellularTracker) return null;
    try {
      return CellularTracker.getBatteryTemperature();
    } catch (e) {
      console.warn('[CellularTracker] Failed to check battery temperature:', e);
      return null;
    }
  },
  startTrackingService(userId: string, apiBaseUrl: string, token?: string, locationProvider?: string, gpsRatioCount?: number, cellularRatioCount?: number, locationUpdateInterval?: string): void {
    if (Platform.OS !== 'android' || !CellularTracker) {
      console.log(`[CellularTracker Mock] Foreground service started in mock mode for ${userId} referencing API ${apiBaseUrl}`);
      return;
    }
    try {
      CellularTracker.startTrackingService(
        userId, 
        apiBaseUrl, 
        token || null, 
        locationProvider || "GPS Only", 
        gpsRatioCount !== undefined ? gpsRatioCount : 1, 
        cellularRatioCount !== undefined ? cellularRatioCount : 2,
        locationUpdateInterval || "60 Seconds"
      );
    } catch (e) {
      console.error('[CellularTracker] Failed to start tracking service:', e);
    }
  },
  updateTrackingSettings(locationProvider: string, gpsRatioCount?: number, cellularRatioCount?: number, locationUpdateInterval?: string): void {
    if (Platform.OS !== 'android' || !CellularTracker) return;
    try {
      CellularTracker.updateTrackingSettings(
        locationProvider, 
        gpsRatioCount !== undefined ? gpsRatioCount : 1, 
        cellularRatioCount !== undefined ? cellularRatioCount : 2,
        locationUpdateInterval || "60 Seconds"
      );
    } catch (e) {
      console.error('[CellularTracker] Failed to update tracking settings:', e);
    }
  },
  stopTrackingService(): void {
    if (Platform.OS !== 'android' || !CellularTracker) {
      console.log('[CellularTracker Mock] Foreground service stopped.');
      return;
    }
    try {
      CellularTracker.stopTrackingService();
    } catch (e) {
      console.error('[CellularTracker] Failed to stop tracking service:', e);
    }
  },
  requestBatteryOptimizationExemption(): void {
    if (Platform.OS !== 'android' || !CellularTracker) {
      return;
    }
    try {
      CellularTracker.requestBatteryOptimizationExemption();
    } catch (e) {
      console.error('[CellularTracker] Failed to request battery exemption:', e);
    }
  },
  async getDiagnostics(): Promise<any> {
    if (Platform.OS !== 'android' || !CellularTracker || !CellularTracker.getDiagnostics) {
      return {
        isClockedIn: false,
        isBatteryOptimizationIgnored: true,
        pendingCount: 0,
        failedCount: 0,
        uploadedToday: 0
      };
    }
    try {
      return await CellularTracker.getDiagnostics();
    } catch (e) {
      console.warn('[CellularTracker] getDiagnostics error:', e);
      return {
        isClockedIn: false,
        isBatteryOptimizationIgnored: true,
        pendingCount: 0,
        failedCount: 0,
        uploadedToday: 0
      };
    }
  },
  isNative: CellularTracker !== null
};
