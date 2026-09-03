import api from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppSettings {
  config_version?: number;
  punch_in_start: string;
  punch_in_end: string;
  punch_out_time: string;
  location_provider: 'GPS Only' | 'Cellular Only' | 'GPS Preferred' | 'GPS + Cellular' | string;
  gps_ratio_count?: number;
  cellular_ratio_count?: number;
  location_update_interval: '10 Seconds' | '30 Seconds' | '60 Seconds' | '120 Seconds' | '300 Seconds' | string;
  grace_minutes?: number;
  half_day_minutes?: number;
  full_day_minutes?: number;
  min_working_minutes?: number;
  max_working_minutes?: number;
  overtime_threshold_minutes?: number;
  auto_sync_interval_seconds?: number;
  allow_cross_day?: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  config_version: 1,
  punch_in_start: '08:30',
  punch_in_end: '10:00',
  punch_out_time: '18:00',
  location_provider: 'GPS Preferred',
  gps_ratio_count: 1,
  cellular_ratio_count: 6,
  location_update_interval: '30 Seconds',
  grace_minutes: 15,
  half_day_minutes: 240,
  full_day_minutes: 480,
  min_working_minutes: 240,
  max_working_minutes: 720,
  overtime_threshold_minutes: 480,
  auto_sync_interval_seconds: 30,
  allow_cross_day: true
};

const SETTINGS_STORAGE_KEY = '@app_settings_v2';

/**
 * Fetches settings from GET /api/settings?v=N and persists them locally.
 * Returns cached configuration if backend returns HTTP 304 or fails.
 */
export const fetchAppSettings = async (currentVersion?: number): Promise<AppSettings> => {
  try {
    const versionParam = currentVersion && currentVersion > 0 ? `?v=${currentVersion}` : '';
    const response = await api.get(`/settings${versionParam}`, {
      headers: currentVersion ? { 'X-Config-Version': String(currentVersion) } : {}
    });

    if (response.status === 304) {
      console.log(`[SettingsService] HTTP 304: Local config v${currentVersion} is latest.`);
      return getCachedAppSettings();
    }

    if (response.data) {
      const data = response.data;
      const settings: AppSettings = {
        config_version: data.config_version !== undefined ? Number(data.config_version) : 1,
        punch_in_start: data.punch_in_start || DEFAULT_APP_SETTINGS.punch_in_start,
        punch_in_end: data.punch_in_end || DEFAULT_APP_SETTINGS.punch_in_end,
        punch_out_time: data.punch_out_time || DEFAULT_APP_SETTINGS.punch_out_time,
        location_provider: data.location_provider || DEFAULT_APP_SETTINGS.location_provider,
        gps_ratio_count: data.gps_ratio_count !== undefined ? Number(data.gps_ratio_count) : DEFAULT_APP_SETTINGS.gps_ratio_count,
        cellular_ratio_count: data.cellular_ratio_count !== undefined ? Number(data.cellular_ratio_count) : DEFAULT_APP_SETTINGS.cellular_ratio_count,
        location_update_interval: data.location_update_interval || DEFAULT_APP_SETTINGS.location_update_interval,
        grace_minutes: data.grace_minutes !== undefined ? Number(data.grace_minutes) : 15,
        half_day_minutes: data.half_day_minutes !== undefined ? Number(data.half_day_minutes) : 240,
        full_day_minutes: data.full_day_minutes !== undefined ? Number(data.full_day_minutes) : 480,
        min_working_minutes: data.min_working_minutes !== undefined ? Number(data.min_working_minutes) : 240,
        max_working_minutes: data.max_working_minutes !== undefined ? Number(data.max_working_minutes) : 720,
        overtime_threshold_minutes: data.overtime_threshold_minutes !== undefined ? Number(data.overtime_threshold_minutes) : 480,
        auto_sync_interval_seconds: data.auto_sync_interval_seconds !== undefined ? Number(data.auto_sync_interval_seconds) : 30,
        allow_cross_day: data.allow_cross_day !== undefined ? Boolean(data.allow_cross_day) : true
      };
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      console.log(`[SettingsService] App settings v${settings.config_version} cached successfully.`);
      return settings;
    }
  } catch (error: any) {
    console.warn('[SettingsService] Network error fetching settings, falling back to cache:', error.message);
  }
  return getCachedAppSettings();
};

/**
 * Returns cached settings from local storage or DEFAULT_APP_SETTINGS if none exist.
 */
export const getCachedAppSettings = async (): Promise<AppSettings> => {
  try {
    const jsonStr = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      return {
        ...DEFAULT_APP_SETTINGS,
        ...parsed
      };
    }
  } catch (err: any) {
    console.warn('[SettingsService] Failed to read cached settings:', err.message);
  }
  return DEFAULT_APP_SETTINGS;
};

/**
 * Converts location update interval string (e.g. '30 Seconds') to milliseconds.
 */
export const parseIntervalMs = (intervalStr: string): number => {
  if (!intervalStr || typeof intervalStr !== 'string') return 30000;
  const lower = intervalStr.toLowerCase().trim();
  const num = parseInt(lower.replace(/[^\d]/g, ''), 10);
  if (isNaN(num) || num <= 0) return 30000;

  if (lower.includes('min')) {
    return num * 60 * 1000;
  }
  if (lower.includes('sec')) {
    return num * 1000;
  }
  return num < 60 ? num * 1000 : num;
};

/**
 * Parses time string e.g. '08:30 AM', '06:00 PM', '18:00' to total minutes in day.
 */
export const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  try {
    const clean = timeStr.trim().toUpperCase();
    const isPM = clean.includes('PM');
    const isAM = clean.includes('AM');
    const numbersOnly = clean.replace(/[^\d:]/g, '');
    const parts = numbersOnly.split(':');
    if (parts.length < 2) return 0;
    
    let hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    return hours * 60 + minutes;
  } catch (e) {
    return 0;
  }
};

/**
 * Calculates total shift duration in seconds from start time and end time strings.
 */
export const getShiftDurationSeconds = (startStr: string, endStr: string): number => {
  try {
    const startMins = parseTimeToMinutes(startStr);
    const endMins = parseTimeToMinutes(endStr);
    if (startMins >= 0 && endMins > startMins) {
      return (endMins - startMins) * 60;
    }
  } catch (e) {
    console.warn("getShiftDurationSeconds error:", e);
  }
  return 28800; // 8 hours default fallback
};
