import { toCsv } from "./csv";
import { buildShifts, isMissingClockOut, type EffectivePunch, type WorkShift } from "./punches";
import { formatTime, localDateOf, type LocalRange } from "./time";

export type TimesheetShift = WorkShift & { date: string; adjusted: boolean; missingClockOut: boolean };

export type TimesheetRow = {
  employeeId: string;
  shifts: TimesheetShift[];
  orphans: EffectivePunch[];
  workedMs: number;
  breakMs: number;
  needsAttention: boolean;
};

/**
 * Shifts belong to the period their clock-in falls in, so an overnight shift isn't split.
 * Open shifts are listed but only count toward totals once they're clocked out.
 */
export function timesheetRow(
  employeeId: string,
  punches: EffectivePunch[],
  period: LocalRange,
  now: Date,
  options: { timeZone: string; missingClockOutHours: number },
): TimesheetRow {
  const { shifts, orphans } = buildShifts(punches, now);
  const inPeriod = (at: Date) => at >= period.startsAt && at < period.endsAt;
  const rows = shifts
    .filter((s) => inPeriod(s.clockIn.at))
    .map((s) => ({
      ...s,
      date: localDateOf(s.clockIn.at, options.timeZone),
      adjusted: Boolean(s.clockIn.adjusted || s.clockOut?.adjusted),
      missingClockOut: isMissingClockOut(s, now, options.missingClockOutHours),
    }));
  const closed = rows.filter((s) => s.clockOut !== null);
  const periodOrphans = orphans.filter((p) => inPeriod(p.at));
  return {
    employeeId,
    shifts: rows,
    orphans: periodOrphans,
    workedMs: closed.reduce((sum, s) => sum + s.workedMs, 0),
    breakMs: closed.reduce((sum, s) => sum + s.breakMs, 0),
    needsAttention: periodOrphans.length > 0 || rows.some((s) => s.missingClockOut),
  };
}

function hours(ms: number) {
  return (ms / 3_600_000).toFixed(2);
}

export function timesheetCsv(
  rows: TimesheetRow[],
  names: Map<string, string>,
  timeZone: string,
): string {
  const lines: (string | number)[][] = [
    ["Employee", "Date", "Clock In", "Clock Out", "Break Minutes", "Hours", "Adjusted"],
  ];
  for (const row of rows) {
    const name = names.get(row.employeeId) ?? "Unknown";
    for (const shift of row.shifts) {
      lines.push([
        name,
        shift.date,
        formatTime(shift.clockIn.at, timeZone),
        shift.clockOut ? formatTime(shift.clockOut.at, timeZone) : "MISSING",
        Math.round(shift.breakMs / 60_000),
        shift.clockOut ? hours(shift.workedMs) : "",
        shift.adjusted ? "yes" : "",
      ]);
    }
  }
  return toCsv(lines);
}

export function timesheetTotalsCsv(
  rows: TimesheetRow[],
  names: Map<string, string>,
  approved: Set<string>,
): string {
  const lines: (string | number)[][] = [["Employee", "Hours", "Break Minutes", "Approved"]];
  for (const row of rows) {
    lines.push([
      names.get(row.employeeId) ?? "Unknown",
      hours(row.workedMs),
      Math.round(row.breakMs / 60_000),
      approved.has(row.employeeId) ? "yes" : "no",
    ]);
  }
  return toCsv(lines);
}
