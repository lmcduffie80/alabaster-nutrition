import "server-only";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { addDays, instantAt, isLocalDate, payPeriodContaining, type LocalDate } from "@/lib/domain/time";
import { timesheetRow } from "@/lib/domain/timesheet";
import { getBusiness } from "./business";
import { UserError } from "./errors";
import { effectivePunches } from "./punches";
import { listEmployees } from "./team";

const DAY_MS = 86_400_000;

export async function periodFor(db: Db, at: Date) {
  const business = await getBusiness(db);
  return payPeriodContaining(at, business.payPeriodAnchor, business.payPeriodDays, business.timeZone);
}

/**
 * Timesheets for the pay period starting on `periodStart` (or the current one).
 * Includes former employees who worked in the period.
 */
export async function periodTimesheets(db: Db, now: Date, periodStart?: LocalDate) {
  const business = await getBusiness(db);
  const { timeZone, payPeriodAnchor, payPeriodDays, missingClockOutHours } = business;
  if (periodStart && !isLocalDate(periodStart)) throw new UserError("Choose a pay period.");
  const within = periodStart ? instantAt(periodStart, 12 * 60, timeZone) : now;
  const period = payPeriodContaining(within, payPeriodAnchor, payPeriodDays, timeZone);

  const employees = await listEmployees(db, { includeInactive: true });
  const ids = employees.map((e) => e.id);
  // Shifts that start in the period may end after it; look a day past each end.
  const punches = await effectivePunches(db, ids, new Date(period.startsAt.getTime() - DAY_MS), new Date(period.endsAt.getTime() + DAY_MS));
  const approvals = await db
    .select()
    .from(schema.timesheetApproval)
    .where(eq(schema.timesheetApproval.periodStart, period.start));
  const approved = new Map(approvals.map((a) => [a.employeeId, a]));

  const rows = employees
    .map((employee) => ({
      employee,
      row: timesheetRow(employee.id, punches.get(employee.id) ?? [], period, now, { timeZone, missingClockOutHours }),
      approval: approved.get(employee.id) ?? null,
    }))
    .filter(({ employee, row }) => employee.active || row.shifts.length > 0 || row.orphans.length > 0);

  return {
    period,
    previousStart: addDays(period.start, -payPeriodDays),
    nextStart: addDays(period.start, payPeriodDays),
    isCurrent: now >= period.startsAt && now < period.endsAt,
    timeZone,
    rows,
  };
}

export async function approveTimesheet(db: Db, input: { employeeId: string; periodStart: LocalDate; approvedBy: string; now: Date }) {
  if (!isLocalDate(input.periodStart)) throw new UserError("Choose a pay period.");
  await db
    .insert(schema.timesheetApproval)
    .values({ employeeId: input.employeeId, periodStart: input.periodStart, approvedBy: input.approvedBy, approvedAt: input.now })
    .onConflictDoNothing();
}

export async function unapproveTimesheet(db: Db, employeeId: string, periodStart: LocalDate) {
  await db
    .delete(schema.timesheetApproval)
    .where(and(eq(schema.timesheetApproval.employeeId, employeeId), eq(schema.timesheetApproval.periodStart, periodStart)));
}

/** A changed punch reopens that employee's timesheet so it gets looked at again. */
export async function reopenTimesheetAt(db: Db, employeeId: string, at: Date) {
  const period = await periodFor(db, at);
  await unapproveTimesheet(db, employeeId, period.start);
}
