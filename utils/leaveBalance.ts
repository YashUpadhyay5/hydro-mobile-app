/**
 * Leave figures as the backend reports them for the logged-in employee. Nothing here invents a number:
 * a figure the server did not send is `null`, and screens show "–" for it instead of a default.
 *
 * Sources (see the leave endpoints doc):
 *  - POST /auth/login and GET /employees/:id: availableLeaves, totalEarnedLeaves, consumedLeaves,
 *    allowedLeaves, leaveBalance.
 *  - The balance saved at login goes stale after an approval, so AuthContext replaces all of these
 *    from GET /employees/:id (see mergeLeaveFields).
 */

export interface LeaveSummary {
  /** What the employee can still take. The server's availableLeaves is authoritative. */
  available: number | null;
  /** Earned leave to date (totalEarnedLeaves, or allowedLeaves from older responses). */
  totalEarned: number | null;
  consumed: number | null;
}

const LEAVE_KEYS = ['availableLeaves', 'totalEarnedLeaves', 'allowedLeaves', 'consumedLeaves', 'leaveBalance'] as const;

export const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export function getLeaveSummary(profile: any): LeaveSummary {
  const totalEarned =
    toNumberOrNull(profile?.totalEarnedLeaves) ??
    toNumberOrNull(profile?.leaveBalance?.credited) ??
    toNumberOrNull(profile?.allowedLeaves);

  let available =
    toNumberOrNull(profile?.availableLeaves) ??
    toNumberOrNull(profile?.leaveBalance?.available) ??
    toNumberOrNull(profile?.leaveBalance?.elLeft) ??
    toNumberOrNull(profile?.leaveBalance);

  let consumed =
    toNumberOrNull(profile?.leaveBalance?.consumed) ??
    toNumberOrNull(profile?.consumedLeaves);

  // If consumed is 0 or null, but earned and available indicate leaves were taken (totalEarned > available)
  if ((consumed === null || consumed === 0) && totalEarned !== null && available !== null && totalEarned > available) {
    consumed = Math.round((totalEarned - available) * 100) / 100;
  }

  // Servers that predate availableLeaves only send allowed/consumed; the balance is their difference.
  if (available === null && totalEarned !== null && consumed !== null) {
    available = Math.max(0, Math.round((totalEarned - consumed) * 100) / 100);
  }
  // consumedLeaves is only guaranteed at login; later responses carry earned and available.
  if (consumed === null && totalEarned !== null && available !== null) {
    consumed = Math.max(0, Math.round((totalEarned - available) * 100) / 100);
  }
  return { available, totalEarned, consumed };
}

/** "–" for an unknown figure, otherwise the number without trailing zeros (1.5, 2). */
export const formatLeaveDays = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value) ? '–' : String(Math.round(value * 100) / 100);

/**
 * The leave fields a refreshed profile should carry. When the fresh response has the new
 * availableLeaves, every leave field comes from it alone: mixing in the login-time consumedLeaves
 * would show a balance that no longer adds up after an approval. Older servers keep the old merge.
 */
export function mergeLeaveFields(prev: any, fresh: any): Record<string, unknown> {
  if (fresh?.availableLeaves !== undefined) {
    const out: Record<string, unknown> = {};
    for (const key of LEAVE_KEYS) out[key] = fresh[key];
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const key of LEAVE_KEYS) out[key] = fresh?.[key] !== undefined ? fresh[key] : prev?.[key];
  return out;
}

/** Whole calendar days from start to end, both included (the backend counts the same way). 0 if invalid. */
export function countInclusiveDays(startISO: string, endISO: string): number {
  const parse = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  };
  const start = parse(startISO);
  const end = parse(endISO);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Preview of how the server will split a request: days up to the available balance are earned leave,
 * the rest loss of pay. Only an estimate (the server does the real split and returns elDays/lopDays);
 * null when the balance is unknown.
 */
export function estimateLeaveSplit(totalDays: number, available: number | null): { el: number; lop: number } | null {
  if (available === null || totalDays <= 0) return null;
  const el = Math.min(Math.max(0, available), totalDays);
  return { el, lop: totalDays - el };
}
