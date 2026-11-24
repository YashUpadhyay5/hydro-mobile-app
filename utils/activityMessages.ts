import type { RuleError } from './activityRules';
import type { ActivityApiError } from '@/services/activityService';

type TFn = (key: string, options?: any) => string;

/** The local rule failures, in the app's language. (Server `error` texts are shown as they come.) */
export function ruleErrorMessage(t: TFn, code: RuleError): string {
  switch (code) {
    case 'TITLE_REQUIRED': return t('attendance:act_err_title_required', { defaultValue: 'Enter what you are doing.' });
    case 'TITLE_TOO_LONG': return t('attendance:act_err_title_long', { defaultValue: 'The title can be at most 120 characters.' });
    case 'PLANNED_END_REQUIRED': return t('attendance:act_err_end_required', { defaultValue: 'Choose when you will be done.' });
    case 'PLANNED_END_PAST': return t('attendance:act_err_end_past', { defaultValue: 'The end time must be later than now.' });
    case 'PLANNED_END_TOO_FAR': return t('attendance:act_err_end_far', { defaultValue: 'The end time can be at most 16 hours from now.' });
    case 'MINUTES_INVALID': return t('attendance:act_err_minutes', { defaultValue: 'Enter a whole number of minutes from 1 to 960.' });
    case 'EXTRA_MINUTES_INVALID': return t('attendance:act_err_extra_minutes', { defaultValue: 'Enter a whole number of minutes from 5 to 480.' });
    case 'REASON_REQUIRED': return t('attendance:act_err_reason_required', { defaultValue: 'Give a reason (at least 3 characters).' });
    case 'REASON_TOO_SHORT': return t('attendance:act_err_reason_short', { defaultValue: 'The reason needs at least 3 characters.' });
    case 'REASON_TOO_LONG': return t('attendance:act_err_reason_long', { defaultValue: 'The reason can be at most 500 characters.' });
  }
}

export type ActivityField = 'title' | 'time' | 'minutes' | 'reason' | 'notes' | 'general';

/** Which input a server error belongs next to. */
export function fieldForError(error: ActivityApiError): ActivityField {
  switch (error.code) {
    case 'TITLE_REQUIRED':
    case 'WORK_REQUIRED': return 'title';
    case 'PLANNED_END_REQUIRED':
    case 'INVALID_PLANNED_END': return 'time';
    case 'INVALID_EXTRA_MINUTES': return 'minutes';
    case 'REASON_REQUIRED': return 'reason';
    default: return 'general';
  }
}

/** Stale-activity answers: the screen should refresh from the server and close. */
export const isStaleError = (error: ActivityApiError) =>
  error.status !== null && ['NOT_IN_PROGRESS', 'NOT_FOUND', 'FORBIDDEN'].includes(error.code);

/** Text for a failure that has no server message (no connection, timeout). */
export function failureMessage(t: TFn, error: ActivityApiError): string {
  if (error.isNetwork) return t('attendance:act_err_network', { defaultValue: 'No connection. Your input is kept; try again.' });
  return error.message || t('attendance:act_err_generic', { defaultValue: 'Something went wrong. Your input is kept; try again.' });
}
