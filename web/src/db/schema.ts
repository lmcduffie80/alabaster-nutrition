import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const employeeRole = pgEnum("employee_role", ["manager", "employee"]);
export const punchKind = pgEnum("punch_kind", ["clockIn", "clockOut", "breakStart", "breakEnd"]);
export const punchSource = pgEnum("punch_source", ["kiosk", "manager"]);
export const punchAuditAction = pgEnum("punch_audit_action", ["add", "edit", "remove"]);

/** One row per customer. Alabaster is 1. */
export const business = pgTable("business", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity({ startWith: 2 }),
  name: text("name").notNull().default("Alabaster Nutrition"),
  timeZone: text("time_zone").notNull().default("America/New_York"),
  payPeriodAnchor: date("pay_period_anchor", { mode: "string" }).notNull(),
  payPeriodDays: integer("pay_period_days").notNull().default(7),
  missingClockOutHours: integer("missing_clock_out_hours").notNull().default(12),
  /** A clock-in more than this many minutes after the scheduled start counts as late. */
  lateGraceMinutes: integer("late_grace_minutes").notNull().default(5),
  kioskAutoReturnSeconds: integer("kiosk_auto_return_seconds").notNull().default(10),
  managerPinDigest: text("manager_pin_digest"),
  /** 0 = Sunday … 6 = Saturday. The weekly inventory count is due from the start of this day. */
  countWeekday: integer("count_weekday").notNull().default(0),
  createdAt: createdAt(),
});

/** A one-time link the platform owner sends so someone can create a business. Not visible to any business. */
export const businessInvite = pgTable(
  "business_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenDigest: text("token_digest").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    businessId: integer("business_id").references(() => business.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("business_invite_token").on(t.tokenDigest)],
);

/**
 * The owning business. Filled from the transaction's `app.business_id` (see `db/tenant.ts`); row-level
 * security rejects any other value and hides other businesses' rows.
 */
const businessId = () =>
  integer("business_id")
    .notNull()
    .references(() => business.id)
    .default(sql`nullif(current_setting('app.business_id', true), '')::int`);

export const employee = pgTable(
  "employee",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
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
    unique("employee_business_id_id").on(t.businessId, t.id),
    uniqueIndex("employee_email_unique").on(t.businessId, t.email),
    uniqueIndex("employee_active_pin_unique").on(t.businessId, t.pinDigest).where(sql`${t.active} and ${t.pinDigest} is not null`),
    index("employee_email").on(t.email),
  ],
);

export const kioskDevice = pgTable(
  "kiosk_device",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    label: text("label").notNull(),
    tokenDigest: text("token_digest").notNull().unique(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique("kiosk_device_business_id_id").on(t.businessId, t.id)],
);

/**
 * Never deleted or rewritten. A manager fix sets `effectiveAt` or `voided` and writes a `punch_audit` row;
 * `at` always keeps the original time.
 */
export const punch = pgTable(
  "punch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    employeeId: uuid("employee_id").notNull(),
    kind: punchKind("kind").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    voided: boolean("voided").notNull().default(false),
    source: punchSource("source").notNull(),
    kioskDeviceId: uuid("kiosk_device_id"),
    /** Client-generated; a repeated request (double tap, retry) is ignored. */
    requestId: uuid("request_id").unique(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("punch_business_id_id").on(t.businessId, t.id),
    index("punch_employee_at").on(t.employeeId, t.at),
    foreignKey({ name: "punch_employee_fk", columns: [t.businessId, t.employeeId], foreignColumns: [employee.businessId, employee.id] }),
    foreignKey({ name: "punch_kiosk_fk", columns: [t.businessId, t.kioskDeviceId], foreignColumns: [kioskDevice.businessId, kioskDevice.id] }),
  ],
);

export const punchAudit = pgTable(
  "punch_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    punchId: uuid("punch_id").notNull(),
    action: punchAuditAction("action").notNull(),
    previousAt: timestamp("previous_at", { withTimezone: true }),
    newAt: timestamp("new_at", { withTimezone: true }),
    reason: text("reason").notNull(),
    changedBy: text("changed_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [foreignKey({ name: "punch_audit_punch_fk", columns: [t.businessId, t.punchId], foreignColumns: [punch.businessId, punch.id] })],
);

export const scheduleWeek = pgTable(
  "schedule_week",
  {
    businessId: businessId(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ name: "schedule_week_pkey", columns: [t.businessId, t.weekStart] })],
);

