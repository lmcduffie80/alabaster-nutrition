import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const employeeRole = pgEnum("employee_role", ["manager", "employee"]);
export const punchKind = pgEnum("punch_kind", ["clockIn", "clockOut", "breakStart", "breakEnd"]);
export const punchSource = pgEnum("punch_source", ["kiosk", "manager"]);
export const punchAuditAction = pgEnum("punch_audit_action", ["add", "edit", "remove"]);

/** One row: the store. */
export const business = pgTable("business", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull().default("Alabaster Nutrition"),
  timeZone: text("time_zone").notNull().default("America/New_York"),
  payPeriodAnchor: date("pay_period_anchor", { mode: "string" }).notNull(),
  payPeriodDays: integer("pay_period_days").notNull().default(7),
  missingClockOutHours: integer("missing_clock_out_hours").notNull().default(12),
  kioskAutoReturnSeconds: integer("kiosk_auto_return_seconds").notNull().default(10),
  managerPinDigest: text("manager_pin_digest"),
  /** 0 = Sunday … 6 = Saturday. The weekly inventory count is due from the start of this day. */
  countWeekday: integer("count_weekday").notNull().default(0),
  createdAt: createdAt(),
});

export const employee = pgTable(
  "employee",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),
    role: employeeRole("role").notNull().default("employee"),
    colorIndex: integer("color_index").notNull().default(0),
    active: boolean("active").notNull().default(true),
    /** Lowercased. Lets this person sign in on their phone to see the schedule. */
    email: text("email"),
    pinDigest: text("pin_digest"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("employee_email_unique").on(t.email),
    uniqueIndex("employee_active_pin_unique").on(t.pinDigest).where(sql`${t.active} and ${t.pinDigest} is not null`),
  ],
);

export const kioskDevice = pgTable("kiosk_device", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  tokenDigest: text("token_digest").notNull().unique(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Never deleted or rewritten. A manager fix sets `effectiveAt` or `voided` and writes a `punch_audit` row;
 * `at` always keeps the original time.
 */
export const punch = pgTable(
  "punch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employee.id),
    kind: punchKind("kind").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    voided: boolean("voided").notNull().default(false),
    source: punchSource("source").notNull(),
    kioskDeviceId: uuid("kiosk_device_id").references(() => kioskDevice.id),
    /** Client-generated; a repeated request (double tap, retry) is ignored. */
    requestId: uuid("request_id").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("punch_employee_at").on(t.employeeId, t.at)],
);

export const punchAudit = pgTable("punch_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  punchId: uuid("punch_id")
    .notNull()
    .references(() => punch.id),
  action: punchAuditAction("action").notNull(),
  previousAt: timestamp("previous_at", { withTimezone: true }),
  newAt: timestamp("new_at", { withTimezone: true }),
  reason: text("reason").notNull(),
  changedBy: text("changed_by").notNull(),
  createdAt: createdAt(),
});

export const scheduleWeek = pgTable("schedule_week", {
  weekStart: date("week_start", { mode: "string" }).primaryKey(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export const shift = pgTable(
  "shift",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employee.id),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    position: text("position").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("shift_week").on(t.weekStart)],
);

export const timesheetApproval = pgTable(
  "timesheet_approval",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employee.id),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    approvedBy: text("approved_by").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("timesheet_approval_unique").on(t.employeeId, t.periodStart)],
);

// Inventory

const quantity = (name: string) => numeric(name, { precision: 10, scale: 2, mode: "number" });

export const inventoryItemType = pgEnum("inventory_item_type", ["ingredient", "supply"]);
export const inventoryCountStatus = pgEnum("inventory_count_status", ["open", "finished", "cancelled"]);

/** A place in the store; the count walks spots in `sortOrder`. */
export const storageSpot = pgTable(
  "storage_spot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("storage_spot_name_unique").on(sql`lower(${t.name})`)],
);

export const supplier = pgTable(
  "supplier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    contact: text("contact").notNull().default(""),
    notes: text("notes").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("supplier_name_unique").on(sql`lower(${t.name})`)],
);

