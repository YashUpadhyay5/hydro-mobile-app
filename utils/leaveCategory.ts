/**
 * Special leave categories (marriage, paternity, maternity, ...) as GET /leaves/categories returns them.
 * The server owns the list and each category's allowance; nothing about a specific category lives in the app.
 *
 * maxEndDate / describeDuration repeat the server's rules (backend/utils/leaveCategories.js) so the app can
 * stop an employee picking a date the server would refuse. The server still checks everything again.
 */
export interface LeaveCategory {
  /** Stable key sent when applying. */
  code: string;
  /** What the employee sees, e.g. "Marriage Leave". */
  name: string;
  durationValue: number;
  /** "days" (calendar days) or "months". */
  durationUnit: 'days' | 'months' | string;
}

const DAY_MS = 86400000;

const parseISODate = (value: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const check = new Date(t);
  // Date.UTC rolls 2026-02-31 over into March; refuse it instead.
  return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d ? t : null;
};

const toISODate = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

/** Same day-of-month `months` later, or that month's last day when it has no such day (31 Aug + 6 months = 28 Feb). */
const addMonthsClamped = (timestamp: number, months: number): number => {
  const d = new Date(timestamp);
  const targetMonth = d.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(d.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), targetMonth, Math.min(d.getUTCDate(), lastDayOfTarget));
};

/**
 * The last date a leave starting on `startISO` may run to under the allowance, or null when it can't be worked out.
 *  days:   7 days from the 20th ends on the 26th.
 *  months: 6 months from 1 Nov ends on 30 Apr (the day before the same date 6 months later).
 */
export function maxEndDate(startISO: string, durationValue: number, durationUnit: string): string | null {
  const start = parseISODate(startISO);
  const value = Number(durationValue);
  if (start === null || !Number.isInteger(value) || value < 1) return null;
  if (durationUnit === 'days') return toISODate(start + (value - 1) * DAY_MS);
  if (durationUnit === 'months') return toISODate(addMonthsClamped(start, value) - DAY_MS);
  return null;
}

/** "7 days", "1 day", "6 months". */
export function describeDuration(durationValue: number, durationUnit: string): string {
  const unit = durationUnit === 'months' ? 'month' : 'day';
  return `${durationValue} ${unit}${Number(durationValue) === 1 ? '' : 's'}`;
}

/** Keeps only well-formed categories, so a server that answers with something unexpected can't break the form. */
export function sanitizeCategories(raw: unknown): LeaveCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is LeaveCategory =>
      !!c &&
      typeof c.code === 'string' && c.code !== '' &&
      typeof c.name === 'string' && c.name !== '' &&
      Number.isInteger(c.durationValue) && c.durationValue >= 1 &&
      maxEndDate('2000-01-01', c.durationValue, c.durationUnit) !== null
  );
}
