// Run with: node --test utils/leaveBalance.test.ts  (Node 22.18+ runs TypeScript directly)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLeaveSummary, mergeLeaveFields, countInclusiveDays, estimateLeaveSplit, formatLeaveDays } from './leaveBalance.ts';

test('availableLeaves from the server is used as the remaining balance, never recomputed', () => {
  const s = getLeaveSummary({ availableLeaves: 7.5, totalEarnedLeaves: 12, consumedLeaves: 99 });
  assert.equal(s.available, 7.5);
  assert.equal(s.totalEarned, 12);
});

test('nothing is invented: an employee with no leave data gets nulls, not 15 or 0', () => {
  assert.deepEqual(getLeaveSummary({}), { available: null, totalEarned: null, consumed: null });
  assert.deepEqual(getLeaveSummary(null), { available: null, totalEarned: null, consumed: null });
  assert.equal(formatLeaveDays(null), '–');
  assert.equal(formatLeaveDays(0), '0');
});

test('older servers (allowed/consumed only) still give a balance', () => {
  const s = getLeaveSummary({ allowedLeaves: 10, consumedLeaves: 4 });
  assert.deepEqual(s, { available: 6, totalEarned: 10, consumed: 4 });
});

test('consumed is read from leaveBalance.consumed or derived when consumedLeaves is 0 but earned exceeds available', () => {
  const s = getLeaveSummary({
    totalEarnedLeaves: 6,
    availableLeaves: 2.5,
    consumedLeaves: 0,
    leaveBalance: { credited: 6, consumed: 3.5, available: 2.5 }
  });
  assert.equal(s.totalEarned, 6);
  assert.equal(s.consumed, 3.5);
  assert.equal(s.available, 2.5);
});

test('numeric strings from the API are accepted', () => {
  assert.equal(getLeaveSummary({ availableLeaves: '4' }).available, 4);
  assert.equal(getLeaveSummary({ availableLeaves: 'abc' }).available, null);
});

test('after an approval the refreshed figures replace the stale ones from login', () => {
  const loginProfile = { allowedLeaves: 12, consumedLeaves: 1, availableLeaves: 11 };
  const fresh = { availableLeaves: 8, totalEarnedLeaves: 12, leaveBalance: { note: 'x' } };
  const merged = mergeLeaveFields(loginProfile, fresh);
  assert.equal(merged.availableLeaves, 8);
  assert.equal(merged.consumedLeaves, undefined, 'login-time consumedLeaves must not survive');
  assert.equal(merged.allowedLeaves, undefined);
  const s = getLeaveSummary({ ...loginProfile, ...merged });
  assert.deepEqual(s, { available: 8, totalEarned: 12, consumed: 4 });
});

test('a refresh from an older server keeps the previous values it does not send', () => {
  const merged = mergeLeaveFields({ allowedLeaves: 12, consumedLeaves: 1 }, { consumedLeaves: 3 });
  assert.equal(merged.allowedLeaves, 12);
  assert.equal(merged.consumedLeaves, 3);
});

test('days are counted inclusively from the dates, independent of time zone', () => {
  assert.equal(countInclusiveDays('2026-10-25', '2026-10-26'), 2);
  assert.equal(countInclusiveDays('2026-10-25', '2026-10-25'), 1);
  assert.equal(countInclusiveDays('2026-10-30', '2026-11-02'), 4);
  assert.equal(countInclusiveDays('2026-10-26', '2026-10-25'), 0);
  assert.equal(countInclusiveDays('', '2026-10-25'), 0);
  assert.equal(countInclusiveDays('2026-10-25T00:00:00.000Z', '2026-10-27T00:00:00.000Z'), 3);
});

test('the preview splits a request into earned leave and loss of pay', () => {
  assert.deepEqual(estimateLeaveSplit(2, 5), { el: 2, lop: 0 });
  assert.deepEqual(estimateLeaveSplit(5, 2), { el: 2, lop: 3 });
  assert.deepEqual(estimateLeaveSplit(3, 0), { el: 0, lop: 3 });
  assert.deepEqual(estimateLeaveSplit(2, 1.5), { el: 1.5, lop: 0.5 });
  assert.equal(estimateLeaveSplit(3, null), null, 'unknown balance: no invented split');
  assert.equal(estimateLeaveSplit(0, 5), null);
});
