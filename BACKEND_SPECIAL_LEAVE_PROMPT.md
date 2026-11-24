# HRMS Backend Prompt: Special Leave (Marriage / Paternity / Maternity)

> **How to use:** paste everything inside the fenced block below into the AI coding assistant (or hand it to the developer) that works in the **server's own repository** (45.122.121.237). The mobile app is finished: the "Leave category" dropdown appears automatically once `GET /api/leaves/categories` works.
>
> **Do not copy the app repo's `backend/` folder onto the server.** It is a different build (it lacks the server's register-based `GET /api/leaves/balances/:id`). It is only a reference for the logic.

---

````markdown
# TASK: add "special leave" to this HRMS backend

**Goal.** Employees can apply for a special leave by category (Marriage 7 days, Paternity 7 days, Maternity 6 months). A special leave has its own allowance: it must **never use Earned Leave (EL) and never become Loss of Pay (LOP)**.

## Hard rules (read first)
1. Add to the existing leave system. Do not rewrite or replace existing leave, register, accrual or approval logic.
2. A request **without** `category` must behave exactly as it does today.
3. A request **with** a category must be invisible to everything that consumes EL (section 5). This is the part most likely to be missed.
4. Adapt table/column names to this server's real schema (examples use `location_leaves`). Check the schema before writing SQL.
5. Do not touch or delete existing data. The migration is additive and must be safe to run twice.
6. Do not ask questions; make the smallest reasonable adaptation and mention it in your final report.

## Work order
1. **Explore (read only).** Find: the leave request model/table; the routes under `/api/leaves`; the approve/reject handler; and **every** place that reads approved leave requests or changes EL. Useful searches: `leaves`, `status.*approved`, `consumedLeaves`, `availableLeaves`, `elDays`, `lopDays`, `credits`, `uses`, `consumedFromRequests`, `balances`, `adjustments`, accrual/cron jobs. Write the list down; you will use it in step 4.
2. **Migrate** (section 1).
3. **Add endpoints** (sections 2-4).
4. **Exclude special leave everywhere on your step-1 list** (section 5).
5. **Test** (section 7), then **report** (section 8).

## 1. Data
```sql
CREATE TABLE IF NOT EXISTS location_leave_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          VARCHAR(255) NOT NULL UNIQUE,                 -- stable key the app sends, e.g. 'marriage'
  name          VARCHAR(255) NOT NULL,                        -- display name, e.g. 'Marriage Leave'
  duration_value INTEGER NOT NULL CHECK (duration_value >= 1),
  duration_unit VARCHAR(255) NOT NULL DEFAULT 'days' CHECK (duration_unit IN ('days', 'months')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE location_leaves ADD COLUMN IF NOT EXISTS leave_category VARCHAR(255);  -- NULL = ordinary EL/LOP leave

INSERT INTO location_leave_categories (code, name, duration_value, duration_unit, sort_order) VALUES
  ('marriage',  'Marriage Leave',  7, 'days',   1),
  ('paternity', 'Paternity Leave', 7, 'days',   2),
  ('maternity', 'Maternity Leave', 6, 'months', 3)
ON CONFLICT (code) DO NOTHING;
```
Wire it in however this server already runs migrations (startup migration, migration file, or script). Add the model/ORM mapping for the new table and column.

## 2. `GET /api/leaves/categories`
Active rows ordered by `sort_order`, then `name`; exactly these four fields:
```json
[{ "code": "marriage", "name": "Marriage Leave", "durationValue": 7, "durationUnit": "days" }]
```
Register it **before** any `/:id` GET route under `/api/leaves`. No authentication changes: it must answer the same way the other `/api/leaves` GET routes do.

## 3. `POST /api/leaves` with `category`
The app sends: `{ userId, userName, startDate, endDate, category, reason }` (dates `YYYY-MM-DD`).

If `category` is present and non-empty, do this **instead of** the normal EL/LOP logic:
1. Category must exist and be active, else `400 {"error":"Unknown leave category."}`.
2. Dates must be real (refuse `2026-02-31`) with `endDate >= startDate`, else `400 {"error":"Invalid leave dates."}`.
3. `endDate` must be `<= maxEndDate(startDate, durationValue, durationUnit)` (section 6), else `400 {"error":"Marriage Leave allows up to 7 days."}` (category name; `"<n> day(s)"` / `"<n> month(s)"`).
4. Do not read the EL balance. Ignore any `type`, `elDays`, `lopDays`, `totalDays` in the body.
5. Save `status:"pending"`, `type` = category `name`, `leave_category` = `code`, `elDays=0`, `lopDays=0`, `totalDays` = calendar days counting both ends.
6. Respond `201` with the saved request including `category`.

