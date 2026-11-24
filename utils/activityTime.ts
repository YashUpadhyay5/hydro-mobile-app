// Time helpers for Day Activities. The server works in epoch milliseconds and shows days in IST (Asia/Kolkata).
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * HOUR_MS;

/** Epoch milliseconds from what the server may send: a number, a numeric string or an ISO 8601 string. */
export function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    if (/^\d{10,}$/.test(value.trim())) return Number(value);
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** 'YYYY-MM-DD' of the given moment in IST (India has no daylight saving, so a fixed +5:30 is exact). */
export function istDateString(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Moves a 'YYYY-MM-DD' date by whole days. */
export function shiftDateString(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Clock time in IST, e.g. '12:00 PM'. */
export function formatIstTime(ms: number, locale: string = 'en-IN'): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: IST_TIME_ZONE });
}

/** Whole minutes between two moments, rounded down and never negative. */
export function wholeMinutesBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / MINUTE_MS));
}

/** 65 -> '1 h 5 min', 60 -> '1 h', 45 -> '45 min'. */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

export interface Countdown {
  overdue: boolean;
  /** Whole minutes left (not overdue) or whole minutes past the deadline (overdue). */
  minutes: number;
  /** 'h:mm:ss' while time is left, empty once overdue. */
  clock: string;
}

export function countdownTo(deadlineMs: number, nowMs: number): Countdown {
  const diff = deadlineMs - nowMs;
  if (diff < 0) return { overdue: true, minutes: Math.floor(-diff / MINUTE_MS), clock: '' };
  const totalSeconds = Math.floor(diff / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { overdue: false, minutes: Math.floor(diff / MINUTE_MS), clock: `${h}:${pad(m)}:${pad(s)}` };
}

/** The next time today (or tomorrow if that time has passed) at the given hour and minute, in the phone's time zone. */
export function nextOccurrenceOfTime(hours: number, minutes: number, nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(hours, minutes, 0, 0);
  if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
  return d.getTime();
}
