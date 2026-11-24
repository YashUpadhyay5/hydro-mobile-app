import api from './api';
import { ledgerToTransactions } from '@/utils/leaveLedger';
import { toNumberOrNull } from '@/utils/leaveBalance';
import { sanitizeCategories, type LeaveCategory } from '@/utils/leaveCategory';

/**
 * Employee-side leave API, exactly the endpoints the backend exposes to the app. All calls go through
 * the shared client, which sends the login token as `Authorization: Bearer <token>`.
 *
 * Deliberately absent: PATCH /leaves/:id/status. Approving and rejecting is admin-only and is done
 * from the web dashboard; the mobile app must not call it.
 */

/** The backend accepts the employee code (e.g. "HMPL113") or the internal id; the code is preferred. */
export const getEmployeeCode = (user: any): string | undefined =>
  user?.empCode || user?.employeeCode || user?.id || undefined;

export interface LeaveApplication {
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  reason: string;
  /** LeaveCategory.code for a special leave (marriage, paternity, ...). Leave out for ordinary EL/LOP leave. */
  category?: string;
}

/**
 * The 201 response. For ordinary leave the server counts the days and splits them into earned leave and loss
 * of pay; for a special leave (`category` set) elDays and lopDays are 0 because neither applies.
 */
export interface LeaveApplicationResult {
  id: string;
  status: string;
  elDays: number;
  lopDays: number;
  totalDays: number;
  type?: string;
  category?: string | null;
}

export interface LeaveTransaction {
  id: string;
  employeeId?: string;
  userId?: string;
  transactionType: 'earned' | 'consumed';
  leaveType: string;
  amount: number;
  transactionDate: string;
  reason?: string;
  sourceType?: 'monthly' | 'sunday_work' | 'holiday_work' | 'function_work' | 'leave_request' | string;
  sourceName?: string;
  relatedLeaveId?: string | null;
  createdAt?: string;
  /** Set when the server only knows the month ("Aug 2026"); shown in place of a day that was never recorded. */
  periodLabel?: string;
  /** Overrides the generated heading: "Earned Leave", "Sunday", a holiday's name, "Leave consumed". */
  title?: string;
}

export interface SundayHolidayRecord {
  id: string;
  sourceType: string;
  sourceName?: string;
  transactionDate: string;
  amount: number;
  reason: string;
}

export interface SundayHolidaySummary {
  totalDays: number;
  sundayDays: number;
  holidayDays: number;
  records: SundayHolidayRecord[];
}

/**
 * Every identifier this employee can be stored under. Servers have saved a request under the employee
 * code ("HMPL113") or under the internal id, depending on which client created it, so both are asked for.
 */
export const getEmployeeIdentifiers = (user: any): string[] => {
  const ids = [user?.empCode, user?.employeeCode, user?.employeeId, user?.id]
    .filter((v): v is string | number => (typeof v === 'string' && v.trim() !== '') || typeof v === 'number')
    .map((v) => String(v).trim());
  return Array.from(new Set(ids));
};

/** A readable reason a load failed (the server's own message and status, or the network error). */
export const describeLoadError = (err: any): string => {
  const status = err?.response?.status;
  if (status) {
    // A gateway can answer with a whole HTML error page; only a short plain message is worth showing.
    const serverMessage = leaveErrorMessage(err);
    const readable = serverMessage && serverMessage.length <= 160 && !serverMessage.startsWith('<') ? serverMessage : undefined;
    return `${readable || 'Server error'} (HTTP ${status})`;
  }
  return err?.message || 'The server could not be reached';
};

/** GET /leaves/balances/:employeeId?year=: the employee's leave register for one year. Throws if it can't be loaded. */
export const fetchLeaveBalances = async (user: any, year?: number): Promise<any | null> => {
  const userId = getEmployeeCode(user);
  if (!userId) return null;
  const res = await api.get(`/leaves/balances/${encodeURIComponent(userId)}`, {
    params: { year: year || new Date().getFullYear() },
    timeout: 15000
  });
  return res.data;
};

/** The leave activity list, plus the server's own balance figures when it keeps a register. */
export interface LeaveActivity {
  transactions: LeaveTransaction[];
  /** Earned / consumed / available as the register states them; null when the profile should be used instead. */
  summary: { totalEarned: number | null; consumed: number | null; available: number | null } | null;
}

/** Servers that keep leave as a register: every year from the one it started in up to this year. */
const MAX_REGISTER_YEARS_BACK = 10;

const fetchRegisterActivity = async (user: any): Promise<LeaveActivity> => {
  const thisYear = new Date().getFullYear();
  const current = await fetchLeaveBalances(user, thisYear);
  if (!current) return { transactions: [], summary: null };

  // The register says which month it starts from; earlier years only exist if it starts before this one.
  const startYear = Number(String(current.policy?.migrationStartMonth || '').slice(0, 4));
  const firstYear = Number.isInteger(startYear) ? Math.max(startYear, thisYear - MAX_REGISTER_YEARS_BACK) : thisYear;
  const earlierYears: number[] = [];
  for (let y = firstYear; y < thisYear; y++) earlierYears.push(y);

  const earlier = await Promise.all(earlierYears.map((y) => fetchLeaveBalances(user, y)));
  const transactions = [current, ...earlier].flatMap((register) => ledgerToTransactions(register));

  // The figures the register itself reports, so the balance card and the list below it cannot disagree.
  const summary = {
    totalEarned: toNumberOrNull(current.lifetimeCredited),
    consumed: toNumberOrNull(current.lifetimeConsumed),
    available: toNumberOrNull(current.availableBalance ?? current.currentBalance),
  };
  const hasFigures = summary.totalEarned !== null || summary.consumed !== null || summary.available !== null;
  return { transactions, summary: hasFigures ? summary : null };
};