## 4. `GET /api/leaves?userId=...`
Every request in the response carries `category` (code or `null`) and `type`.

## 5. Exclude special leave from EL (the critical part)
Wherever approved leave requests are turned into EL consumption, skip rows where `leave_category IS NOT NULL`:
- Approve and revoke (`PATCH /api/leaves/:id/status`) only change the status. They must not consume or refund EL and must not change `consumedLeaves` / `availableLeaves` / `allowedLeaves`.
- No ledger/register row of any kind for it (no consumed transactions, no register `uses`, no credit drawn down).
- It must not show up in anything computed from approved requests: `GET /api/leaves/balances/:id` (`months[].consumedFromRequests`, `consumedLeave`, `usage`, `credits[].uses`, `yearSummary`, `currentBalance`), `GET /api/leaves/adjustments`, employee profile leave fields, monthly roll-ups, accrual jobs.

## 6. Duration rule (reference implementation, tested; copy as is)
Counted from the start date, both ends included. `days`: start + (value - 1) days. `months`: same day-of-month `value` months later (clamped to that month's last day) minus 1 day. Examples: 7 days from 2026-10-20 ends 2026-10-26; 6 months from 2026-11-01 ends 2027-04-30; from 2026-08-31 ends 2027-02-27.
```js
const DAY_MS = 86400000;
function parseISODate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d), c = new Date(t);
  return c.getUTCFullYear() === y && c.getUTCMonth() === mo - 1 && c.getUTCDate() === d ? t : null; // refuses 2026-02-31
}
const toISODate = (t) => new Date(t).toISOString().slice(0, 10);
function inclusiveDays(a, b) {
  const s = parseISODate(a), e = parseISODate(b);
  return s === null || e === null || e < s ? 0 : Math.round((e - s) / DAY_MS) + 1;
}
function addMonthsClamped(t, months) {
  const d = new Date(t), target = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(d.getUTCFullYear(), target + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), target, Math.min(d.getUTCDate(), last));
}
function maxEndDate(startISO, value, unit) {
  const s = parseISODate(startISO), n = Number(value);
  if (s === null || !Number.isInteger(n) || n < 1) return null;
  if (unit === 'days') return toISODate(s + (n - 1) * DAY_MS);
  if (unit === 'months') return toISODate(addMonthsClamped(s, n) - DAY_MS);
  return null;
}
```
If the server is not Node, port it line for line and keep the same results.

## 7. Verify (use a TEST employee and a TEST/dev database, never real staff data)
Record the employee's EL fields and `GET /api/leaves/balances/:id` **before**. Then all of these must hold:
1. `GET /api/leaves/categories` -> 3 categories in order marriage, paternity, maternity.
2. POST marriage `2026-11-02 -> 2026-11-08` -> `201`, `type:"Marriage Leave"`, `category:"marriage"`, `elDays:0`, `lopDays:0`, `totalDays:7`, `status:"pending"`.
3. Same with `endDate 2026-11-09` -> `400` "Marriage Leave allows up to 7 days."
4. POST maternity `2026-11-01 -> 2027-04-30` -> `201`, `totalDays:181`; `endDate 2027-05-01` -> `400`.
5. POST paternity for 3 days -> `201`.
6. Unknown category, end before start, `2026-02-31` -> each `400`, nothing saved.
7. Approve the marriage request, then reject it. After **each** step: EL fields identical to *before*, no ledger/register row for it, and `GET /api/leaves/balances/:id` identical to *before*.
8. An ordinary request (no `category`) still gets its EL/LOP split, still consumes EL when approved, and still appears in the register exactly as before.
9. `GET /api/leaves?userId=...` shows `category:"marriage"` on the special request and `category:null` on the ordinary one.
Add automated tests if the repo has a test setup; otherwise run the checks with curl and show the results.

## 8. Final report (required)
Reply with: (a) files changed/added; (b) the step-1 list of places that read approved leave requests, and for each, whether you excluded special leave and how; (c) the result of each check in section 7 (pass/fail, with the actual response for 2, 3, 7); (d) any assumption or adaptation you made. Do not claim a check passed unless you ran it.
````
