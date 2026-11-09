# Alabaster Nutrition — Scheduling & Timekeeping App: Design

Date: 2026-11-08 (revised: store iPad with PIN clock-in)
Status: Approved design, pending written-spec review

## 1. Purpose

A native Apple app for Alabaster Nutrition (101 E Front St, Sylvester, GA) that lets managers build and publish employee shift schedules, lets staff clock in and out on the shop's iPad with a 4-digit PIN, and turns those punches into approved timesheets that can be exported for payroll.

### Users
- **Owner/Manager** — the person who creates the business in the app. Builds schedules, assigns PINs, approves timesheets and requests. Also works shifts and clocks in at the store iPad like an employee.
- **Employee** — clocks in and out on the store iPad with a PIN the manager assigns. Can optionally install the app on their own iPhone, via an invite link, to view the schedule and submit requests.

Clocking in needs only a PIN. An Apple device and Apple Account are needed only for the optional phone app.

### Devices
- **Store iPad** — stays at the shop, signed in to the manager's Apple Account, running the app in kiosk mode.
- **Employee iPhones** — optional; schedule and requests only. No clock-in.
- **Manager's own iPhone, iPad, or Mac** — optional; full manager tools.

One multiplatform SwiftUI codebase. Apple Watch and web are out of scope.

### Version 1 scope
1. Managers create and publish weekly shift schedules.
2. Employees clock in/out, with breaks, on the store iPad using a 4-digit PIN.
3. Timesheets per pay period, with manager adjustments and approval.
4. Export timesheets as CSV and PDF.
5. Employees submit availability and time-off requests from their phones.
6. Shift swaps and open shifts employees can pick up.
7. Notifications: schedule published, shift reminders, request updates.
8. Kiosk mode on the store iPad, with the manager area protected by a manager PIN plus Face ID or Touch ID.

Out of scope for v1: clocking in from personal phones, viewing hours on personal phones, photo capture at clock-in, overtime and labor-cost tracking, multiple locations, multiple managers with edit rights, payroll integrations, web dashboard.

## 2. Architecture

### Stack
- SwiftUI multiplatform app (iOS, iPadOS, macOS).
- Core Data + `NSPersistentCloudKitContainer` with CloudKit sharing (`CKShare`). SwiftData's built-in CloudKit sync does not support shared databases; this must be re-verified against current Apple documentation before implementation begins, and SwiftData adopted instead if it now supports sharing.
- CryptoKit for PIN hashing; LocalAuthentication for Face ID / Touch ID on the manager area.
- UserNotifications for local notifications.
- No custom server. Cost is the Apple Developer Program fee only.

### Modules (local Swift packages)
| Module | Responsibility | Depends on |
|---|---|---|
| `Domain` | Plain Swift value types and rules: hour totals, breaks, pay periods, conflict detection, swap rules, CSV generation, PIN rules and lockout. | Foundation only |
| `Persistence` | Core Data model, CloudKit container setup, repository protocols the features use. Determines the current user's role: `BusinessRepository.membership()` checks which store the Business lives in. | `Domain` |
| `Sharing` | Create the Business zone, create/accept invites, discover employee zones. | `Persistence` |
| `Kiosk` | PIN keypad, PIN verification, lockout, kiosk session timeout, manager unlock. | `Domain`, `Persistence` |
| `Features` | SwiftUI screens and view models for each tab. | `Domain`, `Brand`, `Persistence`, `Sharing`, `Kiosk` |
| `Brand` | Colors, fonts, pattern assets, reusable framed-panel and card components. | SwiftUI |

Features never touch CloudKit directly; they talk to repository protocols, which lets them be tested against an in-memory store.

### Data ownership
CloudKit sharing grants the same permission to everyone a zone is shared with, so data is split by who may see it:

| Zone | Owner | Shared with | Records |
|---|---|---|---|
| Business zone | Manager | All employees with the phone app, read-only | `Business`, `Employee`, `Shift`, `RequestDecision` |
| Timekeeping zone | Manager | Nobody | `EmployeePIN`, `TimePunch`, `TimesheetAdjustment`, `TimesheetApproval` |
| Employee zone (one per employee with the phone app) | That employee | Manager, read-only | `Availability`, `TimeOffRequest`, `SwapRequest`, `OpenShiftClaim` |

Because punches are made on the store iPad, which is signed in to the manager's account, all timekeeping data lives in the manager's unshared Timekeeping zone. Coworkers never see each other's hours, and PIN hashes are never in a shared zone.

