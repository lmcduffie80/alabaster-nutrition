# Inventory Step 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Storage spots, suppliers, items, the weekly count on the store iPad, the Counts list, the Stock page, the running-low card, and the reorder list (spec: `docs/superpowers/specs/2026-11-09-inventory-design.md`, build step 1).

**Architecture:** Same layering as the time clock. Pure rules go in `web/src/lib/domain/inventory.ts`. Database work goes in `web/src/lib/server/inventory.ts`, called from server actions: kiosk actions for counting, and the `managerForm` actions for everything else. Pages are server components under `web/src/app/manage/inventory/`. The kiosk count screen is a client component next to `kiosk.tsx`.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM 0.45 on Postgres (PGlite in tests), zod 4, Vitest 5, Testing Library.

---

## File map

| File | Responsibility |
|---|---|
| `web/src/db/schema.ts` (modify) | New enums and tables, `business.countWeekday` |
| `web/drizzle/0001_inventory.sql` (generated) | Migration |
| `web/src/lib/domain/inventory.ts` (create) | `parseQuantity`, `countDue`, `isLow`, `reorderAmount`, `onHand` |
| `web/src/lib/domain/inventory.test.ts` (create) | Unit tests for the above |
| `web/src/lib/server/inventory.ts` (create) | Spots, suppliers, items, counts, stock, reorder list, summary |
| `web/src/lib/server/inventory.test.ts` (create) | PGlite integration tests |
| `web/src/lib/server/session.ts` (modify) | Count session cookie: `startCountSession`, `getCountSession`, `endCountSession` |
| `web/src/lib/server/business.ts` (modify) | `countWeekday` in settings |
| `web/src/lib/server/kiosk-view.ts` (modify) | `countDue` flag on the employee view |
| `web/src/app/kiosk/actions.ts` (modify) | `startCounting`, `enterCount`, `finishCounting`, `stopCounting` |
| `web/src/app/kiosk/count-screen.tsx` (create) | The iPad count UI |
| `web/src/app/kiosk/kiosk.tsx` (modify) | "Count inventory" button and counting mode (5-minute idle) |
| `web/src/app/manage/inventory-actions.ts` (create) | Manager actions for inventory, using `managerForm` (exported from `actions.ts`) |
| `web/src/app/manage/inventory/layout.tsx` (create) | Sub-navigation |
| `web/src/app/manage/inventory/page.tsx` (create) | Stock |
| `web/src/app/manage/inventory/reorder/page.tsx` + `copy-button.tsx` (create) | Reorder list, print, and copy as text |
| `web/src/app/manage/inventory/counts/page.tsx` + `[id]/page.tsx` (create) | Counts list and detail, cancel an open count |
| `web/src/app/manage/inventory/items/page.tsx` (create) | Items and storage spots |
| `web/src/app/manage/inventory/suppliers/page.tsx` (create) | Suppliers |
| `web/src/app/manage/layout.tsx`, `page.tsx`, `settings/page.tsx` (modify) | Nav link, Today card, count day |

## Tasks

### Task 1: Schema and migration
- [ ] Add to `schema.ts`: `inventoryItemType` enum (`ingredient`, `supply`); `inventoryCountStatus` enum (`open`, `finished`, `cancelled`); tables `storage_spot`, `supplier`, `inventory_item`, `inventory_count`, `inventory_count_line`, exactly as in the spec's data model. Quantities and money are `numeric(10,2)` with `mode: "number"`. Add a partial unique index `inventory_count_one_open` on `status` where `status = 'open'`, `unique(supplier_id, supplier_code)`, and a case-insensitive unique index on item and supplier names via `lower(name)`. Add `business.count_weekday` (`integer`, default 0).
- [ ] Run `pnpm drizzle-kit generate --name inventory`. Expected: `drizzle/0001_inventory.sql` is created.
- [ ] Run `pnpm test`. Expected: existing tests pass; PGlite applies the new migration.
- [ ] Commit `feat(inventory): add inventory tables`.

### Task 2: Domain rules (TDD)
- [ ] Write tests in `inventory.test.ts`:
  - `parseQuantity`: `"2.5"` → 2.5; `"0"` → 0; `" 3 "` → 3; `""` → null; `"-1"`, `"1.234"`, `"abc"`, `"100000000"` → error.
  - `countDue({ now, weekday, timeZone, lastFinishedAt })`. With the count day Sunday, `America/New_York`:
    - due on Sunday 00:00 local when the last count was the previous Saturday;
    - not due when finished earlier that Sunday;
    - still due on Monday after a missed Sunday;
    - not due on Saturday when the last count was the previous Sunday;
    - due when nothing has ever been counted.
  - `isLow(onHand, reorderAt)`: equal counts as low; `null` on hand is not low.
  - `reorderAmount(onHand, orderUpTo)`: `ceil(orderUpTo - onHand)`, never below 0. For example, (2.5, 10) gives 8.
  - `onHand(lastCount)`: returns the last counted quantity, or `null` if never counted. It takes a `deliveriesSince` argument defaulting to 0, so step 2 can add deliveries.
- [ ] Run and see the tests fail. Implement. Run and see them pass. Commit.

