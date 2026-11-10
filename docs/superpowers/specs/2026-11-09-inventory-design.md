# Inventory — Design

Date: 2026-11-09
Status: approved in conversation; awaiting spec review

## Goal

Add inventory to the existing web app at app.alabasternutrition.com so the store can:

- count drink ingredients and supplies once a week on the store iPad,
- see what is running low and get a reorder list grouped by supplier,
- record deliveries with what was paid,
- see weekly usage (to spot waste or theft), stock value, and spending.

Out of scope: packaged retail products, equipment, register/POS integration, automatic deduction per drink, unit conversions beyond each item's invoice pack size, multiple stores.

## Who does what

| Person | Where | Can do |
|---|---|---|
| Employee | Store iPad, after their PIN | Enter and finish the weekly count |
| Manager | Own phone/Mac, or the iPad manager area | Items, suppliers, deliveries, count fixes, reorder list, reports, count day |

Manager access follows the existing rules (`MANAGER_EMAILS` account sign-in, or the kiosk manager PIN).

## Concepts

**Item** — name (unique, case-insensitive), type (`ingredient` or `supply`), count unit (free text, singular, e.g. "tub", "bag", "sleeve of 50 cups"), storage spot, supplier (optional), reorder-at level, order-up-to level (must be greater than reorder-at), default unit cost (optional, used until the first delivery has a price), supplier item code (optional, unique per supplier), pack size (how many count units are in one invoice unit, e.g. 1 case = 20 sleeves; default 1), active flag. Items are deactivated, never deleted.

**Storage spot** — a named place in the store with a sort order (e.g. Back room, Fridge, Front counter). The count screen walks spots in this order, and items alphabetically within a spot. Managers can add, rename, and reorder spots. A spot with active items can't be removed.

**Supplier** — name (unique), contact (phone/email/website, free text), notes, active flag.

**Quantities** — non-negative, up to two decimal places (e.g. 2.5 tubs). Stored as `numeric(10,2)`.

**Count** — one store-wide count at a time.
- Status: `open` → `finished`.
- Lines: one per item that was active when the count started. Each line has a quantity (or blank), who entered it, and when.
- Finishing records who finished it and the time. A finished count is read-only except for manager fixes.

**Delivery** — supplier, received date (business-local date), lines of item + quantity received + line total paid. Unit cost for a line = line total ÷ quantity. A manager can edit or delete a delivery; each change is audited.

**On hand** for an item = the quantity on its most recent finished count line + quantities from deliveries received after that count. If the item has never been counted, on hand is "Not counted yet" and the item is not flagged low.

A delivery is "after" a count when its received date is later than the count's finish date. A delivery received the same day as a count is treated as after it, unless the manager ticks "Already on the shelf for today's count" when recording it.

**Current unit cost** = unit cost from the item's most recent priced delivery line; otherwise the item's default unit cost; otherwise unknown (excluded from value totals and shown as "No price").

## The weekly count (store iPad)

- Settings gains **Count day** (a weekday; default Sunday).
- A count is **due** from the start of the count day (business time zone) until a count is finished on or after that day. A missed count stays due.
- After an employee enters their PIN, their screen shows **Count inventory** (highlighted as "Inventory count due" when due). It is available any day, so a count can be done early or redone.
- Tapping it opens the open count, or starts one if none is open.
- The count screen:
  - Items grouped by storage spot, showing the unit and the last counted quantity for reference.
  - Each item has a number field with − and + buttons (steps of 1; typing allows halves and other decimals).
  - Each entry saves immediately with the employee's name; progress shows "18 of 42 counted".
  - Several employees can work on the same open count; each line records who entered it last.
- **Finish count**: if any lines are blank, the employee confirms "Skip 3 items?" Skipped items keep their previous count for on-hand purposes and are listed on the count for the manager.
- Counting session: entering the PIN and choosing Count inventory starts a signed count session cookie tied to the kiosk and employee, valid for 5 minutes and extended on each entry. While counting, the kiosk's auto-return to the keypad is 5 minutes instead of the usual idle time. When the session ends, nothing is lost; the next person continues the same open count.
- Network failure: the entry shows "Not saved — tap to retry" and the field keeps the typed number.

## Manager screens

New **Inventory** tab in `/manage` with sub-pages:

1. **Stock** — every active item with on hand, unit, reorder-at, current unit cost, value, last counted date. Filters: type, spot, "Running low". Shows the open count's progress if one is open.
2. **Reorder list** — items whose on hand is at or below reorder-at, grouped by supplier ("No supplier" last). Suggested amount = order-up-to − on hand, rounded up to a whole unit. The manager can adjust amounts on the page (not saved). Actions: Print, and Copy as text (for texting or emailing a supplier).
3. **Counts** — list of counts (date, who finished, items counted/skipped). Opening one shows its lines. A manager can fix a line's quantity on a finished count with a required reason; the fix is audited and on hand/usage update. A manager can also cancel an open count.
4. **Deliveries** — list by date with supplier and total. Record delivery: supplier, received date (default today), lines (item, quantity, line total), "Already on the shelf for today's count" checkbox. Edit and delete with a required reason.
5. **Items** — add/edit/deactivate items; manage storage spots.
6. **Suppliers** — add/edit/deactivate suppliers.
7. **Reports** — see below.

The **Today** page gains a card: "Inventory: 4 items running low · count due today" linking to the reorder list or counts.

## Scanning invoices

On **Record delivery**, a manager can tap **Scan invoice** and take or choose up to 5 photos (one per page) on a phone, the iPad, or a Mac.

