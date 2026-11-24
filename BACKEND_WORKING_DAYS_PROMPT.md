# HRMS Backend Prompt: Leave counts working days only (no Sundays, no holidays)

> **How to use:** paste everything inside the fenced block below into the AI coding assistant (or hand it to the developer) that works in the **server's own repository** (45.122.121.237). The mobile app is already updated: its apply-leave screen shows the working-day count and what is skipped.
>
> **Do not copy the app repo's `backend/` folder onto the server.** It is a different build. It is only a reference for the logic (`utils/workingDays.js`, `utils/employeeHolidays.js`, `routes/leave.js`).
>
> If you are also applying `BACKEND_SPECIAL_LEAVE_PROMPT.md`, do both in one pass: special leave is exempt from this rule (it counts calendar days).

---

````markdown
# TASK: leave must consume working days only

**Goal.** When an employee takes leave, **Sundays and that employee's own holidays must not use up EL or LOP**. Only working days are consumed. Holidays differ per employee: every location has its own holiday calendar, so two employees on the same dates can have different counts.

Example: Mon 21 to Sun 27 Dec. Employee in city A (holidays 23 Dec, 25 Dec) -> 4 working days. Employee in city B (holiday 24 Dec) -> 5 working days. Both skip Sunday 27 Dec.

## Hard rules (read first)
1. Add to the existing leave system; do not rewrite it. Do not change or recalculate leave requests that are already saved or approved.
2. Use the server's **existing** per-employee holiday logic (whatever powers the employee's own holiday list, e.g. a "my holidays" endpoint: employee -> location -> calendar -> holidays). Do not hardcode holidays and do not invent a second lookup that could disagree with what the employee sees. If that logic is inside a route handler, move it into a shared function and have both use it, keeping the route's output identical.
3. Only holidays stored in the database count. If the server falls back to a built-in sample/placeholder holiday list when a calendar is empty, that fallback must **not** reduce anyone's leave.
4. The server counts; ignore any `totalDays` / `elDays` / `lopDays` the client sends.
5. A special leave (marriage / paternity / maternity, request has a `category`) is exempt: it counts calendar days, as before.
6. Do not ask questions; make the smallest reasonable adaptation and mention it in the final report.

## Work order
1. **Explore (read only).** Find: how an employee's holiday calendar is resolved; the leave request model and `POST /api/leaves`; the approve/reject handler; and **every** place that expands a leave's date range into days: ledger/transaction rows, register entries (`consumedFromRequests`, `consumedRecords`, credit `uses`), sync jobs, balance/summary endpoints. Search for `startDate`/`endDate` loops, `getInclusiveDateRange`-style helpers, `elDays`, `lopDays`, `totalDays`, `consumedLeaves`. Write the list down; you need it in step 4.
2. Add the working-day function (section 2).
3. Apply it when a request is created (section 3).
4. Apply it everywhere on your step-1 list (section 4).
5. Expose the holidays to the app (section 5).
6. Test (section 7) and report (section 8).

## 1. Definitions
- Working day = a calendar day in `[startDate, endDate]` (both included) that is **not a Sunday** and **not a holiday in this employee's calendar**.
- A holiday that falls on a Sunday is just a Sunday (count it once, as skipped).
- Holiday dates are free text in the database. Accept `2026-08-15`, `15-08-2026`, `15/08/2026`, `15 Aug 2026`, `Aug 15, 2026`; ignore entries that cannot be read (never guess); refuse impossible dates like `2026-02-31`.

## 2. Reference implementation (tested; copy as is, port line for line if the server is not Node)
```js
const DAY_MS = 86400000;
const MAX_SPAN_DAYS = 3660; // a longer range is invalid, so a mistyped end date cannot loop for ages
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function parseISODate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d), c = new Date(t);
  return c.getUTCFullYear() === y && c.getUTCMonth() === mo - 1 && c.getUTCDate() === d ? t : null;
}
function inclusiveDays(a, b) {
  const s = parseISODate(a), e = parseISODate(b);
  return s === null || e === null || e < s ? 0 : Math.round((e - s) / DAY_MS) + 1;
}
function toISO(year, monthIndex, day) {
  const d = new Date(Date.UTC(year, monthIndex, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthIndex || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}
function normalizeHolidayDate(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return toISO(+m[1], +m[2] - 1, +m[3]);
  if ((m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s))) return toISO(+m[3], +m[2] - 1, +m[1]);
  if ((m = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/.exec(s)) && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined) {
    return toISO(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  }
  if ((m = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(s)) && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) {
    return toISO(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : toISO(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}
// holidays: Map of 'YYYY-MM-DD' -> title, built from THIS employee's calendar only
function splitLeaveDays(startISO, endISO, holidays) {
  const out = { all: [], working: [], sundays: [], holidays: [] };
  const total = inclusiveDays(startISO, endISO);
  if (total === 0 || total > MAX_SPAN_DAYS) return out;
  const start = parseISODate(startISO);
  for (let i = 0; i < total; i++) {
    const t = start + i * DAY_MS, iso = new Date(t).toISOString().slice(0, 10);
    out.all.push(iso);
    if (new Date(t).getUTCDay() === 0) out.sundays.push(iso);
    else if (holidays && holidays.has(iso)) out.holidays.push(iso);
    else out.working.push(iso);
  }
  return out;
}
```
Build the holiday Map from the employee's calendar rows: `for each row: iso = normalizeHolidayDate(row.date); if (iso) map.set(iso, row.title)`. Calendars change rarely and this runs on every leave request, so a short in-memory cache per location (about 60 seconds) is fine.

