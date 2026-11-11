// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { openBusinessDatabase } from "@/test/businesses";
import { schema } from "@/db";
import { attendanceReport } from "./attendance";
import { getBusiness, updateBusinessSettings } from "./business";
import { UserError } from "./errors";
import { checkKioskPin, enrollKiosk, revokeKiosk } from "./kiosk";
import { kioskByToken } from "./system";
import { addManagerPunch, clockStatus, editPunchTime, punchHistory, recordKioskPunch, removePunch } from "./punches";
import { addShift, publishedShifts, publishWeek, setCalledIn, weekSchedule } from "./schedule";
import {
  addEmployee,
  assignRandomPin,
  ensureOwner,
  findEmployeeByEmail,
  listEmployees,
  setEmployeeActive,
  setEmployeePin,
  setManagerPin,
  updateEmployee,
} from "./team";
import { approveTimesheet, periodTimesheets, reopenTimesheetAt } from "./timesheets";

let db: Db;
const monday = new Date("2026-11-09T14:00:00Z"); // 9:00 AM in New York

beforeEach(async () => {
  db = await openBusinessDatabase(monday);
});

async function rejects(work: Promise<unknown>, message: RegExp) {
  await expect(work).rejects.toThrow(UserError);
  await expect(work).rejects.toThrow(message);
}

describe("business", () => {
  it("starts with Alabaster defaults and a Monday pay-period anchor", async () => {
    const business = await getBusiness(db);
    expect(business).toMatchObject({
      name: "Alabaster Nutrition",
      timeZone: "America/New_York",
      payPeriodAnchor: "2026-11-09",
      payPeriodDays: 7,
      missingClockOutHours: 12,
      kioskAutoReturnSeconds: 10,
      managerPinDigest: null,
    });
  });
});