Role is derived from zone ownership: if the current user owns the Business zone they are the manager. The store iPad is a manager device that opens in kiosk mode.

### Records
- `Business`: name, timezone, pay-period rule (weekly or biweekly, plus anchor date), missing-clock-out threshold (default 12 h), kiosk auto-return delay (default 10 s).
- `Employee`: display name, role, schedule color, CloudKit participant identity (optional, set only when they join on a phone), active flag.
- `EmployeePIN`: employee, salted SHA-256 hash, updated at. One record also holds the manager PIN.
- `Shift`: employee (optional when open), start, end, position label, status (`draft`, `published`, `open`).
- `TimePunch`: employee, kind (`clockIn`, `clockOut`, `breakStart`, `breakEnd`), timestamp, device name, `correctsPunchID` (optional).
- `TimesheetAdjustment`: employee, pay period, minutes added or removed, required note, author.
- `TimesheetApproval`: employee, pay period, approved total minutes, snapshot hash of punches and adjustments used, approved at.
- `Availability`: weekday, start, end, or unavailable all day.
- `TimeOffRequest`: start date, end date, note.
- `SwapRequest`: shift, optional target employee (blank means offered to anyone).
- `OpenShiftClaim`: shift.
- `RequestDecision`: request reference, outcome (`approved`, `denied`), note, decided at.

### Data rules
- Punches are append-only. A correction is a new punch referencing the original via `correctsPunchID`.
- Manager hour changes are `TimesheetAdjustment` records; punches are never edited.
- Requests are two-sided: the employee writes the request in their zone; the manager writes the `RequestDecision` in the Business zone. On approving a swap or open-shift claim, the manager's device reassigns the `Shift`.
- Times are stored in UTC and displayed in the business timezone.

### PIN rules
- The manager assigns each employee a 4-digit PIN; PINs must be unique across active employees. The app can suggest a random unused PIN.
- PINs are stored only as salted hashes and are shown in full only at the moment they are set.
- Simple PINs are rejected: `0000`, `1234`, and other all-same or sequential digits.
- After 5 wrong attempts in a row the keypad locks for 30 seconds.
- The manager PIN is separate from the manager's employee PIN, and Face ID / Touch ID can be used instead of it when the iPad supports it.
- Deactivating an employee disables their PIN immediately.

## 3. Branding

Source: the Alabaster Nutrition Facebook page (screenshots in `docs/branding/`). Colors below are estimated from screenshots; official values replace them when provided.

| Role | Color | Use |
|---|---|---|
| Porcelain blue (primary) | `#3E5C9A` | Buttons, active tab, clock-in button, wordmark |
| Sage green (secondary) | `#A9BC98` | Cards, headers, calendar backgrounds |
| Alabaster white | `#FAF8F3` | App background |
| Ink | `#1F2A44` | Body text |
| Gilt accent | `#9C7A3C` | Thin frame borders, small highlights only |

- Dark mode: deep navy background with softened porcelain blue.
- Typography: an openly licensed script font for the "Alabaster" wordmark and an openly licensed serif for large headings, as look-alikes of the shop's sign. All other text uses SF Pro with Dynamic Type.
- Motifs: blue-and-white ginger-jar pattern on the app icon, launch screen, kiosk keypad screen, sign-in and empty states only. The sage framed panel with notched corners and a thin dark/gilt border is used for highlight cards ("Your next shift", the clock-in confirmation).
- Employee schedule colors drawn from blue, sage, and complementary porcelain tones.
- App icon: simplified porcelain-patterned cup on white.
- Official logo files, exact colors, and licensed fonts can be swapped in later as asset replacements only.

## 4. Screens

### Store iPad (kiosk)
1. **Keypad** — wordmark, current time, and a large 4-digit keypad. No employee names are shown. A small "Manager" button in the corner.
2. **Employee screen** (after a correct PIN) — "Hi, Ava", current status, and one large action: Clock In, or Start Break / End Break / Clock Out when already clocked in. Shows today's shift and their upcoming shifts this week. Returns to the keypad 3 seconds after an action, or after 10 seconds of no activity.
3. **Confirmation** — "Clocked in at 6:58 AM" in a framed panel, then back to the keypad.
4. **Manager unlock** — Face ID / Touch ID, falling back to the manager PIN, then opens the full manager tools. The manager area locks again after 2 minutes of no activity or when "Lock" is tapped.

The iPad is kept in the app with Guided Access (iPadOS setting), so employees can't leave the kiosk.

