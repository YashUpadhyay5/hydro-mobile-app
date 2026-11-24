/**
 * Which days of a leave count. EL and LOP are consumed by working days only: Sundays and the employee's own
 * holidays are skipped, because nobody needs leave for a day they were not due to work.
 *
 * This repeats the server's rule (backend/utils/workingDays.js) so the apply screen can show the same number
 * the server will count. The server does the real counting. Holidays differ per employee (each location has its
 * own calendar), so the caller passes in this employee's holidays.
 */
export interface LeaveDaySplit {
  /** Every calendar day in the range. */
  all: string[];
  /** The days that use EL or LOP. */
  working: string[];
  sundays: string[];
  /** Holidays on a day that is not a Sunday (a holiday on a Sunday is reported once, as a Sunday). */
  holidays: { date: string; title: string }[];
}

const DAY_MS = 86400000;
// A range longer than this is treated as invalid (same limit as the server).
const MAX_SPAN_DAYS = 3660;

const parseISO = (value: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const check = new Date(t);
  return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d ? t : null;
};

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const toISO = (year: number, monthIndex: number, day: number): string | null => {
  const d = new Date(Date.UTC(year, monthIndex, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthIndex || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
};

/**
 * A holiday's date as YYYY-MM-DD. Calendars store it as free text, so every format seen in practice is accepted:
 * 2026-08-15, 15-08-2026, 15/08/2026, "15 Aug 2026", "Aug 15, 2026". Null when it cannot be read, and an
 * impossible date such as 2026-02-31 is refused rather than rolled into March (the server does the same).
 */
export function normalizeHolidayDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return toISO(+m[1], +m[2] - 1, +m[3]);
  if ((m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s))) return toISO(+m[3], +m[2] - 1, +m[1]);
  if ((m = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/.exec(s)) && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined) {
    return toISO(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  }
  if ((m = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(s)) && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) {
    return toISO(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : toISO(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** The employee's holidays as a Map of YYYY-MM-DD -> title. Entries whose date cannot be read are ignored. */
export function holidayMap(holidays: { date?: string; title?: string; name?: string }[] | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of holidays ?? []) {
    const iso = normalizeHolidayDate(h?.date);
    if (iso) map.set(iso, h.title || h.name || 'Holiday');
  }
  return map;
}

/** Splits start..end (both included, YYYY-MM-DD) into the days that count and the ones that don't. */
export function splitLeaveDays(startISO: string, endISO: string, holidays: Map<string, string>): LeaveDaySplit {
  const result: LeaveDaySplit = { all: [], working: [], sundays: [], holidays: [] };
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (start === null || end === null || end < start) return result;
  const total = Math.round((end - start) / DAY_MS) + 1;
  if (total > MAX_SPAN_DAYS) return result;
  for (let i = 0; i < total; i++) {
    const t = start + i * DAY_MS;
    const iso = new Date(t).toISOString().slice(0, 10);
    result.all.push(iso);
    if (new Date(t).getUTCDay() === 0) result.sundays.push(iso);
    else if (holidays.has(iso)) result.holidays.push({ date: iso, title: holidays.get(iso) as string });
    else result.working.push(iso);
  }
  return result;
}
