# Inventory step 2 — Deliveries, costs, and invoice scanning

Spec: `docs/superpowers/specs/2026-11-09-inventory-design.md` (Delivery, Current unit cost, Scanning invoices).
Ships in two parts; each goes to production on its own.

## Part A — Deliveries and costs

1. **Schema** (`0002_deliveries.sql`): `delivery`, `delivery_line`, `inventory_audit`.
   - `delivery.recorded_by` and `inventory_audit.actor` are the manager's `actor` text, like `punch_audit.changed_by`.
   - Delivery quantities are stored in count units (the scan converts invoice units with the pack size).
   - Partial unique index on (supplier_id, lower(invoice_number)) for live deliveries with a number.
2. **Domain** (`lib/domain/inventory.ts`): `deliveryCounts(receivedOn, onShelfForCount, countedOn)`, `unitCost(lineTotal, quantity)`,
   `stockValue(onHand, unitCost)`, `parseMoney`, `formatMoney`. Unit tests.
3. **Server** (`lib/server/inventory.ts`): `recordDelivery`, `updateDelivery` (reason, audit), `deleteDelivery` (soft, reason, audit),
   `listDeliveries`, `getDelivery`. `stockRows` adds deliveries since each item's last count, current unit cost, and value.
   PGlite tests: on hand with same-day and on-shelf deliveries, never-counted items, unit cost from the latest priced line,
   deleted deliveries ignored, duplicate invoice refused, edit/delete audited.
4. **Pages**: Inventory → Deliveries (list), Record delivery (client form with item lines), delivery detail with edit and delete
   (reason required). Stock page gains cost each, value, and total stock value by type.
5. Verify (test, lint, typecheck, build), push, merge with the user's OK.

## Part B — Invoice scanning

1. Dependencies: `ai`, `@ai-sdk/openai`, `@vercel/blob`. A private Blob store on the Vercel project (`BLOB_READ_WRITE_TOKEN`).
2. Schema (`0003_invoice_scans.sql`): `invoice_photo`, `invoice_scan`.
3. `lib/server/invoice-scan.ts`: `readInvoice(images)` is the only OpenAI call (structured output, 60 s timeout);
   `matchInvoice(db, reading)` does supplier/code matching, pack-size conversion, total and duplicate checks. Tests use fixed readings.
4. Record delivery: **Scan invoice** (up to 5 photos, resized in the browser to 2000 px JPEG), pre-filled lines with
   Unmatched → existing item (saves the code) / new item / ignore. Photos attach to the saved delivery and are shown on it,
   served only to managers.
5. Daily cron deletes unattached photos older than 24 hours. 30 scans per day.
6. Manual check with a real invoice photo, then ship.