/**
 * Chronological earned and consumed leave. Uses GET /leaves/transactions?userId=<code> where the server
 * has it; a server that answers 404 for that route keeps the same information in its leave register
 * (GET /leaves/balances/:id), which is read instead. Any other failure is thrown so the screen can say so.
 */
export const fetchLeaveActivity = async (user: any): Promise<LeaveActivity> => {
  const userId = getEmployeeCode(user);
  if (!userId) return { transactions: [], summary: null };

  try {
    const res = await api.get('/leaves/transactions', { params: { userId }, timeout: 15000 });
    if (Array.isArray(res.data)) {
      return { transactions: res.data, summary: null };
    }
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  return fetchRegisterActivity(user);
};

export const fetchLeaveTransactions = async (user: any): Promise<LeaveTransaction[]> =>
  (await fetchLeaveActivity(user)).transactions;

/** GET /leaves/sunday-holiday?userId=<code>: real attendance-backed Sunday and Holiday working records. */
export const fetchSundayHolidaySummary = async (user: any): Promise<SundayHolidaySummary> => {
  const userId = getEmployeeCode(user);
  if (!userId) return { totalDays: 0, sundayDays: 0, holidayDays: 0, records: [] };

  try {
    const res = await api.get('/leaves/sunday-holiday', { params: { userId }, timeout: 5000 });
    if (res.data && typeof res.data.totalDays === 'number') {
      return res.data;
    }
  } catch (err: any) {
    console.warn('[fetchSundayHolidaySummary] failed:', err.message);
  }

  return { totalDays: 0, sundayDays: 0, holidayDays: 0, records: [] };
};

/**
 * GET /leaves?userId=<id>: this employee's requests (status: pending | approved | rejected), asked for under
 * each identifier they can be stored under. Whatever the server sends back is checked against those
 * identifiers again, so a server that ignores the filter can never show someone else's request.
 * Throws only when every request failed.
 */
export const fetchMyLeaves = async (user: any): Promise<any[]> => {
  const ids = getEmployeeIdentifiers(user);
  if (ids.length === 0) return [];

  const results = await Promise.allSettled(
    ids.map((userId) => api.get('/leaves', { params: { userId }, timeout: 15000 }))
  );

  const lists: any[][] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value.data)) lists.push(r.value.data);
  }
  if (lists.length === 0) {
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
    return [];
  }

  const mine = new Set(ids);
  const seen = new Set<string>();
  const leaves: any[] = [];
  for (const item of lists.flat()) {
    const owner = [item?.userId, item?.empCode, item?.employeeId].some((v) => v != null && mine.has(String(v)));
    if (!owner) continue;
    const key = String(item.id ?? `${item.userId}|${item.startDate}|${item.endDate}|${item.appliedAt}`);
    if (seen.has(key)) continue;
    seen.add(key);
    leaves.push(item);
  }
  return leaves;
};

/** GET /leaves/adjustments?employeeId=<code> */
export const fetchLeaveAdjustments = async (user: any): Promise<any[]> => {
  const userId = getEmployeeCode(user);
  if (!userId) return [];
  try {
    const res = await api.get('/leaves/adjustments', { params: { employeeId: userId }, timeout: 5000 });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err: any) {
    console.warn('[fetchLeaveAdjustments] failed:', err.message);
    return [];
  }
};


/**
 * POST /leaves. Exactly the required fields: the server computes day counts and the EL/LOP
 * split, saves the request as "pending" and notifies admins.
 */
export const applyForLeave = async (user: any, { startDate, endDate, reason, category }: LeaveApplication): Promise<LeaveApplicationResult> => {
  const userId = getEmployeeCode(user);
  if (!userId) throw new Error('No employee ID is available for this login.');
  const res = await api.post('/leaves', {
    userId,
    userName: user?.name || userId,
    startDate,
    endDate,
    // A special leave is named by its category and the server labels it; ordinary leave is earned leave.
    ...(category ? { category } : { type: 'Earned Leave' }),
    reason: reason.trim(),
  });
  return res.data;
};

/**
 * This employee's holidays (GET /v1/employees/my-holidays), which differ by location. Returns null when the
 * server has no such endpoint, an empty list when it only has placeholder holidays, and throws on any other failure.
 */
export const fetchEmployeeHolidays = async (user: any): Promise<{ date: string; title: string }[] | null> => {
  const location = user?.location || user?.holidayDetails || '';
  try {
    const res = await api.get('/v1/employees/my-holidays', {
      params: { ...(user?.id ? { employeeId: user.id } : {}), ...(location ? { location } : {}) },
      timeout: 15000,
    });
    // Placeholder holidays are not this employee's calendar, so they are not used to reduce leave.
    if (!res.data?.success || res.data.sample || !Array.isArray(res.data.holidays)) return [];
    return res.data.holidays
      .filter((h: any) => h && typeof h.date === 'string')
      .map((h: any) => ({ date: h.date, title: h.title || h.name || 'Holiday' }));
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
};

/**
 * GET /leaves/categories: the special leave categories this server offers, with their allowances.
 * Returns null when the server has no such endpoint (it does not offer special leave at all), an empty
 * list when none are set up, and throws for any other failure so the screen can say what went wrong.
 */
export const fetchLeaveCategories = async (): Promise<LeaveCategory[] | null> => {
  try {
    const res = await api.get('/leaves/categories', { timeout: 15000 });
    return sanitizeCategories(res.data);
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
};

/** The message the server sent for a failed request, if any (validation errors, etc.). */
export const leaveErrorMessage = (err: any): string | undefined => {
  const data = err?.response?.data;
  const msg = typeof data === 'string' ? data : data?.error || data?.message;
  return typeof msg === 'string' && msg.trim() ? msg.trim() : undefined;
};