describe("team", () => {
  it("adds employees with rotating colors and normalized emails", async () => {
    await ensureOwner(db, "Owner@Example.com", "Lee");
    await addEmployee(db, { displayName: "  Ava ", email: " AVA@example.com " });
    await addEmployee(db, { displayName: "Jordan", email: "" });
    const team = await listEmployees(db);
    expect(team.map((e) => [e.displayName, e.role, e.colorIndex, e.email])).toEqual([
      ["Lee", "manager", 0, "owner@example.com"],
      ["Ava", "employee", 1, "ava@example.com"],
      ["Jordan", "employee", 2, null],
    ]);
    expect((await findEmployeeByEmail(db, "ava@EXAMPLE.com"))?.displayName).toBe("Ava");
  });

  it("rejects duplicate names and emails", async () => {
    await addEmployee(db, { displayName: "Ava", email: "ava@example.com" });
    await rejects(addEmployee(db, { displayName: "ava", email: "" }), /already has that name/);
    await rejects(addEmployee(db, { displayName: "Ava B", email: "AVA@example.com" }), /already uses that email/);
    await rejects(addEmployee(db, { displayName: "Maya", email: "not-an-email" }), /valid email/);
  });

  it("keeps the owner's email tied to the app setting", async () => {
    const ownerId = await ensureOwner(db, "owner@example.com", "Lee");
    await rejects(updateEmployee(db, ownerId, { displayName: "Lee", email: "other@example.com" }), /MANAGER_EMAILS/);
    await rejects(setEmployeeActive(db, ownerId, false), /can't be deactivated/);
  });

  it("enforces PIN rules and uniqueness, including the manager PIN", async () => {
    const ava = await addEmployee(db, { displayName: "Ava", email: "" });
    const jordan = await addEmployee(db, { displayName: "Jordan", email: "" });
    await rejects(setEmployeePin(db, ava, "1234"), /straight run/);
    await rejects(setEmployeePin(db, ava, "12"), /exactly 4 digits/);
    await setEmployeePin(db, ava, "4821");
    await rejects(setEmployeePin(db, jordan, "4821"), /already in use/);
    await rejects(setManagerPin(db, "4821"), /different from every employee/);
    await setManagerPin(db, "9036");
    await rejects(setEmployeePin(db, jordan, "9036"), /already in use/);

    const pin = await assignRandomPin(db, jordan);
    expect(pin).toMatch(/^\d{4}$/);
    expect(["4821", "9036"]).not.toContain(pin);
    const [row] = await db.select({ digest: schema.employee.pinDigest }).from(schema.employee).limit(1);
    expect(row.digest).not.toContain("4821");
  });

  it("clears a PIN when someone is deactivated so it can be reused", async () => {
    const ava = await addEmployee(db, { displayName: "Ava", email: "" });
    const jordan = await addEmployee(db, { displayName: "Jordan", email: "" });
    await setEmployeePin(db, ava, "4821");
    await setEmployeeActive(db, ava, false);
    await setEmployeePin(db, jordan, "4821");
    expect((await listEmployees(db)).map((e) => e.displayName)).toEqual(["Jordan"]);
  });
});

describe("kiosk", () => {
  it("only recognizes enrolled, unrevoked devices", async () => {
    const { device, token } = await enrollKiosk(db, "Counter iPad");
    expect(device.tokenDigest).not.toBe(token);
    expect((await kioskByToken(db, token))?.label).toBe("Counter iPad");
    expect(await kioskByToken(db, "made-up-token")).toBeNull();
    expect(await kioskByToken(db, undefined)).toBeNull();
    await revokeKiosk(db, device.id);
    expect(await kioskByToken(db, token)).toBeNull();
  });

  it("checks employee and manager PINs separately and locks after five misses", async () => {
    const { device } = await enrollKiosk(db, "Counter iPad");
    const ava = await addEmployee(db, { displayName: "Ava", email: "" });
    await setEmployeePin(db, ava, "4821");
    await setManagerPin(db, "9036");
    const check = (pin: string, expect: "employee" | "manager", now = monday) =>
      checkKioskPin(db, { kioskId: device.id, pin, expect, now });

    expect(await check("4821", "employee")).toEqual({ kind: "employee", employeeId: ava, displayName: "Ava" });
    expect(await check("9036", "employee")).toEqual({ kind: "wrong" });
    expect(await check("4821", "manager")).toEqual({ kind: "wrong" });
    expect(await check("9036", "manager")).toEqual({ kind: "manager" });

    for (let i = 0; i < 4; i++) expect((await check("1111", "employee")).kind).toBe("wrong");
    const locked = await check("1111", "employee");
    expect(locked.kind).toBe("locked");
    // Even the right PIN is refused until the lock ends.
    expect((await check("4821", "employee", new Date(monday.getTime() + 29_000))).kind).toBe("locked");
    expect((await check("4821", "employee", new Date(monday.getTime() + 31_000))).kind).toBe("employee");
  });
});

describe("punches", () => {
  async function setup() {
    const { device } = await enrollKiosk(db, "Counter iPad");
    const ava = await addEmployee(db, { displayName: "Ava", email: "" });
    const punchAt = (kind: "clockIn" | "clockOut" | "breakStart" | "breakEnd", minutes: number, requestId = randomUUID()) =>
      recordKioskPunch(db, { employeeId: ava, kind, requestId, kioskDeviceId: device.id, now: new Date(monday.getTime() + minutes * 60_000) });
    return { ava, punchAt };
  }

  it("follows the clock-in, break, clock-out order", async () => {
    const { ava, punchAt } = await setup();
    await rejects(punchAt("clockOut", 0), /not clocked in/);
    await punchAt("clockIn", 0);
    await rejects(punchAt("clockIn", 1), /already clocked in/);
    await punchAt("breakStart", 120);
    expect(await clockStatus(db, ava, monday)).toBe("break");
    await punchAt("clockOut", 135);
    expect(await clockStatus(db, ava, monday)).toBe("out");
  });

  it("ignores a repeated request instead of punching twice", async () => {
    const { punchAt } = await setup();
    const requestId = randomUUID();
    const first = await punchAt("clockIn", 0, requestId);
    const again = await punchAt("clockIn", 5, requestId);
    expect(again).toEqual(first);
    expect(await db.select().from(schema.punch)).toHaveLength(1);
  });

  it("lets two quick taps through only once", async () => {
    const { punchAt } = await setup();
    const results = await Promise.allSettled([punchAt("clockIn", 0), punchAt("clockIn", 0)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(schema.punch)).toHaveLength(1);
  });

  it("keeps the original time and an audit trail when a manager fixes punches", async () => {
    const { ava, punchAt } = await setup();
    await punchAt("clockIn", 0);
    await punchAt("clockOut", 480);
    const [clockIn, clockOut] = await db.select().from(schema.punch).orderBy(schema.punch.at);
    const later = new Date(monday.getTime() + 600 * 60_000);

    await rejects(editPunchTime(db, { punchId: clockIn.id, at: monday, reason: "", changedBy: "owner", now: later }), /reason/);
    await editPunchTime(db, { punchId: clockIn.id, at: new Date(monday.getTime() - 15 * 60_000), reason: "Forgot to clock in", changedBy: "owner", now: later });
    await removePunch(db, { punchId: clockOut.id, reason: "Wrong person", changedBy: "owner" });
    await addManagerPunch(db, { employeeId: ava, kind: "clockOut", at: new Date(monday.getTime() + 470 * 60_000), reason: "Left at 4:50", changedBy: "owner", now: later });
    await rejects(
      addManagerPunch(db, { employeeId: ava, kind: "clockOut", at: new Date(later.getTime() + 3_600_000), reason: "Future", changedBy: "owner", now: later }),
      /future/,
    );

    const rows = await db.select().from(schema.punch).orderBy(schema.punch.createdAt);
    expect(rows).toHaveLength(3);
    expect(rows[0].at).toEqual(clockIn.at);
    expect(rows[1].voided).toBe(true);
    const history = await punchHistory(db, rows.map((r) => r.id));
    expect(history.map((h) => [h.action, h.reason])).toEqual([
      ["edit", "Forgot to clock in"],
      ["remove", "Wrong person"],
      ["add", "Left at 4:50"],
    ]);

    const sheet = await periodTimesheets(db, later);
    const avaRow = sheet.rows.find((r) => r.employee.id === ava)!.row;
    expect(avaRow.workedMs).toBe((470 + 15) * 60_000);
    expect(avaRow.shifts[0].adjusted).toBe(true);
  });
});

describe("timesheets", () => {
  it("approves per employee and period, and reopens after a fix", async () => {
    const ava = await addEmployee(db, { displayName: "Ava", email: "" });
    await approveTimesheet(db, { employeeId: ava, periodStart: "2026-11-09", approvedBy: "owner", now: monday });
    await approveTimesheet(db, { employeeId: ava, periodStart: "2026-11-09", approvedBy: "owner", now: monday });
    let sheet = await periodTimesheets(db, monday);
    expect(sheet.period.start).toBe("2026-11-09");
    expect(sheet.rows[0].approval?.approvedBy).toBe("owner");

    await reopenTimesheetAt(db, ava, new Date("2026-11-12T15:00:00Z"));
    sheet = await periodTimesheets(db, monday);
    expect(sheet.rows[0].approval).toBeNull();
  });

  it("navigates to earlier periods and hides former employees with no hours", async () => {
    const ava = await addEmployee(db, { displayName: "Ava", email: "" });
    await setEmployeeActive(db, ava, false);
    const sheet = await periodTimesheets(db, monday, "2026-11-04");
    expect(sheet.period).toMatchObject({ start: "2026-11-02", end: "2026-11-09" });
    expect(sheet.isCurrent).toBe(false);
    expect(sheet.rows).toHaveLength(0);
  });
});

describe("attendance report", () => {
  it("shows hours, late clock-ins, and call-ins for the pay period", async () => {
    const { device } = await enrollKiosk(db, "Counter iPad");
    const ava = await addEmployee(db, { displayName: "Ava", email: "" });
    // Mon and Tue 7 AM–1 PM New York; Ava clocks in 12 minutes late Monday and calls in Tuesday.
    await addShift(db, { employeeId: ava, date: "2026-11-09", startMinutes: 7 * 60, endMinutes: 13 * 60, position: "" });
    await addShift(db, { employeeId: ava, date: "2026-11-10", startMinutes: 7 * 60, endMinutes: 13 * 60, position: "" });
    const punch = (kind: "clockIn" | "clockOut", iso: string) =>
      recordKioskPunch(db, { employeeId: ava, kind, requestId: randomUUID(), kioskDeviceId: device.id, now: new Date(iso) });
    await punch("clockIn", "2026-11-09T12:12:00Z");
    await punch("clockOut", "2026-11-09T18:00:00Z");

    const tuesday = (await weekSchedule(db, "2026-11-09")).shifts[1];
    await rejects(setCalledIn(db, { shiftId: "nope", calledIn: true, note: "", by: "owner", now: monday }), /no longer exists/);
    await setCalledIn(db, { shiftId: tuesday.id, calledIn: true, note: " Sick ", by: "owner", now: monday });

    const later = new Date("2026-11-13T20:00:00Z");
    let report = await attendanceReport(db, later);
    const row = report.rows.find((r) => r.employee.id === ava)!;
    expect(row.workedMs).toBe((5 * 60 + 48) * 60_000);
    expect(row.entries.map((e) => [e.status, e.minutesLate, e.shift.calledInNote])).toEqual([
      ["late", 12, ""],
      ["calledIn", null, "Sick"],
    ]);
    expect(row.summary).toEqual({ scheduled: 2, late: 1, minutesLate: 12, calledIn: 1, noClockIn: 0 });

    await setCalledIn(db, { shiftId: tuesday.id, calledIn: false, note: "", by: "owner", now: monday });
    await updateBusinessSettings(db, { name: "Alabaster Nutrition", missingClockOutHours: 12, lateGraceMinutes: 15, kioskAutoReturnSeconds: 10, countWeekday: 0 });
    report = await attendanceReport(db, later);
    expect(report.rows[0].entries.map((e) => e.status)).toEqual(["onTime", "noClockIn"]);
  });
});

describe("schedule", () => {
  it("shows employees only published weeks", async () => {
    const ava = await addEmployee(db, { displayName: "Ava", email: "" });
    await addShift(db, { employeeId: ava, date: "2026-11-10", startMinutes: 7 * 60, endMinutes: 13 * 60, position: "Opener" });
    await addShift(db, { employeeId: ava, date: "2026-11-17", startMinutes: 13 * 60, endMinutes: 19 * 60, position: "Closer" });
    const range = { from: monday, to: new Date("2026-11-30T00:00:00Z") };

    expect(await publishedShifts(db, range, [ava])).toHaveLength(0);
    await publishWeek(db, "2026-11-09", monday);
    const visible = await publishedShifts(db, range, [ava]);
    expect(visible.map((s) => [s.startsAt.toISOString(), s.position])).toEqual([["2026-11-10T12:00:00.000Z", "Opener"]]);

    const week = await weekSchedule(db, "2026-11-16");
    expect(week.publishedAt).toBeNull();
    expect(week.shifts).toHaveLength(1);
  });

  it("handles overnight shifts and rejects bad ones", async () => {
    const ava = await addEmployee(db, { displayName: "Ava", email: "" });
    await addShift(db, { employeeId: ava, date: "2026-11-10", startMinutes: 22 * 60, endMinutes: 2 * 60, position: "" });
    const [shift] = (await weekSchedule(db, "2026-11-09")).shifts;
    expect(shift.endsAt.getTime() - shift.startsAt.getTime()).toBe(4 * 3_600_000);
    await rejects(addShift(db, { employeeId: ava, date: "2026-11-10", startMinutes: 6 * 60, endMinutes: 23 * 60, position: "" }), /16 hours/);
    await rejects(addShift(db, { employeeId: ava, date: "2026-02-30", startMinutes: 0, endMinutes: 60, position: "" }), /day/);
  });
});
