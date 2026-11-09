import { sql } from "drizzle-orm";
import { boolean, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
