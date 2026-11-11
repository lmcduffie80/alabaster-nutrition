import "server-only";
import type { Db } from "@/db";
import { attendanceFor, summarizeAttendance } from "@/lib/domain/attendance";
import type { LocalDate } from "@/lib/domain/time";
import { getBusiness } from "./business";
import { shiftsStartingBetween } from "./schedule";
import { periodTimesheets } from "./timesheets";

/** Hours worked plus how each scheduled shift went, per employee, for a pay period. */
export async function attendanceReport(db: Db, now: Date, periodStart?: LocalDate) {
  const sheet = await periodTimesheets(db, now, periodStart);
  const { name, lateGraceMinutes } = await getBusiness(db);
  const scheduled = await shiftsStartingBetween(db, sheet.period.startsAt, sheet.period.endsAt);
  const options = { timeZone: sheet.timeZone, lateGraceMinutes };

  const rows = sheet.rows.map(({ employee, row }) => {
    const entries = attendanceFor(
      scheduled.filter((s) => s.employeeId === employee.id),
      row.shifts,
      now,
      options,
    );
    return { employee, workedMs: row.workedMs, needsAttention: row.needsAttention, entries, summary: summarizeAttendance(entries) };
  });

  return {
    businessName: name,
    period: sheet.period,
    previousStart: sheet.previousStart,
    nextStart: sheet.nextStart,
    isCurrent: sheet.isCurrent,
    timeZone: sheet.timeZone,
    lateGraceMinutes,
    rows,
  };
}