export const shift = pgTable(
  "shift",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    employeeId: uuid("employee_id").notNull(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    position: text("position").notNull().default(""),
    /** Set by a manager when the employee called in instead of working this shift. */
    calledInAt: timestamp("called_in_at", { withTimezone: true }),
    calledInNote: text("called_in_note").notNull().default(""),
    calledInBy: text("called_in_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("shift_week").on(t.businessId, t.weekStart),
    foreignKey({ name: "shift_employee_fk", columns: [t.businessId, t.employeeId], foreignColumns: [employee.businessId, employee.id] }),
  ],
);

export const timesheetApproval = pgTable(
  "timesheet_approval",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    employeeId: uuid("employee_id").notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    approvedBy: text("approved_by").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("timesheet_approval_unique").on(t.employeeId, t.periodStart),
    foreignKey({
      name: "timesheet_approval_employee_fk",
      columns: [t.businessId, t.employeeId],
      foreignColumns: [employee.businessId, employee.id],
    }),
  ],
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
    businessId: businessId(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("storage_spot_business_id_id").on(t.businessId, t.id),
    uniqueIndex("storage_spot_name_unique").on(t.businessId, sql`lower(${t.name})`),
  ],
);

export const supplier = pgTable(
  "supplier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    name: text("name").notNull(),
    contact: text("contact").notNull().default(""),
    notes: text("notes").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("supplier_business_id_id").on(t.businessId, t.id),
    uniqueIndex("supplier_name_unique").on(t.businessId, sql`lower(${t.name})`),
  ],
);

export const inventoryItem = pgTable(
  "inventory_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    name: text("name").notNull(),
    type: inventoryItemType("type").notNull(),
    /** Singular, e.g. "tub" or "sleeve of 50 cups". */
    unit: text("unit").notNull(),
    spotId: uuid("spot_id").notNull(),
    supplierId: uuid("supplier_id"),
    supplierCode: text("supplier_code"),
    /** Count units in one invoice unit (1 case = 20 sleeves). */
    packSize: quantity("pack_size").notNull().default(1),
    /** Both set, or both null for no low-stock alerts. */
    reorderAt: quantity("reorder_at"),
    orderUpTo: quantity("order_up_to"),
    defaultUnitCost: quantity("default_unit_cost"),
    /**
     * What was on hand on `startingOn` (business-local), including that day's deliveries. Stands in for a count
     * until the item's first real one.
     */
    startingQuantity: quantity("starting_quantity"),
    startingOn: date("starting_on", { mode: "string" }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("inventory_item_business_id_id").on(t.businessId, t.id),
    uniqueIndex("inventory_item_name_unique").on(t.businessId, sql`lower(${t.name})`),
    uniqueIndex("inventory_item_supplier_code_unique").on(t.businessId, t.supplierId, t.supplierCode),
    foreignKey({ name: "inventory_item_spot_fk", columns: [t.businessId, t.spotId], foreignColumns: [storageSpot.businessId, storageSpot.id] }),
    foreignKey({ name: "inventory_item_supplier_fk", columns: [t.businessId, t.supplierId], foreignColumns: [supplier.businessId, supplier.id] }),
  ],
);