### Employee phone (optional)
iPhone uses a tab bar.
1. **Today** — "Your next shift" card and whether they're scheduled today.
2. **Schedule** — my week, toggle to full team; open shifts show "Pick up"; my shifts show "Offer swap".
3. **Requests** — submit availability or time off; see status of each.

### Manager
On the store iPad (after unlock) and on the manager's own devices. iPad and Mac use a sidebar with multi-column layouts.
1. **Today** — who's clocked in, who's late, missing clock-outs.
2. **Schedule** — week grid (people × days). Drag to create/move shifts, copy last week, availability and approved time off shown inline. Shifts are drafts until **Publish**.
3. **Timesheets** — per-employee pay-period totals, punch review, adjustments with required notes, approve, export CSV/PDF.
4. **Requests** — approve or deny, with schedule conflicts shown before deciding.
5. **Settings** — business info, pay period, team (add, deactivate, invite to the phone app), set or reset employee PINs, manager PIN, kiosk options.

### Data flow
Writes go to the local store first so the UI updates immediately and works offline. CloudKit syncs in the background. When remote changes arrive, each device posts its own local notifications:
- Employees: "Schedule for <week> published", "Your <request> was approved/denied".
- Manager: "New time-off request", "New swap request", "Missing clock-out".
- Shift reminders are scheduled on each employee's phone 30 minutes before each of their published shifts and rescheduled whenever the schedule changes.

### Export
- CSV: one row per employee per pay period (name, regular minutes, adjustments, total hours, approval status), plus an optional detail file with every punch.
- PDF: one page per employee with punches, adjustments, total, and approval details.
- Shared via the system share sheet.

## 5. Error handling and edge cases

| Situation | Behavior |
|---|---|
| Store iPad offline | Punches save locally with exact timestamps and sync when back online. Clocking in never depends on the network. |
| Wrong PIN | "That PIN didn't match." After 5 wrong tries, keypad locks for 30 seconds. |
| Forgotten PIN | Manager resets it in Settings. |
| Employee walks away mid-session | Kiosk returns to the keypad after 10 seconds of no activity. |
| Forgotten clock-out | After the threshold (default 12 h), manager gets a "Missing clock-out" item; the next time that employee enters their PIN, the kiosk asks them to tell the manager their clock-out time. |
| Overlapping shift or shift during approved time off | Warning shown to manager before publishing. |
| Two claims on one open shift | First approved claim wins; the other is closed automatically. |
| Punches changed after approval | Timesheet marked "Changed since approval" until re-approved (detected via snapshot hash). |
| Store iPad signed out of iCloud | Kiosk shows a "Manager setup needed" screen; punches already saved stay on the device until sync resumes. |
| Employee removed | PIN disabled; phone app shows an explanatory screen. |
| Overnight shifts and DST transitions | Correct durations via UTC storage and timezone-aware display. |

## 6. Testing

- **Domain unit tests** (Swift Testing): hour totals, breaks, overnight and DST shifts, pay-period boundaries, conflict detection, swap rules, CSV output, approval snapshot hashing, PIN validation, PIN uniqueness, lockout timing.
- **Persistence tests**: in-memory Core Data store with CloudKit disabled; save, fetch, filtering per zone.
- **UI tests**: manager publishes a schedule; employee enters PIN on the kiosk, clocks in, takes a break, clocks out; kiosk returns to keypad after timeout.
- **Manual two-account test** (one manager, one employee phone, plus the store iPad) before each milestone is marked done, since CloudKit sharing cannot be fully automated.

## 7. Milestones

1. **Foundation** — Xcode project, modules, brand components, Core Data model, CloudKit container, business creation, employees, role detection.
2. **Kiosk time clock** — PIN assignment, keypad, clock in/out and breaks, lockout, timeouts, manager unlock, offline handling.
3. **Scheduling** — week grid, drafts, publish, upcoming shifts on the kiosk.
4. **Timesheets** — pay-period totals, adjustments, approval, CSV/PDF export.
5. **Phone app and requests** — invites, employee zones, schedule on phones, availability, time off, open shifts, swaps, decisions.
6. **Notifications and release** — local notifications from sync events, shift reminders, TestFlight, distribution choice (App Store or Apple Business Manager).

## 8. Prerequisites

- Full Xcode installed (only the Command Line Tools are currently detected).
- Apple Developer Program membership (needed for CloudKit and TestFlight).
- An iCloud container identifier and bundle identifier chosen under the developer account.
- The store iPad signed in to the manager's Apple Account, with Guided Access enabled.
- One extra Apple Account and iPhone for testing the employee phone app.