## 3. `POST /api/leaves` (ordinary leave, no `category`)
1. Resolve the employee from `userId`, which may be the employee **code** (e.g. `HMPL113`, what the app sends) or the internal id. Without the employee there is no location and so no calendar. Save the request under the employee's internal id if that is what the table references.
2. `days = splitLeaveDays(startDate, endDate, thatEmployeesHolidays)`.
3. `days.all` empty -> `400 {"error":"Invalid leave dates."}`.
4. `days.working` empty -> `400 {"error":"The selected dates are all Sundays or holidays, so no leave is needed."}` and nothing is saved.
5. `totalDays = days.working.length`; `elDays = min(availableEL, totalDays)`; `lopDays = totalDays - elDays` (EL pays first, the rest is LOP, as today).

## 4. Everywhere a leave is turned into days
On your step-1 list, count and expand **only `days.working`** (recompute with the same function and the employee's calendar; do not re-derive from the raw date range):
- **Approve** (`PATCH /api/leaves/:id/status` -> approved): consume exactly the request's stored `elDays`. Create ledger/register rows only for working dates: EL for the first `elDays` of them, LOP for the rest. Sundays and holidays get no row.
- **Revoke:** refund exactly the same `elDays` and remove those rows.
- **Fix, if present:** logic of the form "if `elDays` is 0, fall back to the full calendar-day count" wrongly consumes EL for an all-LOP request. For a request that has `totalDays > 0`, an `elDays` of 0 means zero EL days to consume. Keep the calendar-day fallback only for old records that have no `totalDays`.
- Register/summary endpoints must see the same days as the ledger, so a Sunday or holiday never shows as consumed.
- Requests already saved keep their stored numbers; do not migrate them.

## 5. Let the app show the same count
The app calls `GET /api/v1/employees/my-holidays?employeeId=<id>&location=<city>` to show the employee's holidays and to preview the count before they submit. If the server has no such endpoint, add it (or the equivalent already used by the home screen) with this shape:
```json
{ "success": true, "sample": false,
  "holidays": [ { "id": "h-1", "title": "Republic Day", "date": "2026-01-26" } ] }
```
Use this employee's calendar (the same lookup as section 3). Set `"sample": true` only if you return placeholder holidays for an empty calendar; the app ignores sample lists, like section 3 does. Without this endpoint the app can only skip Sundays in its preview (the server still skips holidays when it counts).

## 6. Do not
- Do not hardcode holidays, cities or a Saturday rule. Only Sundays and the employee's stored holidays are skipped.
- Do not change special-leave behaviour or any already-saved request.

## 7. Verify (use a TEST database and test employees, never real staff data)
Create two test employees in different locations with different calendars: city A holidays `2026-12-23` and `25 Dec 2026` (note the second date format); city B holiday `2026-12-24`. (21 Dec 2026 is a Monday, 27 Dec a Sunday.)
1. A applies 21 -> 27 Dec: `201`, `totalDays:4`, `elDays:4`, `lopDays:0`.
2. B applies the same dates: `totalDays:5`.
3. Apply with the employee **code** instead of the id: works, counts 4, and is listed by `GET /api/leaves?userId=<code>`.
4. Send `totalDays:99, elDays:99` in the body: ignored, still 4.
5. A applies for Sunday 27 only -> `400` (Sundays or holidays). A applies for 23 Dec only (A's holiday) -> `400`. B applies for 23 Dec only -> `201`, 1 day (same date, working day for B).
6. A applies 23 -> 24 Dec: `totalDays:1` (23 is a holiday, 24 is not).
7. A test employee with **0 EL** applies for 2 working days: `elDays:0, lopDays:2`. Approving it consumes **0** EL and writes 2 LOP rows.
8. Approve request 1: employee EL consumed increases by exactly **4**; ledger/register has rows only for 21, 22, 24, 26 Dec (none for 23, 25, 27). B's approved request has rows for 21, 22, 23, 25, 26. Reject (revoke) request 1: EL back to the starting value and its rows gone.
9. A special-leave request (if that feature exists) over the same week still counts 7 calendar days.
10. The employee's own holiday list endpoint returns exactly what it returned before your change.
Add automated tests if the repo has a test setup; otherwise run the checks with curl and show the results.

## 8. Final report (required)
Reply with: (a) files changed/added; (b) your step-1 list of places that expand a leave into days, and for each whether it now uses working days only and how; (c) the result of each check in section 7 (pass/fail with the actual responses for 1, 2, 7, 8); (d) any assumption or adaptation. Do not claim a check passed unless you ran it.
````