1. Photos are resized in the browser (longest side 2000 px, JPEG) and uploaded to a private Vercel Blob store.
2. The server sends them to an OpenAI vision model through the AI SDK (`@ai-sdk/openai`, using the store's own `OPENAI_API_KEY`) with a structured-output schema:
   supplier name, invoice number, invoice date, invoice total, and lines of { item code, description, quantity, invoice unit, unit price, line total }. Fields the model can't read come back empty, not guessed. The exact model is chosen at build time from OpenAI's current vision models.
3. The app pre-fills the delivery form:
   - Supplier: matched by name to an existing supplier, or offered as a new supplier.
   - Date: invoice date, falling back to today.
   - Each line is matched to an item by (supplier, supplier item code); otherwise it is flagged **Unmatched** and the manager chooses: an existing item (the code is saved on that item for next time), **New item** (pre-filled from the description), or **Ignore** (fees, products we don't track).
   - Quantity received = invoice quantity × the item's pack size.
4. Checks shown before saving:
   - The sum of line totals differs from the invoice total by more than $0.01.
   - The same supplier and invoice number were already recorded.
   - Any line is still unmatched.
5. Nothing is saved until **Save delivery**. The photos are attached to the saved delivery and viewable from it. Photos from a scan that is abandoned are deleted after 24 hours.

Failure handling: if the photo can't be read or OpenAI is unavailable, the manager sees "Couldn't read this invoice — enter it below" with the manual form and the photos still attached. Requests time out after 60 seconds. Scanning is limited to managers and to 30 scans per day.

Privacy: invoice photos go to OpenAI's API, which doesn't train on business API data by default. The photos are stored privately and are only served to managers.

## Reports

**Weekly usage** — for each pair of consecutive finished counts:
usage = previous count + deliveries between them − this count.
- Shown per item with cost (usage × current unit cost) and totals by type.
- Flags:
  - "Higher than usual" when usage exceeds 1.5× the item's average of its previous 4 usage periods (needs at least 4 previous periods).
  - "Count mismatch" when usage is negative (more on the shelf than possible).
- Items skipped on either count show "Not counted" for that period.

**Stock value** — total current value of on-hand stock, by type.

**Spending** — delivery totals by week (Monday start) or by month, by supplier.

**CSV export** for each report, using the existing formula-injection guard.

## Data model (new tables)

- `storage_spot` (id, name, sort_order)
- `supplier` (id, name, contact, notes, active)
- `inventory_item` (id, name, type, unit, storage_spot_id, supplier_id null, supplier_code null, pack_size default 1, reorder_at, order_up_to, default_unit_cost null, active, created_at) — unique (supplier_id, supplier_code)
- `inventory_count` (id, status, started_at, started_by, finished_at null, finished_by null, cancelled_at null)
- `inventory_count_line` (count_id, item_id, quantity null, entered_by null, entered_at null) — primary key (count_id, item_id)
- `delivery` (id, supplier_id, invoice_number null, invoice_total null, received_on, on_shelf_for_count, recorded_by, recorded_at, deleted_at null)
- `delivery_line` (id, delivery_id, item_id, quantity, line_total null, invoice_code null, invoice_description null)
- `invoice_photo` (id, delivery_id null, blob_pathname, uploaded_by, uploaded_at, page) — rows with no delivery after 24 hours are deleted with their blobs by a daily cron job
- `invoice_scan` (id, actor_id, at, ok) — for the daily scan limit
- `inventory_audit` (id, entity, entity_id, action, before json, after json, reason, actor_id, at)
- `business.count_weekday` (smallint, default 0 = Sunday)

Money is stored as `numeric(10,2)` dollars. Business rules (on hand, due, usage, reorder amounts, flags) live in pure functions in `web/src/lib/domain/inventory.ts` with unit tests. Database access lives in `web/src/lib/server/inventory.ts`, following the patterns of `punches.ts` and `schedule.ts`.

## Rules and errors

- Only one open count at a time (partial unique index on `status = 'open'`).
- Count entries are rejected if the count isn't open, the item isn't on the count, the quantity is negative or has more than two decimals, or the count session isn't valid for this kiosk.
- Deactivating an item removes it from the open count if it hasn't been counted yet; if it has, its line stays. Either way it is left off future counts.
- Order-up-to must be greater than reorder-at; both are non-negative.
- Delivery lines need a quantity greater than 0; line total is optional (no price yet) and non-negative.
- All manager actions go through the existing `managerForm` wrapper (UUID validation, `UserError` messages, revalidation).

## Testing

- Unit tests for the domain functions: on hand with same-day deliveries, never-counted items, skipped lines, usage across deliveries, negative usage, the 1.5× flag with fewer than 4 periods, reorder rounding, due/not-due around the count day and time zone.
- Server integration tests on PGlite: start/continue/finish a count, two employees on one count, one-open-count rule, count fixes with audit, deliveries affecting on hand, deactivated items.
- Action tests: employees can't reach manager inventory actions; count entries need a valid count session on an enrolled kiosk.
- Component test for the count screen: entry saves, retry on failure, skip confirmation.
- Invoice scanning: the OpenAI call is behind one function so tests use fixed model output. Tests cover code matching, pack-size conversion, the total and duplicate-invoice checks, unmatched lines, and the fallback when the model fails. One manual check with real invoice photos before release.

## Build order

Each step ships to production on its own:

1. Storage spots, suppliers, items, the iPad count, Counts list (view counts, cancel an open count), Stock page, running-low card, reorder list.
2. Deliveries and costs (current unit cost, stock value), then invoice scanning with stored photos.
3. Fixes to finished counts, weekly usage, spending reports, CSV export.
