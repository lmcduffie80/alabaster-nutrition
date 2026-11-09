# Alabaster Nutrition — Scheduling & Timekeeping App: Design

Date: 2026-11-08
Status: Approved design, pending written-spec review

## 1. Purpose

A native Apple app for Alabaster Nutrition (101 E Front St, Sylvester, GA) that lets managers build and publish employee shift schedules, lets staff clock in and out at the shop, and turns those punches into approved timesheets that can be exported for payroll.

### Users
- **Owner/Manager** — the person who creates the business in the app. Builds schedules, approves timesheets and requests. Also works shifts and clocks in like an employee.
- **Employee** — joins via an invite link. Views schedule, clocks in/out, submits requests.

Every user has an Apple device and an Apple Account. There is no separate login.

### Platforms
iPhone, iPad, and Mac from one multiplatform SwiftUI codebase. Apple Watch and web are out of scope.

### Version 1 scope
1. Managers create and publish weekly shift schedules.
2. Employees clock in/out, with breaks.
3. Timesheets per pay period, with manager adjustments and approval.
4. Export timesheets as CSV and PDF.
5. Employees submit availability and time-off requests.
6. Shift swaps and open shifts employees can pick up.
7. Notifications: schedule published, shift reminders, request updates.
8. Location check: clock-in only allowed near the workplace.

Out of scope for v1: overtime and labor-cost tracking, multiple locations, multiple managers with edit rights, payroll integrations, web dashboard.

## 2. Architecture

### Stack
- SwiftUI multiplatform app (iOS, iPadOS, macOS).
- Core Data + `NSPersistentCloudKitContainer` with CloudKit sharing (`CKShare`). SwiftData's built-in CloudKit sync does not support shared databases; this must be re-verified against current Apple documentation before implementation begins, and SwiftData adopted instead if it now supports sharing.
- Core Location for the workplace location check.
- UserNotifications for local notifications.
- No custom server. Cost is the Apple Developer Program fee only.

### Modules (local Swift packages)
| Module | Responsibility | Depends on |
|---|---|---|
| `Domain` | Plain Swift value types and rules: hour totals, breaks, pay periods, conflict detection, swap rules, CSV generation. | Foundation only |
| `Persistence` | Core Data model, CloudKit container setup, repository protocols the features use. | `Domain` |
| `Sharing` | Create the Business zone, create/accept invites, discover employee zones, determine the current user's role. | `Persistence` |
| `Features` | SwiftUI screens and view models for each tab. | `Domain`, `Persistence`, `Sharing` |
| `Brand` | Colors, fonts, pattern assets, reusable framed-panel and card components. | SwiftUI |

Features never touch CloudKit directly; they talk to repository protocols, which lets them be tested against an in-memory store.

### Data ownership (role-separated zones)
CloudKit sharing grants the same permission to everyone a zone is shared with. To stop anyone editing another person's records, data is split by owner:

| Zone | Owner | Shared with | Records |
|---|---|---|---|
| Business zone | Manager | All employees, read-only | `Business`, `Employee`, `Shift`, `TimesheetApproval`, `TimesheetAdjustment`, `RequestDecision` |
| Employee zone (one per employee, including the manager) | That employee | Manager, read-only | `TimePunch`, `Availability`, `TimeOffRequest`, `SwapRequest`, `OpenShiftClaim` |

Role is derived from zone ownership: if the current user owns the Business zone they are the manager.

### Records
- `Business`: name, timezone, pay-period rule (weekly or biweekly, plus anchor date), workplace coordinate, allowed radius (default 150 m), missing-clock-out threshold (default 12 h).
- `Employee`: display name, role, schedule color, CloudKit participant identity, active flag.
- `Shift`: employee (optional when open), start, end, position label, status (`draft`, `published`, `open`).
- `TimePunch`: kind (`clockIn`, `clockOut`, `breakStart`, `breakEnd`), timestamp, location result (`verified`, `outsideRadius`, `unavailable`), device name, `correctsPunchID` (optional).
- `TimesheetAdjustment`: employee, pay period, minutes added or removed, required note, author.
- `TimesheetApproval`: employee, pay period, approved total minutes, snapshot hash of punches and adjustments used, approved at.
- `Availability`: weekday, start, end, or unavailable all day.
- `TimeOffRequest`: start date, end date, note.
- `SwapRequest`: shift, optional target employee (blank means offered to anyone).
- `OpenShiftClaim`: shift.
- `RequestDecision`: request reference, outcome (`approved`, `denied`), note, decided at.

