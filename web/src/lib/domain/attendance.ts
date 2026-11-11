import type { WorkShift } from "./punches";
import { localDateOf, type LocalDate } from "./time";

export type AttendanceStatus = "onTime" | "late" | "calledIn" | "noClockIn" | "upcoming";

export type ScheduledForAttendance = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  position: string;
  calledInAt: Date | null;
  calledInNote: string;
};

export type AttendanceEntry = {
  shift: ScheduledForAttendance;
  date: LocalDate;
  status: AttendanceStatus;
  clockIn: Date | null;
  /** Minutes after the scheduled start; negative when early. Null without a clock-in. */
  minutesLate: number | null;
};

export type AttendanceSummary = {
  scheduled: number;
  late: number;
  minutesLate: number;
  calledIn: number;
  noClockIn: number;
};

/** A clock-in this long before the scheduled start still belongs to that shift. */
const EARLY_MATCH_MS = 2 * 3_600_000;

/**
 * Matches each scheduled shift to the first unused clock-in between two hours before its start and its end.
 * A clock-in wins over a call-in mark. With neither, the shift is upcoming until the grace period passes.
 */
export function attendanceFor(
  scheduled: ScheduledForAttendance[],
  worked: WorkShift[],
  now: Date,
  options: { timeZone: string; lateGraceMinutes: number },
): AttendanceEntry[] {
  const graceMs = options.lateGraceMinutes * 60_000;
  const used = new Set<WorkShift>();
  return [...scheduled]
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((shift) => {
      const date = localDateOf(shift.startsAt, options.timeZone);
      const match = worked.find(
        (w) =>
          !used.has(w) &&
          w.clockIn.at.getTime() >= shift.startsAt.getTime() - EARLY_MATCH_MS &&
          w.clockIn.at.getTime() < shift.endsAt.getTime(),
      );
      if (match) {
        used.add(match);
        const lateMs = match.clockIn.at.getTime() - shift.startsAt.getTime();
        return {
          shift,
          date,
          status: lateMs > graceMs ? "late" : "onTime",
          clockIn: match.clockIn.at,
          minutesLate: Math.floor(lateMs / 60_000),
        };
      }
      const status: AttendanceStatus = shift.calledInAt
        ? "calledIn"
        : now.getTime() <= shift.startsAt.getTime() + graceMs
          ? "upcoming"
          : "noClockIn";
      return { shift, date, status, clockIn: null, minutesLate: null };
    });
}

export function summarizeAttendance(entries: AttendanceEntry[]): AttendanceSummary {
  const late = entries.filter((e) => e.status === "late");
  return {
    scheduled: entries.length,
    late: late.length,
    minutesLate: late.reduce((sum, e) => sum + (e.minutesLate ?? 0), 0),
    calledIn: entries.filter((e) => e.status === "calledIn").length,
    noClockIn: entries.filter((e) => e.status === "noClockIn").length,
  };
}
