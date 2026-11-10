# Alabaster Nutrition — Web Version: Design

Date: 2026-11-09
Status: draft for owner approval

## 1. Purpose

Run the store's time clock and schedule on the web while the Apple Developer Program enrollment is pending. Punches recorded here are used for real payroll, so the data must be durable, shared across devices, and protected from tampering.

The native app design (`2026-11-08-scheduling-timekeeping-design.md`) stays the long-term plan. When the native app ships, history is exported from the web version, or the web version stays if it is working well. That choice is made later.

### Who uses what

| Person | Device | Can do |
|---|---|---|
| Employee | Store iPad (kiosk) | Clock in/out, start/end break with a 4-digit PIN; see their upcoming shifts |
| Employee | Own phone (email sign-in) | View the published schedule only. Cannot clock in. |
| Owner/manager | Store iPad, with manager PIN | Same manager tools as below, at the counter |
| Owner/manager | Own phone or Mac (email sign-in) | Team, PINs, schedule, timesheets, export, kiosk settings |

### Version 1 scope

- Kiosk time clock: PIN keypad, clock in/out, breaks, confirmation, upcoming shifts.
- Team: add/deactivate employees, set an email for phone sign-in, assign/reset PINs.
- Schedule: build weekly shifts, publish the week; employees see published weeks on their phones.
- Timesheets: per pay period (weekly), fix punches with a required reason, approve, CSV export.
- Missing clock-out flag after 12 hours.

Not in version 1: time-off/availability/swap requests, notifications, overtime rules beyond showing weekly totals.

## 2. Architecture

- **App:** the existing Next.js 16 app in `prototype/`, renamed to `web/`. The mock data and in-memory model are replaced by server-side data; the screens and branding are reused.
- **Hosting:** Vercel Pro (the free plan does not allow commercial use).
- **Database:** Neon Postgres through the Vercel Marketplace, accessed with Drizzle ORM. Migrations are checked into the repo.
- **Sign-in:** Clerk (Vercel Marketplace) with email links or codes. Sign-up is restricted: only the owner's email and emails the manager adds to employees can sign in.
- **Writes:** Server Actions, every one checking the caller (signed-in manager, signed-in employee, or enrolled kiosk) on the server.

## 3. Security

### Kiosk enrollment

The PIN keypad only works on a device the manager has enrolled.

1. The manager signs in on the store iPad and taps "Make this the store kiosk".
2. The server creates a `KioskDevice` row with a random 32-byte token, stores only its SHA-256 hash, and sets the token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie lasting one year.
3. Every kiosk request (PIN check, punch) requires a cookie matching an active `KioskDevice`. Other browsers see "This device isn't the store kiosk."
4. The manager can revoke a kiosk from Settings, for example if the iPad is lost or replaced.

### PINs

- 4 digits, unique among active employees. Simple PINs (all the same digit, or sequential like 1234/4321) are rejected.
- Stored as HMAC-SHA256 with a server secret (`PIN_PEPPER` env var). With only 10,000 possible PINs a plain salted hash is easy to brute-force if the database leaks; the secret, stored outside the database, prevents that. It also allows a unique index for the uniqueness rule.
- 5 wrong PINs on a kiosk lock its keypad for 30 seconds (tracked per kiosk on the server).
- The manager PIN is separate from the manager's employee PIN and opens the manager area on the kiosk. The manager area on the kiosk locks after 2 minutes idle.

### Accounts

- Manager emails are set in an env var (`MANAGER_EMAILS`, comma-separated). Everyone listed has full manager access.
- An employee's phone sign-in works only if the manager has saved that exact email on an active employee. Deactivating the employee removes access.
- Employees can read only published shifts. They cannot read punches, PINs, or other employees' pay data.

### Audit

Punches are never deleted or overwritten. A fix creates a `PunchAdjustment` row with the manager, time, old value, new value, and a required reason. Timesheets show the adjusted value with a marker.

## 4. Data

Times are stored in UTC and shown in the business time zone (`America/New_York`).

- `Business`: name, time zone, pay-period anchor (weekly), missing-clock-out hours (12), kiosk auto-return seconds (10), manager PIN hash.
- `Employee`: id, display name, role (manager/employee), color index, active flag, email (nullable, unique), PIN hash (nullable, unique among active).
- `KioskDevice`: id, label, token hash, created at, revoked at, failed attempts, locked until.
- `Punch`: id, employee id, kind (clockIn, clockOut, breakStart, breakEnd), at, kiosk device id.
- `PunchAdjustment`: id, punch id (nullable for an added punch), employee id, kind, new time (nullable for a removed punch), reason, manager, created at.
- `Shift`: id, employee id, starts at, ends at, note, week id.
- `ScheduleWeek`: id, week start date, published at (nullable).
- `TimesheetApproval`: id, employee id, period start, approved by, approved at.

Punch rules (shared by the kiosk and timesheet math, unit-tested): an employee's next allowed action follows from their last effective punch — out → clock in; in → break or clock out; on break → end break. Clocking out while on break ends the break first.

## 5. Screens

- **Kiosk** (`/kiosk`): reuses the prototype's PIN screen, clock screen, and confirmation. Returns to the keypad 10 seconds after idle or 3 seconds after an action. A small "Manager" button opens the manager PIN pad.
- **Manager** (`/manage`): Today (who is in, on break, missing clock-out), Schedule (week grid, add/edit shifts, Publish), Timesheets (per period, fixes, approve, Export CSV), Team (employees, emails, PINs), Settings (kiosks, manager PIN, business settings).
- **Employee** (`/schedule`): published shifts for this week and next; nothing else.
- **Sign-in** (`/sign-in`): Clerk email sign-in with Alabaster branding.

## 6. Error handling

- Kiosk offline: show "No connection — punch not saved. Try again." Punches are never queued silently, so the time recorded is always the server's time.
- Double taps: each punch action carries a client-generated id; the server ignores a repeat id.
- Clock skew: the server sets every punch time.
- A punch that doesn't match the employee's state (for example ending a break that never started) is rejected with a clear message and the screen refreshes.

## 7. Testing

- Unit tests (Vitest): punch state rules, timesheet totals including breaks and adjustments, pay-period boundaries across daylight-saving changes, PIN rules, CSV output.
- Integration tests against a test database branch: Server Actions enforce access (kiosk cookie, manager, employee) and audit rows are written.
- Manual check before first real use: enroll the iPad, clock in/out with two employees, fix a punch, export CSV, and confirm an employee's phone sees only the published schedule.

## 8. Rollout

1. Build and test locally.
2. Create the Vercel project, add Neon and Clerk from the Marketplace, set `MANAGER_EMAILS`, `PIN_PEPPER`, and `SESSION_SECRET`.
3. Deploy, sign in as the owner, add employees and PINs, enroll the store iPad, and turn on Guided Access on the iPad (Settings → Accessibility → Guided Access) with Safari open to the kiosk page. Optionally add the page to the Home Screen first.
4. Run the manual check, then start using it.

## 9. Owner decisions recorded

- Real use for payroll, shared across the iPad, owner devices, and employee phones.
- Vercel Pro hosting.
- Employees sign in on phones with an email link to view the schedule only; clocking in happens only on the store iPad.
