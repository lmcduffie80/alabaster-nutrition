import { describe, expect, it } from "vitest";
import { afterFailedAttempt, isSimplePin, MAX_PIN_ATTEMPTS, pinProblem } from "./pins";
import { buildShifts, currentStatus, isAllowed, type EffectivePunch, type PunchKind } from "./punches";
import {
  addDays,
  instantAt,
  isLocalDate,
  localDateOf,
  localRange,
  minutesAfterMidnight,
  payPeriodContaining,
  weekStartOf,
} from "./time";
import { timesheetCsv, timesheetRow, timesheetTotalsCsv } from "./timesheet";

const NY = "America/New_York";

describe("PIN rules", () => {
  it.each(["0000", "7777", "1234", "6789", "4321", "9876"])("rejects simple PIN %s", (pin) => {
    expect(isSimplePin(pin)).toBe(true);
    expect(pinProblem(pin)).toBe("simple");
  });

  it.each(["4821", "1243", "0102"])("accepts %s", (pin) => {
    expect(pinProblem(pin)).toBeNull();
  });

  it.each(["123", "12345", "12a4", " 482"])("rejects malformed %s", (pin) => {
    expect(pinProblem(pin)).toBe("format");
  });

  it("locks after the fifth wrong try and resets the count", () => {
    const now = new Date("2026-11-09T15:00:00Z");
    let state: { failedAttempts: number; lockedUntil: Date | null } = { failedAttempts: 0, lockedUntil: null };
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) {
      state = afterFailedAttempt(state.failedAttempts, now);
      expect(state).toEqual({ failedAttempts: i, lockedUntil: null });
    }
    state = afterFailedAttempt(state.failedAttempts, now);
    expect(state.failedAttempts).toBe(0);
    expect(state.lockedUntil?.getTime()).toBe(now.getTime() + 30_000);
  });
});

let seq = 0;
function punch(kind: PunchKind, iso: string, adjusted = false): EffectivePunch {
  seq += 1;
  return { id: `p${seq}`, kind, at: new Date(iso), adjusted };
}

describe("punch rules", () => {
  it("follows out → in → break → in → out", () => {
    expect(isAllowed("out", "clockIn")).toBe(true);
    expect(isAllowed("out", "clockOut")).toBe(false);
    expect(isAllowed("in", "breakStart")).toBe(true);
    expect(isAllowed("in", "breakEnd")).toBe(false);
    expect(isAllowed("break", "breakEnd")).toBe(true);
    expect(isAllowed("break", "clockOut")).toBe(true);
    expect(isAllowed("break", "clockIn")).toBe(false);
  });

  it("subtracts breaks from worked time", () => {
    const { shifts, orphans } = buildShifts(
      [
        punch("clockIn", "2026-11-09T12:00:00Z"),
        punch("breakStart", "2026-11-09T15:00:00Z"),
        punch("breakEnd", "2026-11-09T15:30:00Z"),
        punch("clockOut", "2026-11-09T18:00:00Z"),
      ],
      new Date("2026-11-09T20:00:00Z"),
    );
    expect(orphans).toEqual([]);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].breakMs).toBe(30 * 60_000);
    expect(shifts[0].workedMs).toBe(5.5 * 3_600_000);
  });

  it("ends an open break when clocking out", () => {
    const { shifts } = buildShifts(
      [
        punch("clockIn", "2026-11-09T12:00:00Z"),
        punch("breakStart", "2026-11-09T17:45:00Z"),
        punch("clockOut", "2026-11-09T18:00:00Z"),
      ],
      new Date("2026-11-09T20:00:00Z"),
    );
    expect(shifts[0].breakMs).toBe(15 * 60_000);
    expect(shifts[0].workedMs).toBe(5.75 * 3_600_000);
  });

  it("counts an open shift up to now and reports the status", () => {
    const punches = [punch("clockIn", "2026-11-09T12:00:00Z"), punch("breakStart", "2026-11-09T14:00:00Z")];
    const now = new Date("2026-11-09T14:10:00Z");
    const { shifts } = buildShifts(punches, now);
    expect(shifts[0].clockOut).toBeNull();
    expect(shifts[0].onBreak).toBe(true);
    expect(shifts[0].workedMs).toBe(2 * 3_600_000);
    expect(currentStatus(punches, now)).toBe("break");
    expect(currentStatus([], now)).toBe("out");
  });

  it("sets aside punches that are out of order instead of counting them", () => {
    const stray = punch("clockOut", "2026-11-09T11:00:00Z");
    const doubleIn = punch("clockIn", "2026-11-09T13:00:00Z");
    const { shifts, orphans } = buildShifts(
      [stray, punch("clockIn", "2026-11-09T12:00:00Z"), doubleIn, punch("clockOut", "2026-11-09T16:00:00Z")],
      new Date("2026-11-09T20:00:00Z"),
    );
    expect(orphans.map((p) => p.id)).toEqual([stray.id, doubleIn.id]);
    expect(shifts[0].workedMs).toBe(4 * 3_600_000);
  });
});