export const inventoryItem = pgTable(
  "inventory_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: inventoryItemType("type").notNull(),
    /** Singular, e.g. "tub" or "sleeve of 50 cups". */
    unit: text("unit").notNull(),
    spotId: uuid("spot_id")
      .notNull()
      .references(() => storageSpot.id),
    supplierId: uuid("supplier_id").references(() => supplier.id),
    supplierCode: text("supplier_code"),
    /** Count units in one invoice unit (1 case = 20 sleeves). */
    packSize: quantity("pack_size").notNull().default(1),
    reorderAt: quantity("reorder_at").notNull(),
    orderUpTo: quantity("order_up_to").notNull(),
    defaultUnitCost: quantity("default_unit_cost"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("inventory_item_name_unique").on(sql`lower(${t.name})`),
    uniqueIndex("inventory_item_supplier_code_unique").on(t.supplierId, t.supplierCode),
  ],
);

export const inventoryCount = pgTable(
  "inventory_count",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: inventoryCountStatus("status").notNull().default("open"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    startedBy: uuid("started_by")
      .notNull()
      .references(() => employee.id),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    finishedBy: uuid("finished_by").references(() => employee.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("inventory_count_one_open").on(t.status).where(sql`${t.status} = 'open'`),
    index("inventory_count_finished").on(t.finishedAt),
  ],
);

/** One per item that was active when the count started. `quantity` null = not counted (skipped if finished). */
export const inventoryCountLine = pgTable(
  "inventory_count_line",
  {
    countId: uuid("count_id")
      .notNull()
      .references(() => inventoryCount.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItem.id),
    quantity: quantity("quantity"),
    enteredBy: uuid("entered_by").references(() => employee.id),
    enteredAt: timestamp("entered_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.countId, t.itemId] }), index("inventory_count_line_item").on(t.itemId)],
);

const money = (name: string) => numeric(name, { precision: 10, scale: 2, mode: "number" });

/** Soft-deleted (`deletedAt`) so the audit trail keeps what it was. */
export const delivery = pgTable(
  "delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id),
    invoiceNumber: text("invoice_number"),
    invoiceTotal: money("invoice_total"),
    /** Business-local date. */
    receivedOn: date("received_on", { mode: "string" }).notNull(),
    /** Received the same day as a count and already on the shelf when it was counted. */
    onShelfForCount: boolean("on_shelf_for_count").notNull().default(false),
    recordedBy: text("recorded_by").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("delivery_received_on").on(t.receivedOn),
    uniqueIndex("delivery_invoice_unique")
      .on(t.supplierId, sql`lower(${t.invoiceNumber})`)
      .where(sql`${t.deletedAt} is null and ${t.invoiceNumber} is not null`),
  ],
);

/** `quantity` is in the item's count unit. */
export const deliveryLine = pgTable(
  "delivery_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => delivery.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItem.id),
    quantity: quantity("quantity").notNull(),
    lineTotal: money("line_total"),
    invoiceCode: text("invoice_code"),
    invoiceDescription: text("invoice_description"),
  },
  (t) => [index("delivery_line_delivery").on(t.deliveryId), index("delivery_line_item").on(t.itemId)],
);

/**
 * A scanned invoice page in the private Blob store. Uploaded with a one-day expiry, which is cleared when
 * its delivery is saved; rows still without a delivery after a day point at deleted blobs and are removed.
 */
export const invoicePhoto = pgTable(
  "invoice_photo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id").references(() => delivery.id),
    pathname: text("pathname").notNull(),
    page: integer("page").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("invoice_photo_delivery").on(t.deliveryId)],
);

/** One per scan attempt, for the daily limit. */
export const invoiceScan = pgTable("invoice_scan", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  ok: boolean("ok").notNull(),
});

export const inventoryAudit = pgTable(
  "inventory_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason").notNull(),
    actor: text("actor").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [index("inventory_audit_entity").on(t.entity, t.entityId)],
);
