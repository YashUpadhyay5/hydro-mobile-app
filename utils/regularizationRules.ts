import { shiftDateString } from './activityTime';

// The limits the server enforces (REGULARIZATION_API.md), so most errors never reach it.
export const MAX_DAYS_BACK = 31;
export const COMMENT_MIN = 3;
export const COMMENT_MAX = 1000;
export const MAX_DOCUMENTS = 5;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type RegRuleError =
  | 'DATE_REQUIRED'
  | 'DATE_NOT_PAST'
  | 'DATE_TOO_OLD'
  | 'COMMENT_REQUIRED'
  | 'COMMENT_TOO_SHORT'
  | 'COMMENT_TOO_LONG'
  | 'TIME_INVALID'
  | 'TIME_ORDER'
  | 'DOC_TYPE'
  | 'DOC_SIZE'
  | 'DOC_TOO_MANY';

/** Oldest day that can still be regularized, and the newest (yesterday), given today's IST date. */
export function allowedDateRange(todayIst: string): { min: string; max: string } {
  return { min: shiftDateString(todayIst, -MAX_DAYS_BACK), max: shiftDateString(todayIst, -1) };
}

/** `date` and `todayIst` are 'YYYY-MM-DD'. A past day, at most 31 days back. */
export function validateRegularizeDate(date: string | null, todayIst: string): RegRuleError | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'DATE_REQUIRED';
  const { min, max } = allowedDateRange(todayIst);
  if (date > max) return 'DATE_NOT_PAST';
  if (date < min) return 'DATE_TOO_OLD';
  return null;
}

export function validateComment(comment: string): RegRuleError | null {
  const c = comment.trim();
  if (!c) return 'COMMENT_REQUIRED';
  if (c.length < COMMENT_MIN) return 'COMMENT_TOO_SHORT';
  if (c.length > COMMENT_MAX) return 'COMMENT_TOO_LONG';
  return null;
}

/** '09:30', '9:30', '9:30 AM', '09:30:00 PM' -> minutes after midnight; null when it is not a clock time. */
export function parseClockTime(text: string): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?\s*$/.exec(text);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[4]?.toUpperCase();
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/** Both optional. When both are given, `until` must be after `from`. Empty string = not given. */
export function validateWorkedTimes(from: string, until: string): { from?: RegRuleError; until?: RegRuleError } {
  const errors: { from?: RegRuleError; until?: RegRuleError } = {};
  const f = from.trim() ? parseClockTime(from) : null;
  const u = until.trim() ? parseClockTime(until) : null;
  if (from.trim() && f === null) errors.from = 'TIME_INVALID';
  if (until.trim() && u === null) errors.until = 'TIME_INVALID';
  if (f !== null && u !== null && u <= f) errors.until = 'TIME_ORDER';
  return errors;
}

export interface PickedDocument {
  name?: string;
  mimeType?: string | null;
  size?: number | null;
}

const isAllowedType = (doc: PickedDocument): boolean => {
  const mime = (doc.mimeType || '').toLowerCase();
  if (mime) return mime.startsWith('image/') || mime === 'application/pdf';
  return /\.(jpe?g|png|webp|gif|heic|heif|pdf)$/i.test(doc.name || '');
};

/** One file about to be attached: images or PDF only, up to 10 MB. (The count is checked with `validateDocumentCount`.) */
export function validateDocument(doc: PickedDocument): RegRuleError | null {
  if (!isAllowedType(doc)) return 'DOC_TYPE';
  if (typeof doc.size === 'number' && doc.size > MAX_DOCUMENT_BYTES) return 'DOC_SIZE';
  return null;
}

export function validateDocumentCount(alreadyAttached: number, adding: number): RegRuleError | null {
  return alreadyAttached + adding > MAX_DOCUMENTS ? 'DOC_TOO_MANY' : null;
}
