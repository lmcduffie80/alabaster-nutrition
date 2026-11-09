import "server-only";
import type { Db } from "@/db";
import { allowedPunches, buildShifts, type ClockStatus, type PunchKind } from "@/lib/domain/punches";
import { addDays, formatDay, formatTime, localDateOf, startOfLocalDay } from "@/lib/domain/time";
import { getBusiness } from "./business";
import { currentShiftPunches } from "./punches";
import { publishedShifts } from "./schedule";

export type KioskEmployeeView = {
  displayName: string;
  status: ClockStatus;
  actions: PunchKind[];
  /** Worked so far in the current shift, as of `serverNow`. */
  workedMs: number;
  clockedInAt: string | null;
  serverNow: number;
  today: string | null;
  upcoming: { id: string; day: string; time: string; position: string }[];
};

/** What an employee sees on the kiosk after typing their PIN: no pay data, only their own shifts. */
export async function kioskEmployeeView(db: Db, employee: { id: string; displayName: string }, now: Date): Promise<KioskEmployeeView> {
  const { timeZone } = await getBusiness(db);
  const punches = await currentShiftPunches(db, employee.id);
  const open = buildShifts(punches, now).shifts.find((s) => s.clockOut === null) ?? null;
  const status: ClockStatus = open ? (open.onBreak ? "break" : "in") : "out";

  const todayDate = localDateOf(now, timeZone);
  const shifts = await publishedShifts(
    db,
    { from: startOfLocalDay(todayDate, timeZone), to: startOfLocalDay(addDays(todayDate, 7), timeZone) },
    [employee.id],
  );
  const describe = (s: (typeof shifts)[number]) => `${formatTime(s.startsAt, timeZone)} – ${formatTime(s.endsAt, timeZone)}`;
  const todays = shifts.find((s) => localDateOf(s.startsAt, timeZone) === todayDate);

  return {
    displayName: employee.displayName,
    status,
    actions: allowedPunches(status),
    workedMs: open?.workedMs ?? 0,
    clockedInAt: open ? formatTime(open.clockIn.at, timeZone) : null,
    serverNow: now.getTime(),
    today: todays ? `${describe(todays)}${todays.position ? ` · ${todays.position}` : ""}` : null,
    upcoming: shifts.map((s) => {
      const date = localDateOf(s.startsAt, timeZone);
      return { id: s.id, day: date === todayDate ? "Today" : formatDay(date), time: describe(s), position: s.position };
    }),
  };
}