export const inventoryCount = pgTable(
  "inventory_count",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    status: inventoryCountStatus("status").notNull().default("open"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    startedBy: uuid("started_by").notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    finishedBy: uuid("finished_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    unique("inventory_count_business_id_id").on(t.businessId, t.id),
    uniqueIndex("inventory_count_one_open").on(t.businessId, t.status).where(sql`${t.status} = 'open'`),
    index("inventory_count_finished").on(t.businessId, t.finishedAt),
    foreignKey({
      name: "inventory_count_started_by_fk",
      columns: [t.businessId, t.startedBy],
      foreignColumns: [employee.businessId, employee.id],
    }),
    foreignKey({
      name: "inventory_count_finished_by_fk",
      columns: [t.businessId, t.finishedBy],
      foreignColumns: [employee.businessId, employee.id],
    }),
  ],
);

/** One per item that was active when the count started. `quantity` null = not counted (skipped if finished). */
export const inventoryCountLine = pgTable(
  "inventory_count_line",
  {
    businessId: businessId(),
    countId: uuid("count_id").notNull(),
    itemId: uuid("item_id").notNull(),
    quantity: quantity("quantity"),
    enteredBy: uuid("entered_by"),
    enteredAt: timestamp("entered_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.countId, t.itemId] }),
    index("inventory_count_line_item").on(t.itemId),
    foreignKey({
      name: "inventory_count_line_count_fk",
      columns: [t.businessId, t.countId],
      foreignColumns: [inventoryCount.businessId, inventoryCount.id],
    }),
    foreignKey({
      name: "inventory_count_line_item_fk",
      columns: [t.businessId, t.itemId],
      foreignColumns: [inventoryItem.businessId, inventoryItem.id],
    }),
    foreignKey({
      name: "inventory_count_line_entered_by_fk",
      columns: [t.businessId, t.enteredBy],
      foreignColumns: [employee.businessId, employee.id],
    }),
  ],
);

const money = (name: string) => numeric(name, { precision: 10, scale: 2, mode: "number" });

/** Soft-deleted (`deletedAt`) so the audit trail keeps what it was. */
export const delivery = pgTable(
  "delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    supplierId: uuid("supplier_id").notNull(),
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
    unique("delivery_business_id_id").on(t.businessId, t.id),
    index("delivery_received_on").on(t.businessId, t.receivedOn),
    uniqueIndex("delivery_invoice_unique")
      .on(t.businessId, t.supplierId, sql`lower(${t.invoiceNumber})`)
      .where(sql`${t.deletedAt} is null and ${t.invoiceNumber} is not null`),
    foreignKey({ name: "delivery_supplier_fk", columns: [t.businessId, t.supplierId], foreignColumns: [supplier.businessId, supplier.id] }),
  ],
);

/** `quantity` is in the item's count unit. */
export const deliveryLine = pgTable(
  "delivery_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    deliveryId: uuid("delivery_id").notNull(),
    itemId: uuid("item_id").notNull(),
    quantity: quantity("quantity").notNull(),
    lineTotal: money("line_total"),
    invoiceCode: text("invoice_code"),
    invoiceDescription: text("invoice_description"),
  },
  (t) => [
    index("delivery_line_delivery").on(t.deliveryId),
    index("delivery_line_item").on(t.itemId),
    foreignKey({ name: "delivery_line_delivery_fk", columns: [t.businessId, t.deliveryId], foreignColumns: [delivery.businessId, delivery.id] }),
    foreignKey({ name: "delivery_line_item_fk", columns: [t.businessId, t.itemId], foreignColumns: [inventoryItem.businessId, inventoryItem.id] }),
  ],
);

/**
 * A scanned invoice page in the private Blob store. Uploaded with a one-day expiry, which is cleared when
 * its delivery is saved; rows still without a delivery after a day point at deleted blobs and are removed.
 */
export const invoicePhoto = pgTable(
  "invoice_photo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    deliveryId: uuid("delivery_id"),
    pathname: text("pathname").notNull(),
    page: integer("page").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("invoice_photo_delivery").on(t.deliveryId),
    foreignKey({ name: "invoice_photo_delivery_fk", columns: [t.businessId, t.deliveryId], foreignColumns: [delivery.businessId, delivery.id] }),
  ],
);

/** One per scan attempt, for the daily limit. */
export const invoiceScan = pgTable(
  "invoice_scan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
    actor: text("actor").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    ok: boolean("ok").notNull(),
  },
  (t) => [index("invoice_scan_business_at").on(t.businessId, t.at)],
);

export const inventoryAudit = pgTable(
  "inventory_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: businessId(),
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

/** Platform tables: row-level security on, with no access at all for `tenant_app`. */
export const platformTables = ["business_invite"] as const;

/** Every table that belongs to a business; each gets row-level security in the migration. */
export const businessTables = [
  "employee",
  "kiosk_device",
  "punch",
  "punch_audit",
  "schedule_week",
  "shift",
  "timesheet_approval",
  "storage_spot",
  "supplier",
  "inventory_item",
  "inventory_count",
  "inventory_count_line",
  "delivery",
  "delivery_line",
  "invoice_photo",
  "invoice_scan",
  "inventory_audit",
] as const;
