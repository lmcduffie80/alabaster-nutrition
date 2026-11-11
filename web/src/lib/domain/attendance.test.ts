import { describe, expect, it } from "vitest";
import { attendanceFor, summarizeAttendance, type ScheduledForAttendance } from "./attendance";
import { buildShifts, type EffectivePunch } from "./punches";

const timeZone = "America/New_York";
const at = (iso: string) => new Date(iso);
const options = { timeZone, lateGraceMinutes: 5 };

function scheduled(id: string, start: string, end: string, calledIn = false): ScheduledForAttendance {
  return { id, startsAt: at(start), endsAt: at(end), position: "", calledInAt: calledIn ? at(start) : null, calledInNote: "" };
}

function worked(...pairs: [string, string][]) {
  const punches: EffectivePunch[] = pairs.flatMap(([inAt, outAt], i) => [
    { id: `in${i}`, kind: "clockIn" as const, at: at(inAt) },
    { id: `out${i}`, kind: "clockOut" as const, at: at(outAt) },
  ]);
  return buildShifts(punches, at("2026-11-20T00:00:00Z")).shifts;
}

describe("attendance", () => {
  // 7:00 AM New York = 12:00 UTC in November.
  const now = at("2026-11-13T20:00:00Z");

  it("counts a clock-in within the grace period as on time, and after it as late", () => {
    const entries = attendanceFor(
      [scheduled("mon", "2026-11-09T12:00:00Z", "2026-11-09T18:00:00Z"), scheduled("tue", "2026-11-10T12:00:00Z", "2026-11-10T18:00:00Z")],
      worked(["2026-11-09T12:05:00Z", "2026-11-09T18:00:00Z"], ["2026-11-10T12:17:00Z", "2026-11-10T18:00:00Z"]),
      now,
      options,
    );
    expect(entries.map((e) => [e.date, e.status, e.minutesLate])).toEqual([
      ["2026-11-09", "onTime", 5],
      ["2026-11-10", "late", 17],
    ]);
  });

  it("matches an early clock-in, but not one after the shift ended", () => {
    const entries = attendanceFor(
      [scheduled("early", "2026-11-09T12:00:00Z", "2026-11-09T18:00:00Z"), scheduled("after", "2026-11-10T12:00:00Z", "2026-11-10T14:00:00Z")],
      worked(["2026-11-09T11:30:00Z", "2026-11-09T18:00:00Z"], ["2026-11-10T15:00:00Z", "2026-11-10T18:00:00Z"]),
      now,
      options,
    );
    expect(entries.map((e) => [e.shift.id, e.status, e.minutesLate])).toEqual([
      ["early", "onTime", -30],
      ["after", "noClockIn", null],
    ]);
  });

  it("uses each clock-in for one scheduled shift only", () => {
    const entries = attendanceFor(
      [scheduled("a", "2026-11-09T12:00:00Z", "2026-11-09T14:00:00Z"), scheduled("b", "2026-11-09T13:00:00Z", "2026-11-09T18:00:00Z")],
      worked(["2026-11-09T12:00:00Z", "2026-11-09T18:00:00Z"]),
      now,
      options,
    );
    expect(entries.map((e) => e.status)).toEqual(["onTime", "noClockIn"]);
  });

  it("shows call-ins, missing clock-ins, and shifts that haven't started", () => {
    const entries = attendanceFor(
      [
        scheduled("called", "2026-11-11T12:00:00Z", "2026-11-11T18:00:00Z", true),
        scheduled("missed", "2026-11-12T12:00:00Z", "2026-11-12T18:00:00Z"),
        scheduled("grace", "2026-11-13T19:57:00Z", "2026-11-13T23:00:00Z"),
        scheduled("future", "2026-11-14T12:00:00Z", "2026-11-14T18:00:00Z", false),
      ],
      [],
      now,
      options,
    );
    expect(entries.map((e) => e.status)).toEqual(["calledIn", "noClockIn", "upcoming", "upcoming"]);
  });

  it("prefers an actual clock-in over a call-in mark", () => {
    const [entry] = attendanceFor(
      [scheduled("x", "2026-11-09T12:00:00Z", "2026-11-09T18:00:00Z", true)],
      worked(["2026-11-09T12:40:00Z", "2026-11-09T18:00:00Z"]),
      now,
      options,
    );
    expect(entry.status).toBe("late");
  });

  it("totals late shifts and minutes", () => {
    const entries = attendanceFor(
      [
        scheduled("a", "2026-11-09T12:00:00Z", "2026-11-09T18:00:00Z"),
        scheduled("b", "2026-11-10T12:00:00Z", "2026-11-10T18:00:00Z"),
        scheduled("c", "2026-11-11T12:00:00Z", "2026-11-11T18:00:00Z", true),
        scheduled("d", "2026-11-12T12:00:00Z", "2026-11-12T18:00:00Z"),
      ],
      worked(["2026-11-09T12:10:00Z", "2026-11-09T18:00:00Z"], ["2026-11-10T12:20:00Z", "2026-11-10T18:00:00Z"]),
      now,
      options,
    );
    expect(summarizeAttendance(entries)).toEqual({ scheduled: 4, late: 2, minutesLate: 30, calledIn: 1, noClockIn: 1 });
  });
});
