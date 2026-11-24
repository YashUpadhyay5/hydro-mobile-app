import i18n from '@/src/i18n';
import { getDateLocale } from '@/src/i18n/dateLocale';

export interface LeaveTransactionItem {
  id?: string;
  transactionType?: 'earned' | 'consumed' | string;
  leaveType?: string;
  amount?: number | string;
  transactionDate?: string;
  reason?: string;
  sourceType?: 'monthly' | 'sunday_work' | 'function_work' | 'leave_request' | string;
  sourceName?: string;
  createdAt?: string;
}

export function formatTransactionDate(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return '';
  const fmt: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    // A plain calendar date: format it as UTC so the phone's time zone cannot move it a day.
    const [y, m, d] = dateInput.substring(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(getDateLocale(), { ...fmt, timeZone: 'UTC' });
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toLocaleDateString(getDateLocale(), fmt);
}

export function formatAmountNumber(val: number | string | null | undefined): string {
  const num = typeof val === 'number' ? val : parseFloat(String(val || 0));
  if (isNaN(num)) return '0.0';
  return num % 1 === 0 ? num.toFixed(1) : String(Math.round(num * 100) / 100);
}

export function getActivityTitle(item: LeaveTransactionItem): string {
  const isEarned = String(item.transactionType).toLowerCase() === 'earned';
  const rawAmount = typeof item.amount === 'number' ? item.amount : parseFloat(String(item.amount || 0));
  const leaveType = item.leaveType || 'EL';
  const amountDisplay = rawAmount % 1 === 0 ? rawAmount : (Math.round(rawAmount * 100) / 100);

  if (isEarned) {
    const isSunday = item.sourceType === 'sunday_work' || (item.reason && item.reason.toLowerCase().includes('sunday'));
    const isHoliday = item.sourceType === 'holiday_work' || item.sourceType === 'function_work' || (item.leaveType === 'Sunday/Holiday' && !isSunday);

    if (isSunday || isHoliday || leaveType === 'Sunday/Holiday') {
      return i18n.t('leave:sunday_holiday', { defaultValue: 'Sunday/Holiday' });
    }
    return i18n.t('leave:earned_title', { defaultValue: 'Earned {{amount}} {{type}}', amount: amountDisplay, type: leaveType });
  }

  // Consumed leaves
  const isLop = leaveType === 'LOP' ||
                item.sourceType === 'lop' ||
                item.sourceName === 'Loss of Pay' ||
                (item.reason && item.reason.toLowerCase().includes('loss of pay'));

  if (isLop) {
    return i18n.t('leave:consumed_lop_title', { defaultValue: 'Consumed {{amount}} Loss of Pay', amount: amountDisplay });
  }

  return i18n.t('leave:consumed_title', { defaultValue: 'Consumed {{amount}} {{type}}', amount: amountDisplay, type: leaveType });
}

export function getActivityDescription(item: LeaveTransactionItem): string {
  const isEarned = String(item.transactionType).toLowerCase() === 'earned';
  if (item.reason && item.reason.trim()) {
    return item.reason.trim();
  }
  if (isEarned) {
    if (item.sourceType === 'monthly') return i18n.t('leave:monthly_accrual_desc', { defaultValue: 'Monthly leave accrual' });
    if (item.sourceType === 'sunday_work') return i18n.t('leave:worked_on_sunday', { defaultValue: 'Worked on Sunday' });
    if (item.sourceType === 'holiday_work' || item.sourceType === 'function_work') {
      return item.sourceName ? i18n.t('leave:reason_worked_on', { defaultValue: 'Worked on {{name}}', name: item.sourceName }) : i18n.t('leave:worked_on_company_holiday', { defaultValue: 'Worked on Company Holiday' });
    }
    return i18n.t('leave:leave_credited', { defaultValue: 'Leave credited' });
  }

  const isLop = item.leaveType === 'LOP' ||
                item.sourceType === 'lop' ||
                item.sourceName === 'Loss of Pay' ||
                (item.reason && item.reason.toLowerCase().includes('loss of pay'));
  if (isLop) {
    return i18n.t('leave:lop_taken', { defaultValue: 'Loss of pay leave taken' });
  }

  return item.sourceName ? i18n.t('leave:source_taken', { defaultValue: '{{name}} taken', name: item.sourceName }) : i18n.t('leave:leave_taken', { defaultValue: 'Leave taken' });
}

export function getActivityBadge(item: LeaveTransactionItem): string | null {
  const isLop = item.leaveType === 'LOP' ||
                item.sourceType === 'lop' ||
                item.sourceName === 'Loss of Pay' ||
                (item.reason && item.reason.toLowerCase().includes('loss of pay'));
  if (isLop) return i18n.t('leave:loss_of_pay', { defaultValue: 'Loss of Pay' });

  if (item.sourceType === 'monthly') return i18n.t('leave:monthly_accrual', { defaultValue: 'Monthly Accrual' });
  if (item.sourceType === 'sunday_work') return i18n.t('leave:sunday', { defaultValue: 'Sunday' });
  if (item.sourceType === 'holiday_work' || item.sourceType === 'function_work') {
    return item.sourceName || i18n.t('leave:holiday', { defaultValue: 'Holiday' });
  }
  if (item.sourceType === 'migration') return item.sourceName || i18n.t('leave:migration_register', { defaultValue: 'Migration Register' });
  if (item.sourceType === 'leave_request') return item.sourceName || i18n.t('leave:leave_taken_badge', { defaultValue: 'Leave Taken' });
  return null;
}

export function getAmountUnit(item: LeaveTransactionItem): string {
  const isEarned = String(item.transactionType).toLowerCase() === 'earned';
  if (!isEarned) {
    const isLop = item.leaveType === 'LOP' ||
                  item.sourceType === 'lop' ||
                  item.sourceName === 'Loss of Pay' ||
                  (item.reason && item.reason.toLowerCase().includes('loss of pay'));
    if (isLop) return 'LOP';
    return item.leaveType || 'EL';
  }

  const isSunday = item.sourceType === 'sunday_work' || (item.reason && item.reason.toLowerCase().includes('sunday'));
  const isHoliday = item.sourceType === 'holiday_work' || item.sourceType === 'function_work';
  if (isSunday || isHoliday || item.leaveType === 'Sunday/Holiday') {
    return i18n.t('leave:sunday_holiday', { defaultValue: 'Sunday/Holiday' });
  }
  return item.leaveType || 'EL';
}
