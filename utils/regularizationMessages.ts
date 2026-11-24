import type { RegRuleError } from './regularizationRules';
import type { RegularizationApiError } from '@/services/regularizationService';

type TFn = (key: string, options?: any) => string;

/** The local rule failures, in the app's language. (Server `error` texts are shown as they come.) */
export function regRuleMessage(t: TFn, code: RegRuleError): string {
  switch (code) {
    case 'DATE_REQUIRED': return t('attendance:reg_err_date_required', { defaultValue: 'Choose the day you want to regularize.' });
    case 'DATE_NOT_PAST': return t('attendance:reg_err_date_not_past', { defaultValue: 'Choose a day before today.' });
    case 'DATE_TOO_OLD': return t('attendance:reg_err_date_too_old', { defaultValue: 'You can only regularize the last 31 days.' });
    case 'COMMENT_REQUIRED': return t('attendance:reg_err_comment_required', { defaultValue: 'Write a comment (at least 3 characters).' });
    case 'COMMENT_TOO_SHORT': return t('attendance:reg_err_comment_short', { defaultValue: 'The comment needs at least 3 characters.' });
    case 'COMMENT_TOO_LONG': return t('attendance:reg_err_comment_long', { defaultValue: 'The comment can be at most 1000 characters.' });
    case 'TIME_INVALID': return t('attendance:reg_err_time_invalid', { defaultValue: 'Choose a valid time.' });
    case 'TIME_ORDER': return t('attendance:reg_err_time_order', { defaultValue: '"Until" must be later than "I worked from".' });
    case 'DOC_TYPE': return t('attendance:reg_err_doc_type', { defaultValue: 'Only photos and PDF files can be attached.' });
    case 'DOC_SIZE': return t('attendance:reg_err_doc_size', { defaultValue: 'Each file can be at most 10 MB.' });
    case 'DOC_TOO_MANY': return t('attendance:reg_err_doc_many', { defaultValue: 'You can attach at most 5 files.' });
  }
}

export type RegField = 'date' | 'comment' | 'from' | 'until' | 'documents' | 'general';

/** Which input a server error belongs next to. */
export function regFieldForError(error: RegularizationApiError): RegField {
  switch (error.code) {
    case 'INVALID_DATE':
    case 'DATE_NOT_PAST':
    case 'DATE_TOO_OLD':
    case 'ON_LEAVE': return 'date';
    case 'COMMENT_REQUIRED': return 'comment';
    case 'INVALID_TIME': return 'from';
    case 'TOO_MANY_DOCUMENTS':
    case 'INVALID_DOCUMENT': return 'documents';
    default: return 'general';
  }
}

/** Text for a failure: the server's own message, or a plain one when there was no answer. */
export function regFailureMessage(t: TFn, error: RegularizationApiError): string {
  if (error.isNetwork) return t('attendance:reg_err_network', { defaultValue: 'No connection. Your comment and files are kept; try again.' });
  return error.message || t('attendance:reg_err_generic', { defaultValue: 'Something went wrong. Your input is kept; try again.' });
}