### Data rules
- Punches are append-only. A correction is a new punch referencing the original via `correctsPunchID`.
- Manager hour changes are `TimesheetAdjustment` records in the Business zone; employee records are never modified by the manager.
- Requests are two-sided: the employee writes the request in their zone; the manager writes the `RequestDecision` in the Business zone. On approving a swap or open-shift claim, the manager's device reassigns the `Shift`.
- Times are stored in UTC and displayed in the business timezone.

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
- Motifs: blue-and-white ginger-jar pattern on the app icon, launch screen, sign-in and empty states only. The sage framed panel with notched corners and a thin dark/gilt border is used for highlight cards ("Your next shift", the clock-in panel).
- Employee schedule colors drawn from blue, sage, and complementary porcelain tones.
- App icon: simplified porcelain-patterned cup on white.
- Official logo files, exact colors, and licensed fonts can be swapped in later as asset replacements only.

## 4. Screens

iPhone uses a tab bar; iPad and Mac use a sidebar with multi-column layouts.

### Employee
1. **Today** — "Your next shift" card; large Clock In / Clock Out button with Start/End Break and a running timer. Clock-in is disabled with an explanation when farther than the allowed radius from the workplace.
2. **Schedule** — my week, toggle to full team; open shifts show "Pick up".
3. **Hours** — my punches and total for the current pay period, with approval status.
4. **Requests** — submit availability, time off, or offer a shift for swap; see status of each.

### Manager
1. **Today** — who's clocked in, who's late, missing clock-outs; plus the employee clock-in panel for the manager's own shifts.
2. **Schedule** — week grid (people × days). Drag to create/move shifts, copy last week, availability and approved time off shown inline. Shifts are drafts until **Publish**.
3. **Timesheets** — per-employee pay-period totals, punch review, adjustments with required notes, approve, export CSV/PDF.
4. **Requests** — approve or deny, with schedule conflicts shown before deciding.
5. **Hours** — the manager's own punches, as in the employee view.
6. **Settings** — business info, pay period, workplace location and radius, invite and remove employees.

### Data flow
Writes go to the local store first so the UI updates immediately and works offline. CloudKit syncs in the background. When remote changes arrive, each device posts its own local notifications:
- Employees: "Schedule for <week> published", "Your <request> was approved/denied".
- Manager: "New time-off request", "New swap request", "Missing clock-out".
- Shift reminders are scheduled on each employee's device 30 minutes before each of their published shifts and rescheduled whenever the schedule changes.

### Export
- CSV: one row per employee per pay period (name, regular minutes, adjustments, total hours, approval status), plus an optional detail file with every punch.
- PDF: one page per employee with punches, adjustments, total, and approval details.
- Shared via the system share sheet.

## 5. Error handling and edge cases

| Situation | Behavior |
|---|---|
| Offline | Punch saves locally with exact timestamp; "Not synced yet" badge until synced. |
| Location denied or unavailable | Punch is saved and flagged "Location not verified" for manager review. |
| Outside the allowed radius | Clock-in disabled with distance and explanation. |
| Forgotten clock-out | After the threshold (default 12 h), employee reminder and manager "Missing clock-out" item. |
| Overlapping shift or shift during approved time off | Warning shown to manager before publishing. |
| Two claims on one open shift | First approved claim wins; the other is closed automatically. |
| Punches changed after approval | Timesheet marked "Changed since approval" until re-approved (detected via snapshot hash). |
| iCloud signed out or employee removed | Dedicated explanatory screen with next steps. |
| Overnight shifts and DST transitions | Correct durations via UTC storage and timezone-aware display. |

## 6. Testing

- **Domain unit tests** (Swift Testing): hour totals, breaks, overnight and DST shifts, pay-period boundaries, conflict detection, swap rules, CSV output, approval snapshot hashing.
- **Persistence tests**: in-memory Core Data store with CloudKit disabled; save, fetch, filtering per zone.
- **UI tests**: manager publishes a schedule; employee clocks in, takes a break, clocks out.
- **Manual two-account test** (one manager, one employee, real devices) before each milestone is marked done, since CloudKit sharing cannot be fully automated.

## 7. Milestones

1. **Foundation** — Xcode project, modules, brand components, Core Data model, CloudKit container, business creation, invites, role detection.
2. **Scheduling** — week grid, drafts, publish, My Shifts.
3. **Time clock** — punches, breaks, location check, offline handling.
4. **Timesheets** — pay-period totals, adjustments, approval, CSV/PDF export.
5. **Requests** — availability, time off, open shifts, swaps, decisions.
6. **Notifications and release** — local notifications from sync events, shift reminders, TestFlight, distribution choice (App Store or Apple Business Manager).

## 8. Prerequisites

- Full Xcode installed (only the Command Line Tools are currently detected).
- Apple Developer Program membership (needed for CloudKit and TestFlight).
- An iCloud container identifier and bundle identifier chosen under the developer account.
- Two Apple Accounts and devices for sharing tests.