describe("local time", () => {
  it("validates calendar dates", () => {
    expect(isLocalDate("2026-11-09")).toBe(true);
    expect(isLocalDate("2026-02-30")).toBe(false);
    expect(isLocalDate("2026-1-9")).toBe(false);
  });

  it("finds the local date of an instant", () => {
    expect(localDateOf(new Date("2026-11-10T03:30:00Z"), NY)).toBe("2026-11-09");
    expect(localDateOf(new Date("2026-11-10T05:30:00Z"), NY)).toBe("2026-11-10");
  });

  it("converts local times on daylight-saving change days", () => {
    expect(instantAt("2026-11-01", 0, NY).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(instantAt("2026-11-01", 12 * 60, NY).toISOString()).toBe("2026-11-01T17:00:00.000Z");
    expect(instantAt("2027-03-14", 12 * 60, NY).toISOString()).toBe("2027-03-14T16:00:00.000Z");
    expect(minutesAfterMidnight(new Date("2026-11-01T17:00:00Z"), NY)).toBe(12 * 60);
  });

  it("makes a week spanning fall-back 169 hours long", () => {
    const week = localRange("2026-10-26", 7, NY);
    expect(week.endsAt.getTime() - week.startsAt.getTime()).toBe(169 * 3_600_000);
  });

  it("finds the pay period around any date, before or after the anchor", () => {
    const anchor = "2026-11-02";
    expect(payPeriodContaining(new Date("2026-11-09T04:59:00Z"), anchor, 7, NY).start).toBe("2026-11-02");
    expect(payPeriodContaining(new Date("2026-11-09T05:00:00Z"), anchor, 7, NY).start).toBe("2026-11-09");
    expect(payPeriodContaining(new Date("2026-10-30T12:00:00Z"), anchor, 7, NY).start).toBe("2026-10-26");
    expect(payPeriodContaining(new Date("2026-11-20T12:00:00Z"), anchor, 14, NY)).toMatchObject({
      start: "2026-11-16",
      end: "2026-11-30",
    });
  });

  it("starts schedule weeks on Monday", () => {
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("timesheets", () => {
  const period = localRange("2026-11-09", 7, NY);
  const options = { timeZone: NY, missingClockOutHours: 12 };

  it("totals closed shifts in the period and flags fixes", () => {
    const row = timesheetRow(
      "ava",
      [
        punch("clockIn", "2026-11-08T12:00:00Z"),
        punch("clockOut", "2026-11-08T18:00:00Z"),
        punch("clockIn", "2026-11-09T12:00:00Z"),
        punch("clockOut", "2026-11-09T18:00:00Z", true),
        punch("clockIn", "2026-11-10T12:00:00Z"),
        punch("clockOut", "2026-11-10T16:30:00Z"),
      ],
      period,
      new Date("2026-11-11T12:00:00Z"),
      options,
    );
    expect(row.shifts.map((s) => s.date)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(row.workedMs).toBe(10.5 * 3_600_000);
    expect(row.shifts[0].adjusted).toBe(true);
    expect(row.needsAttention).toBe(false);
  });

  it("flags a shift with no clock-out after 12 hours and leaves it out of the total", () => {
    const row = timesheetRow(
      "jordan",
      [punch("clockIn", "2026-11-09T12:00:00Z")],
      period,
      new Date("2026-11-10T01:00:00Z"),
      options,
    );
    expect(row.shifts[0].missingClockOut).toBe(true);
    expect(row.workedMs).toBe(0);
    expect(row.needsAttention).toBe(true);
  });

  it("exports CSV that spreadsheets won't run as formulas", () => {
    const row = timesheetRow(
      "ava",
      [punch("clockIn", "2026-11-09T12:00:00Z"), punch("clockOut", "2026-11-09T18:15:00Z")],
      period,
      new Date("2026-11-11T12:00:00Z"),
      options,
    );
    const names = new Map([["ava", '=HYPERLINK("x"), Ava']]);
    const detail = timesheetCsv([row], names, NY);
    expect(detail.split("\r\n")[1]).toBe(`"'=HYPERLINK(""x""), Ava",2026-11-09,7:00 AM,1:15 PM,0,6.25,`);
    const totals = timesheetTotalsCsv([row], new Map([["ava", "Ava"]]), new Set(["ava"]));
    expect(totals).toBe("Employee,Hours,Break Minutes,Approved\r\nAva,6.25,0,yes\r\n");
  });
});
