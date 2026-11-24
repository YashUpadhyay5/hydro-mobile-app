import type { LeaveTransaction } from '@/services/leaveService';

import i18n from '@/src/i18n';
import { getDateLocale } from '@/src/i18n/dateLocale';

const EPSILON = 1e-6;

const toDays = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

const fmtDays = (n: number): string => String(Math.round(n * 100) / 100);

/** "2026-10-20" from an ISO date or timestamp string, or null when the server sent no usable date. */
const isoDate = (value: unknown): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof value === 'string' ? value : '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

const isSunday = (iso: string): boolean => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
};

const monthStart = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}-01`;
const monthLabel = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(getDateLocale(), { month: 'short', year: 'numeric', timeZone: 'UTC' });
const validMonth = (year: unknown, month: unknown) => Number.isInteger(year) && Number(month) >= 1 && Number(month) <= 12;

interface CreditLabel {
  /** What the credit is called: "Earned Leave", "Sunday" or a holiday's name. */
  name: string;
  special: boolean;
  isSunday: boolean;
  holidayName?: string;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/**
 * Turns an employee's leave register (GET /leaves/balances/:id, one year) into the activity list the
 * Leave screen shows, for servers that keep leave as a register and have no /leaves/transactions.
 *
 * Everything comes from the register's credits, the units of leave the employee earned:
 *  - Earned rows: one per credit. A monthly credit is "Earned Leave +1"; a credit earned by working a
 *    Sunday is "Sunday +1", and one earned on a holiday carries the holiday's name.
 *  - Consumed rows: one per day the credits were used (each credit lists `uses`, with the date and
 *    the leave request it paid for), with a short "Adjusted from ..." line naming which credits paid.
 *    The server decides which credit pays first; the order is shown as it recorded it.
 *
 * Where the server only knows the month (data imported month by month) the row carries `periodLabel`
 * ("Aug 2026") instead of a day, and nothing here makes a day up.
 *
 * The register's `history` array is deliberately not used. It is the audit trail of every correction
 * ever made, including values later replaced, so adding it up does not match the balance.
 */
export function ledgerToTransactions(register: any): LeaveTransaction[] {
  const credits: any[] = Array.isArray(register?.credits) ? register.credits : [];
  const months: any[] = Array.isArray(register?.months) ? register.months : [];
  const employeeId = String(register?.employeeId ?? register?.empCode ?? '');

  // Where the server names a Sunday/holiday credit: in the usage that spent it, or in the month's special records.
  const namedBy = new Map<string, { type?: string; holidayName?: string }>();
  for (const m of months) {
    for (const f of Array.isArray(m?.usage?.from) ? m.usage.from : []) {
      if (f?.creditId) namedBy.set(String(f.creditId), { type: text(f.type), holidayName: text(f.holidayName) });
    }
    for (const rec of Array.isArray(m?.specialEarnedRecords) ? m.specialEarnedRecords : []) {
      const id = rec?.creditId ?? rec?.id;
      if (id != null && !namedBy.has(String(id))) {
        namedBy.set(String(id), { type: text(rec.type), holidayName: text(rec.holidayName) ?? text(rec.name) });
      }
    }
  }

  const labelOf = (credit: any): CreditLabel => {
    if (String(credit?.kind ?? '').toUpperCase() === 'EL') {
      return { name: i18n.t('leave:earned_leave', { defaultValue: 'Earned Leave' }), special: false, isSunday: false };
    }
    const named = namedBy.get(String(credit?.id)) ?? {};
    const holidayName = text(credit?.holidayName) ?? named.holidayName;
    const date = isoDate(credit?.date);
    const sunday = !holidayName && (/sun/i.test(text(credit?.type) ?? named.type ?? '') || (date ? isSunday(date) : false));
    return { name: holidayName ?? (sunday ? i18n.t('leave:sunday', { defaultValue: 'Sunday' }) : i18n.t('leave:sunday_holiday', { defaultValue: 'Sunday/Holiday' })), special: true, isSunday: sunday, holidayName };
  };

  const rows: LeaveTransaction[] = [];

  // Earned: one row per credit.
  for (const credit of credits) {
    const days = toDays(credit?.days);
    const year = Number(credit?.year);
    const month = Number(credit?.month);
    if (days <= 0 || !validMonth(year, month)) continue;

    const label = labelOf(credit);
    const date = isoDate(credit.date);
    const period = monthLabel(year, month);
    const base = {
      id: `${employeeId}:earned:${credit.id}`,
      employeeId,
      userId: employeeId,
      transactionType: 'earned' as const,
      amount: days,
      title: label.name,
      transactionDate: date ?? monthStart(year, month),
      periodLabel: date ? undefined : period,
    };

    if (!label.special) {
      rows.push({ ...base, leaveType: 'EL', sourceType: 'monthly', reason: i18n.t('leave:reason_monthly', { defaultValue: 'Monthly earned leave for {{period}}', period }) });
    } else if (label.holidayName) {
      rows.push({
        ...base,
        leaveType: 'Sunday/Holiday',
        sourceType: 'holiday_work',
        sourceName: label.holidayName,
        reason: i18n.t('leave:reason_worked_on', { defaultValue: 'Worked on {{name}}', name: label.holidayName }),
      });
    } else if (label.isSunday) {
      rows.push({ ...base, leaveType: 'Sunday/Holiday', sourceType: 'sunday_work', reason: i18n.t('leave:worked_on_sunday', { defaultValue: 'Worked on Sunday' }) });
    } else {
      rows.push({ ...base, leaveType: 'Sunday/Holiday', sourceType: 'special_earned', reason: i18n.t('leave:worked_on_sunday_or_holiday', { defaultValue: 'Worked on a Sunday or holiday' }) });
    }
  }

  // Consumed: one row per day the credits were used (or per month, when the server only knows the month).
  interface Spend { key: string; date: string | null; year: number; month: number; days: number; from: CreditLabel; leaveId?: string }
  const spends: Spend[] = [];
  for (const credit of credits) {
    const from = labelOf(credit);
    for (const use of Array.isArray(credit?.uses) ? credit.uses : []) {
      const days = toDays(use?.days);
      const year = Number(use?.year);
      const month = Number(use?.month);
      const date = isoDate(use?.date);
      if (days <= 0 || !(date || validMonth(year, month))) continue;
      const [y, mo] = date ? date.split('-').map(Number) : [year, month];
      spends.push({ key: date ?? `${y}-${String(mo).padStart(2, '0')}`, date, year: y, month: mo, days, from, leaveId: use?.leaveId ?? undefined });
    }
  }

  const spentInMonth = new Map<string, number>();
  const groups = new Map<string, Spend[]>();
  for (const s of spends) {
    const sameDay = groups.get(s.key);
    if (sameDay) sameDay.push(s);
    else groups.set(s.key, [s]);
    const mk = `${s.year}-${s.month}`;
    spentInMonth.set(mk, (spentInMonth.get(mk) ?? 0) + s.days);
  }

  for (const [key, group] of groups) {
    const { date, year, month } = group[0];
    const byName = new Map<string, number>();
    for (const s of group) byName.set(s.from.name, (byName.get(s.from.name) ?? 0) + s.days);
    const adjustedFrom = Array.from(byName, ([name, d]) => `${name} (${fmtDays(d)})`).join(' + ');
    rows.push({
      id: `${employeeId}:consumed:${key}`,
      employeeId,
      userId: employeeId,
      transactionType: 'consumed',
      leaveType: 'EL',
      amount: group.reduce((sum, s) => sum + s.days, 0),
      title: i18n.t('leave:leave_consumed', { defaultValue: 'Leave consumed' }),
      transactionDate: date ?? monthStart(year, month),
      periodLabel: date ? undefined : monthLabel(year, month),
      sourceType: 'leave_request',
      relatedLeaveId: group.find((s) => s.leaveId)?.leaveId ?? null,
      reason: i18n.t('leave:adjusted_from', { defaultValue: 'Adjusted from {{sources}}', sources: adjustedFrom }),
    });
  }

  // Anything the server counts as consumed that no credit accounts for (for example days beyond the
  // balance) still has to show, or the list would not add up to the balance.
  for (const m of months) {
    const year = Number(m?.year);
    const month = Number(m?.month);
    if (!m || m.inLedger === false || !validMonth(year, month)) continue;
    const residual = toDays(m.consumedLeave) - (spentInMonth.get(`${year}-${month}`) ?? 0);
    if (residual > EPSILON) {
      rows.push({
        id: `${employeeId}:consumed:uncovered:${year}-${String(month).padStart(2, '0')}`,
        employeeId,
        userId: employeeId,
        transactionType: 'consumed',
        leaveType: 'EL',
        amount: Math.round(residual * 100) / 100,
        title: i18n.t('leave:leave_consumed', { defaultValue: 'Leave consumed' }),
        transactionDate: monthStart(year, month),
        periodLabel: monthLabel(year, month),
        sourceType: 'leave_request',
        reason: i18n.t('leave:not_covered', { defaultValue: 'Not covered by any earned leave' }),
      });
    }
  }

  return rows;
}
