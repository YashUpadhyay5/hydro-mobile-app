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
  /** Returns false if the native service was not started (e.g. location permission not granted yet). */
  startTrackingService(userId: string, apiBaseUrl: string, token?: string, locationProvider?: string, gpsRatioCount?: number, cellularRatioCount?: number, locationUpdateInterval?: string): boolean {
    if (Platform.OS !== 'android' || !CellularTracker) {
      console.log(`[CellularTracker Mock] Foreground service started in mock mode for ${userId} referencing API ${apiBaseUrl}`);
      return true;
    }
    try {
      return CellularTracker.startTrackingService(
        userId, 
        apiBaseUrl, 
        token || null, 
        locationProvider || "GPS Only", 
        gpsRatioCount !== undefined ? gpsRatioCount : 1, 
        cellularRatioCount !== undefined ? cellularRatioCount : 2,
        locationUpdateInterval || "60 Seconds"
      ) !== false;
    } catch (e) {
      console.error('[CellularTracker] Failed to start tracking service:', e);
      return false;
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
  recordOfflineClockOut(payloadJson: string): boolean {
    if (Platform.OS !== 'android' || !CellularTracker || !CellularTracker.recordOfflineClockOut) {
      return false;
    }
    try {
      return CellularTracker.recordOfflineClockOut(payloadJson) !== false;
    } catch (e) {
      console.warn('[CellularTracker] Failed to record offline clock out:', e);
      return false;
    }
  },
  clearOfflineClockOut(): boolean {
    if (Platform.OS !== 'android' || !CellularTracker || !CellularTracker.clearOfflineClockOut) {
      return false;
    }
    try {
      return CellularTracker.clearOfflineClockOut() !== false;
    } catch (e) {
      console.warn('[CellularTracker] Failed to clear offline clock out:', e);
      return false;
    }
  },
  /** Returns false if the system exemption dialog could not be opened. */
  requestBatteryOptimizationExemption(): boolean {
    if (Platform.OS !== 'android' || !CellularTracker) {
      return true;
    }
    try {
      return CellularTracker.requestBatteryOptimizationExemption() !== false;
    } catch (e) {
      console.error('[CellularTracker] Failed to request battery exemption:', e);
      return false;
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

  // ── Attendance reminders (native: cellular.tracker.reminders) ─────────────────────────────
  /** Stores the shift schedule natively and arms the next reminder alarm. Returns true if one is scheduled. */
  configureAttendanceReminders(config: AttendanceReminderConfig): boolean {
    if (Platform.OS !== 'android' || !CellularTracker?.configureAttendanceReminders) return false;
    try {
      return CellularTracker.configureAttendanceReminders(JSON.stringify(config)) === true;
    } catch (e) {
      console.warn('[CellularTracker] configureAttendanceReminders failed:', e);
      return false;
    }
  },
  /** Reports clock-in/out for a shift date (yyyy-MM-dd) so pending reminders for it stop. */
  updateAttendanceReminderState(date: string, clockedIn: boolean, clockedOut: boolean): void {
    if (Platform.OS !== 'android' || !CellularTracker?.updateAttendanceReminderState) return;
    try {
      CellularTracker.updateAttendanceReminderState(date, clockedIn, clockedOut);
    } catch (e) {
      console.warn('[CellularTracker] updateAttendanceReminderState failed:', e);
    }
  },
  disableAttendanceReminders(): void {
    if (Platform.OS !== 'android' || !CellularTracker?.disableAttendanceReminders) return;
    try {
      CellularTracker.disableAttendanceReminders();
    } catch (e) {
      console.warn('[CellularTracker] disableAttendanceReminders failed:', e);
    }
  },
  async getAttendanceReminderStatus(): Promise<AttendanceReminderStatus | null> {
    if (Platform.OS !== 'android' || !CellularTracker?.getAttendanceReminderStatus) return null;
    try {
      return await CellularTracker.getAttendanceReminderStatus();
    } catch (e) {
      console.warn('[CellularTracker] getAttendanceReminderStatus failed:', e);
      return null;
    }
  },
  /** Opens the system settings screen for a reminder permission. Returns false if unavailable on this device. */
  openAttendanceReminderSettings(target: 'exactAlarm' | 'fullScreen' | 'notifications' | 'appDetails' | 'autoStart'): boolean {
    if (Platform.OS !== 'android' || !CellularTracker?.openAttendanceReminderSettings) return false;
    try {
      return CellularTracker.openAttendanceReminderSettings(target) === true;
    } catch (e) {
      console.warn('[CellularTracker] openAttendanceReminderSettings failed:', e);
      return false;
    }
  },
  /** Device test: rings a reminder through the real alarm path after delaySeconds (5-3600), skipping the attendance check. */
  scheduleTestAttendanceReminder(kind: 'CLOCK_IN' | 'CLOCK_OUT', delaySeconds: number): boolean {
    if (Platform.OS !== 'android' || !CellularTracker?.scheduleTestAttendanceReminder) return false;
    try {
      return CellularTracker.scheduleTestAttendanceReminder(kind, Math.round(delaySeconds)) === true;
    } catch (e) {
      console.warn('[CellularTracker] scheduleTestAttendanceReminder failed:', e);
      return false;
    }
  },
  /** Arms the "time is up" alarm for the running Day Activity. Safe to call again with the same deadline. */
  scheduleActivityAlarm(id: string, title: string, deadlineAtMs: number): boolean {
    if (Platform.OS !== 'android' || !CellularTracker?.scheduleActivityAlarm) return false;
    try {
      return CellularTracker.scheduleActivityAlarm(id, title, deadlineAtMs) === true;
    } catch (e) {
      console.warn('[CellularTracker] scheduleActivityAlarm failed:', e);
      return false;
    }
  },
  /** Extend, finish, cancel or sign-out: stops the pending alarm and its sound. */
  cancelActivityAlarm(): void {
    if (Platform.OS !== 'android' || !CellularTracker?.cancelActivityAlarm) return;
    try {
      CellularTracker.cancelActivityAlarm();
    } catch (e) {
      console.warn('[CellularTracker] cancelActivityAlarm failed:', e);
    }
  },
  /** Stops the ringing now; the next repeat stays scheduled until the employee answers. */
  silenceActivityAlarm(): void {
    if (Platform.OS !== 'android' || !CellularTracker?.silenceActivityAlarm) return;
    try {
      CellularTracker.silenceActivityAlarm();
    } catch (e) {
      console.warn('[CellularTracker] silenceActivityAlarm failed:', e);
    }
  },
  /** Creates the "activity_alarm" notification channel (the id the server's push should use). */
  ensureActivityAlarmChannel(): void {
    if (Platform.OS !== 'android' || !CellularTracker?.ensureActivityAlarmChannel) return;
    try {
      CellularTracker.ensureActivityAlarmChannel();
    } catch (e) {
      console.warn('[CellularTracker] ensureActivityAlarmChannel failed:', e);
    }
  },
  /** Device test: rings the activity alarm after delaySeconds (5-3600) through the real alarm path. */
  scheduleTestActivityAlarm(delaySeconds: number): boolean {
    if (Platform.OS !== 'android' || !CellularTracker?.scheduleTestActivityAlarm) return false;
    try {
      return CellularTracker.scheduleTestActivityAlarm(Math.round(delaySeconds)) === true;
    } catch (e) {
      console.warn('[CellularTracker] scheduleTestActivityAlarm failed:', e);
      return false;
    }
  },
  isNative: CellularTracker !== null
};

/** Shape parsed by ReminderStore.parseConfig on the native side. */
export interface AttendanceReminderConfig {
  enabled: boolean;
  /** Employee code: the backend keys attendance records by it. */
  userId: string;
  apiBaseUrl: string;
  authToken?: string;
  /** Minutes after local midnight. */
  shiftStartMinutes: number;
  punchInEndMinutes: number;
  shiftEndMinutes: number;
  graceMinutes: number;
  allowCrossDay: boolean;
  /** Date.getDay() values (0 = Sunday). */
  workDays: number[];
  /** yyyy-MM-dd shift dates without reminders (holidays, approved leave). */
  skipDates: string[];
}

export interface AttendanceReminderStatus {
  enabled: boolean;
  /** Epoch ms of the next reminder, 0 if none. */
  nextReminderAt: number;
  nextReminderKind: 'CLOCK_IN' | 'CLOCK_OUT' | '';
  notificationsEnabled: boolean;
  exactAlarmsAllowed: boolean;
  fullScreenAllowed: boolean;
  batteryOptimizationIgnored: boolean;
  manufacturer: string;
}