### Task 3: Server inventory module (TDD on PGlite)
Functions (all take `db` first):
- Spots: `listSpots`, `addSpot(name)`, `renameSpot(id, name)`, `moveSpot(id, direction: "up" | "down")`, `removeSpot(id)` (refused while active items use it).
- Suppliers: `listSuppliers({ includeInactive })`, `addSupplier(input)`, `updateSupplier(id, input)`, `setSupplierActive(id, active)`.
- Items: `listItems({ includeInactive })`, `addItem(input)`, `updateItem(id, input)`, `setItemActive(id, active)`. Input: name, type, unit, spotId, supplierId | null, supplierCode | null, packSize, reorderAt, orderUpTo, defaultUnitCost | null. Validation follows the spec's "Rules and errors".
- Counts:
  - `openCountView(db)`: the open count's lines (item name, unit, spot, last counted quantity, entered quantity, who entered it), or null.
  - `startOrContinueCount(db, { employeeId, now })`: returns the open count, creating one with lines for all active items if none is open. Safe under concurrency via the unique index plus retry.
  - `enterCountLine(db, { countId, itemId, quantity, employeeId, now })`.
  - `finishCount(db, { countId, employeeId, now })`: returns `{ skipped }`.
  - `cancelCount(db, countId, now)`.
  - `listCounts(db)`, `getCount(db, id)`.
- Stock: `stockRows(db)` (per active item: on hand, last counted at, low flag), `reorderList(db)` (low items grouped by supplier, "No supplier" last), `inventorySummary(db, now)` returning `{ lowCount, countDue, openCount: { counted, total } | null }`.

Tests:
- Duplicate names are refused, ignoring case.
- An order-up-to level not above reorder-at is refused.
- A spot in use can't be removed.
- Starting twice returns the same count.
- Two employees enter on one count, and each line records who entered it.
- Finishing reports skipped lines.
- Entries on a finished or cancelled count are refused.
- On hand comes from the last finished count, with skipped lines keeping the previous value.
- An item added after a count started isn't on that count.
- The reorder list groups by supplier with correct amounts.
- `countDue` is reflected in `inventorySummary`.

- [ ] Write the tests, see them fail, implement, see them pass, and commit.

### Task 4: Count session and kiosk actions
- [ ] `session.ts`: `type CountTicket = { kioskId; employeeId; exp }`, stored in the `alabaster_kiosk_count` cookie (httpOnly, sameSite strict, 5 minutes). Add `startCountSession(kioskId, employeeId, now)`; `getCountSession()`, which returns the ticket only if it isn't expired and matches the current kiosk; and `endCountSession()`.
- [ ] `kiosk/actions.ts`:
  - `startCounting(pin)`: checks the PIN like `enterEmployeePin`, starts the session, calls `startOrContinueCount`, and returns `{ kind: "counting", view }`.
  - `enterCount({ itemId, quantity })`: needs the session and extends it.
  - `finishCounting()`: returns `{ kind: "finished", skipped }`.
  - `stopCounting()`.
  - Every action returns `{ kind: "expired" }` when the session is gone.
- [ ] Extend `web/src/app/manage/actions.test.ts` (or add `kiosk/count-actions.test.ts`):
  - `enterCount` without a session is refused;
  - a session cookie is useless without the kiosk cookie;
  - employees can't call manager inventory actions.
- [ ] Commit.

### Task 5: Kiosk count screen
- [ ] `kiosk-view.ts`: add `countDue: boolean` from `inventorySummary`.
- [ ] `kiosk.tsx`: on the employee screen, add a "Count inventory" button, highlighted with a badge "Inventory count due" when due. New mode `{ kind: "counting"; view }` with a 5-minute idle return that calls `stopCounting`.
- [ ] `count-screen.tsx`:
  - Lines grouped by spot, each with − and + buttons and a decimal input (`inputMode="decimal"`), showing the last count for reference.
  - Each change saves on blur or button press, and the line shows "Saved", "Saving…", or "Not saved — tap to retry".
  - The progress header reads "18 of 42 counted".
  - "Finish count" asks to confirm when lines are blank ("Skip 3 items?"), then shows "Count finished".
- [ ] Component tests:
  - an entry calls `enterCount` with the parsed number;
  - a failure shows the retry state, and retrying succeeds;
  - finishing with blanks asks to confirm.
- [ ] Commit.

### Task 6: Manager actions and pages
- [ ] Export `managerForm` and `text` from `manage/actions.ts`, and widen the UUID field check to `["id", "employeeId", "punchId", "itemId", "spotId", "supplierId", "countId"]`, with blank optional selects allowed.
- [ ] `inventory-actions.ts`: add, update, and activate actions for spots, suppliers, and items, plus `cancelCountAction`.
- [ ] Pages per the file map, using `Card`, `Field`, `inputClass`, `ActionForm`, `SubmitButton`, and `SectionTitle`, matching the Team page.
  - The reorder page has `window.print()` and "Copy as text", which produces lines like `Sysco: Vanilla protein — 8 tubs`.
  - Amounts can be adjusted in local state.
- [ ] Nav: add `{ href: "/manage/inventory", label: "Inventory", icon: Package }`.
- [ ] Today page: an inventory card (low count, due, open-count progress) linking to the reorder list or counts.
- [ ] Settings: a count day select (`countWeekday`), saved by `updateSettingsAction`.
- [ ] Commit.

### Task 7: Verify and ship
- [ ] Run `pnpm test`, `pnpm lint`, `pnpm --dir web exec tsc --noEmit`, and `pnpm build`. All must pass.
- [ ] Run the dev server and smoke test that `/manage/inventory` redirects when signed out and `/kiosk` renders.
- [ ] Push the `inventory` branch and check that the preview deploy builds. Merge to `main` after the user okays it. The production build runs the migration.
