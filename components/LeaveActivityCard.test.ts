import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTransactionDate,
  formatAmountNumber,
  getActivityTitle,
  getActivityDescription,
  getActivityBadge
} from '../utils/leaveActivity.ts';

test('formatTransactionDate formats YYYY-MM-DD as DD MMM YYYY', () => {
  assert.equal(formatTransactionDate('2026-10-26'), '26 Oct 2026');
  assert.equal(formatTransactionDate('2026-01-05'), '05 Jan 2026');
  assert.equal(formatTransactionDate('2026-11-08'), '08 Nov 2026');
});

test('formatTransactionDate handles ISO datetime and timestamps', () => {
  const d = new Date('2026-06-26T10:00:00Z');
  const formatted = formatTransactionDate(d);
  assert.match(formatted, /2026/);
  assert.match(formatted, /Jun/);
});

test('formatAmountNumber formats whole and fractional leave values correctly', () => {
  assert.equal(formatAmountNumber(1), '1.0');
  assert.equal(formatAmountNumber(2), '2.0');
  assert.equal(formatAmountNumber(0.5), '0.5');
  assert.equal(formatAmountNumber(1.5), '1.5');
  assert.equal(formatAmountNumber('1'), '1.0');
  assert.equal(formatAmountNumber('0.5'), '0.5');
  assert.equal(formatAmountNumber(null), '0.0');
});

test('getActivityTitle formats earned and consumed titles correctly', () => {
  assert.equal(getActivityTitle({ id: '1', transactionType: 'earned', amount: 1, leaveType: 'EL', transactionDate: '2026-10-26' }), 'Earned 1 EL');
  assert.equal(getActivityTitle({ id: '2', transactionType: 'earned', amount: 0.5, leaveType: 'EL', transactionDate: '2026-10-26' }), 'Earned 0.5 EL');
  assert.equal(getActivityTitle({ id: '3', transactionType: 'consumed', amount: 1, leaveType: 'EL', transactionDate: '2026-10-26' }), 'Consumed 1 EL');
  assert.equal(getActivityTitle({ id: '4', transactionType: 'consumed', amount: 2.5, leaveType: 'EL', transactionDate: '2026-10-26' }), 'Consumed 2.5 EL');
});

test('getActivityDescription respects business rules for monthly, sunday, and function work', () => {
  assert.equal(
    getActivityDescription({ id: '1', transactionType: 'earned', amount: 1, leaveType: 'EL', transactionDate: '2026-10-26', sourceType: 'monthly' }),
    'Monthly leave accrual'
  );
  assert.equal(
    getActivityDescription({ id: '2', transactionType: 'earned', amount: 1, leaveType: 'EL', transactionDate: '2026-10-25', sourceType: 'sunday_work' }),
    'Worked on Sunday'
  );
  assert.equal(
    getActivityDescription({ id: '3', transactionType: 'earned', amount: 1, leaveType: 'EL', transactionDate: '2026-11-08', sourceType: 'function_work', sourceName: 'Diwali Function' }),
    'Worked on Diwali Function'
  );
  assert.equal(
    getActivityDescription({ id: '4', transactionType: 'consumed', amount: 1, leaveType: 'EL', transactionDate: '2026-10-20', reason: 'Annual leave taken' }),
    'Annual leave taken'
  );
});

test('getActivityBadge returns appropriate badge text', () => {
  assert.equal(getActivityBadge({ id: '1', transactionType: 'earned', amount: 1, leaveType: 'EL', transactionDate: '2026-10-26', sourceType: 'monthly' }), 'Monthly Accrual');
  assert.equal(getActivityBadge({ id: '2', transactionType: 'earned', amount: 1, leaveType: 'EL', transactionDate: '2026-10-25', sourceType: 'sunday_work' }), 'Sunday Work');
  assert.equal(getActivityBadge({ id: '3', transactionType: 'earned', amount: 1, leaveType: 'EL', transactionDate: '2026-11-08', sourceType: 'function_work', sourceName: 'Diwali Function' }), 'Diwali Function');
});
