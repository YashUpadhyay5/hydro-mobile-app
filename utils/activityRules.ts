import { HOUR_MS, MINUTE_MS } from './activityTime';

// The same limits the server enforces (DAY_ACTIVITIES_API.md), so most errors never reach it.
export const TITLE_MAX = 120;
export const REASON_MIN = 3;
export const REASON_MAX = 500;
export const NOTES_MAX = 1000;
export const PLANNED_MINUTES_MIN = 1;
export const PLANNED_MINUTES_MAX = 960;
export const MAX_PLAN_AHEAD_MS = 16 * HOUR_MS;
export const EXTRA_MINUTES_MIN = 5;
export const EXTRA_MINUTES_MAX = 480;
/** A start that was queued offline is only accepted when it began within this long ago. */
export const QUEUED_START_MAX_AGE_MS = 12 * HOUR_MS;
/** Finishing later than this after the deadline needs a reason. */
export const LATE_GRACE_MS = MINUTE_MS;

/** Codes the screens translate; the server's own messages are shown as they come. */
export type RuleError =
  | 'TITLE_REQUIRED'
  | 'TITLE_TOO_LONG'
  | 'PLANNED_END_REQUIRED'
  | 'PLANNED_END_PAST'
  | 'PLANNED_END_TOO_FAR'
  | 'MINUTES_INVALID'
  | 'EXTRA_MINUTES_INVALID'
  | 'REASON_REQUIRED'
  | 'REASON_TOO_SHORT'
  | 'REASON_TOO_LONG';

export function validateTitle(title: string): RuleError | null {
  const t = title.trim();
  if (!t) return 'TITLE_REQUIRED';
  if (t.length > TITLE_MAX) return 'TITLE_TOO_LONG';
  return null;
}

/** Planned end given as a moment. It must be after `nowMs` and at most 16 hours ahead. */
export function validatePlannedEnd(endMs: number | null, nowMs: number): RuleError | null {
  if (endMs === null || !Number.isFinite(endMs)) return 'PLANNED_END_REQUIRED';
  if (endMs <= nowMs) return 'PLANNED_END_PAST';
  if (endMs - nowMs > MAX_PLAN_AHEAD_MS) return 'PLANNED_END_TOO_FAR';
  return null;
}

export function validatePlannedMinutes(minutes: number | null): RuleError | null {
  if (minutes === null || !Number.isInteger(minutes)) return 'MINUTES_INVALID';
  if (minutes < PLANNED_MINUTES_MIN || minutes > PLANNED_MINUTES_MAX) return 'MINUTES_INVALID';
  return null;
}

export function validateExtraMinutes(minutes: number | null): RuleError | null {
  if (minutes === null || !Number.isInteger(minutes)) return 'EXTRA_MINUTES_INVALID';
  if (minutes < EXTRA_MINUTES_MIN || minutes > EXTRA_MINUTES_MAX) return 'EXTRA_MINUTES_INVALID';
  return null;
}

/** `required` = the server will refuse without it. An optional reason is only checked when something was typed. */
export function validateReason(reason: string, required: boolean): RuleError | null {
  const r = reason.trim();
  if (!r) return required ? 'REASON_REQUIRED' : null;
  if (r.length < REASON_MIN) return 'REASON_TOO_SHORT';
  if (r.length > REASON_MAX) return 'REASON_TOO_LONG';
  return null;
}

/** Reads a typed number of minutes. Returns null for anything that is not a whole number. */
export function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

export interface DeadlineInfo {
  status?: string;
  state?: string;
  deadlineAt: number;
}

/** True when finishing now would be late: the server then requires a reason. */
export function finishNeedsReason(activity: DeadlineInfo, nowMs: number): boolean {
  if (activity.state === 'OVERDUE') return true;
  return nowMs > activity.deadlineAt + LATE_GRACE_MS;
}

/** A start queued offline can still be sent when it began within the last 12 hours and not in the future. */
export function queuedStartIsValid(startedAtMs: number, nowMs: number): boolean {
  return startedAtMs <= nowMs && nowMs - startedAtMs <= QUEUED_START_MAX_AGE_MS;
}
