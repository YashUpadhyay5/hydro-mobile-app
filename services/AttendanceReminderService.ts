import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import CellularTracker, { AttendanceReminderConfig } from '../modules/cellular-tracker';
import api from './api';
import { API_BASE_URL } from '@/constants/API';
import { getCachedAppSettings, parseTimeToMinutes } from './settingsService';
import { parseHolidayDate } from '@/utils/holidayDate';
import { formatDateISO } from '@/utils/date';

/**
 * Native, Firebase-free clock-in/out reminders. The schedule (the backend's global shift settings,
 * holidays and approved leave) is synced here and handed to the native module, which arms
 * AlarmManager alarms that fire even when the app is closed. No JS timers are involved.
 */

/** Storage for app/app-settings.tsx's "Shift Clock In / Out Reminders" switch (default on). */
export const NOTIFICATION_PREFS_KEY = '@hrms_notification_preferences_v1';
const SKIP_DATES_CACHE_KEY = '@hrms_reminder_skip_dates_v1';

/**
 * Days that get reminders, as Date.getDay() values. The backend has no weekly-off setting, so this
 * assumes a Monday-Saturday week (no reminders on Sunday). Change here if your shifts differ.
 */
export const REMINDER_WORK_DAYS = [1, 2, 3, 4, 5, 6];
const SKIP_DATES_HORIZON_DAYS = 45;

const isAvailable = () => Platform.OS === 'android' && CellularTracker.isNative;

const remindersEnabledByUser = async (): Promise<boolean> => {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
    return raw ? JSON.parse(raw).shiftReminders !== false : true;
  } catch {
    return true;
  }
};

/** Holidays for the employee's location plus their approved leave, within the planning horizon. */
const fetchSkipDates = async (user: any): Promise<string[] | null> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + SKIP_DATES_HORIZON_DAYS * 24 * 60 * 60 * 1000);
  const dates = new Set<string>();
  const addIfInRange = (d: Date | null) => {
    if (d && d >= today && d <= horizon) dates.add(formatDateISO(d));
  };
  let anySucceeded = false;

  // Same sources and fallback order as the dashboard's holiday list.
  const location = user?.location || user?.holidayDetails || '';
  try {
    const res = await api.get('/v1/employees/my-holidays', {
      params: { ...(user?.id ? { employeeId: user.id } : {}), ...(location ? { location } : {}) },
    });
    let holidays: any[] = res.data?.success && Array.isArray(res.data.holidays) ? res.data.holidays : [];
    anySucceeded = true;
    if (holidays.length === 0) {
      const fallback = await api.get('/holidays', { params: location ? { location } : {} });
      holidays = Array.isArray(fallback.data) ? fallback.data : [];
    }
    holidays.forEach((h) => addIfInRange(parseHolidayDate(h?.date)));
  } catch (err: any) {
    console.warn('[AttendanceReminders] Holiday fetch failed:', err?.message);
  }

  const empCode = user?.empCode || user?.employeeCode || user?.id;
  try {
    const res = await api.get('/leaves', { params: { userId: empCode } });
    anySucceeded = true;
    (Array.isArray(res.data) ? res.data : [])
      .filter((l: any) => String(l?.status).toLowerCase() === 'approved' && (!l.userId || l.userId === empCode))
      .forEach((l: any) => {
        const start = parseHolidayDate(String(l.startDate || '').slice(0, 10));
        const end = parseHolidayDate(String(l.endDate || l.startDate || '').slice(0, 10));
        if (!start || !end) return;
        const last = end < horizon ? end : horizon; // bounds the loop even for a malformed end date
        for (let d = new Date(start < today ? today : start); d <= last; d.setDate(d.getDate() + 1)) addIfInRange(new Date(d));
      });
  } catch (err: any) {
    console.warn('[AttendanceReminders] Leave fetch failed:', err?.message);
  }

  return anySucceeded ? Array.from(dates).sort() : null;
};

/**
 * (Re)configures native reminders for the signed-in user. Safe to call often: it reads cached
 * settings, and when offline it keeps the last synced holidays/leave instead of dropping them.
 */
export const syncAttendanceReminders = async (user: any): Promise<boolean> => {
  if (!isAvailable()) return false;
  const empCode = user?.empCode || user?.employeeCode || user?.id;
  if (!user?.id || !empCode || !(await remindersEnabledByUser())) {
    CellularTracker.disableAttendanceReminders();
    return false;
  }

  const settings = await getCachedAppSettings();
  const shiftStartMinutes = parseTimeToMinutes(settings.punch_in_start);
  const shiftEndMinutes = parseTimeToMinutes(settings.punch_out_time);
  if (!shiftStartMinutes && !shiftEndMinutes) {
    // Unparseable shift times would schedule reminders at midnight; better not to schedule at all.
    console.warn('[AttendanceReminders] Shift times missing; reminders not scheduled.');
    return false;
  }

  let skipDates = await fetchSkipDates(user);
  try {
    if (skipDates) await AsyncStorage.setItem(SKIP_DATES_CACHE_KEY, JSON.stringify(skipDates));
    else skipDates = JSON.parse((await AsyncStorage.getItem(SKIP_DATES_CACHE_KEY)) || '[]');
  } catch {
    skipDates = skipDates || [];
  }

  const config: AttendanceReminderConfig = {
    enabled: true,
    userId: String(empCode),
    apiBaseUrl: API_BASE_URL,
    authToken: user?.token,
    shiftStartMinutes,
    punchInEndMinutes: parseTimeToMinutes(settings.punch_in_end) || shiftStartMinutes,
    shiftEndMinutes,
    graceMinutes: typeof settings.grace_minutes === 'number' ? settings.grace_minutes : 15,
    allowCrossDay: settings.allow_cross_day === true,
    workDays: REMINDER_WORK_DAYS,
    skipDates: skipDates || [],
  };
  return CellularTracker.configureAttendanceReminders(config);
};

/** Reports a clock-in or clock-out so the day's pending reminders stop. [date] defaults to today. */
export const reportAttendanceForReminders = (clockedIn: boolean, clockedOut: boolean, date: Date = new Date()) => {
  if (!isAvailable()) return;
  CellularTracker.updateAttendanceReminderState(formatDateISO(date), clockedIn, clockedOut);
};

export const disableAttendanceReminders = () => {
  if (isAvailable()) CellularTracker.disableAttendanceReminders();
};
