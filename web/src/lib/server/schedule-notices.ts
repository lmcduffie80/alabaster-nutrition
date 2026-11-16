import "server-only";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { changedEmployees, snapshotOf, type WeekSnapshot } from "@/lib/domain/schedule-notices";
import { addDays, formatDay, formatRange, formatTime, isLocalDate, localDateOf, type LocalDate } from "@/lib/domain/time";
import { getBusiness } from "./business";
import { UserError } from "./errors";
import { devicesFor } from "./push-devices";
import { weekSchedule } from "./schedule";
import { listEmployees } from "./team";

export type ScheduleNotice = {
  kind: "published" | "changed";
  employeeId: string;
  name: string;
  /** Null when they have no email or turned schedule emails off. */
  email: string | null;
  /** Their phones with the Metzey app and notifications on. */
  devices: string[];
  businessId: number;
  businessName: string;
  week: string;
  shifts: NoticeShift[];
};

export type NoticeShift = { weekday: string; date: string; time: string; position: string; calledIn: boolean; minutes: number };

/** Like "Mon, Nov 16 · 9:00 AM – 1:00 PM · Register". */
export function shiftText(shift: NoticeShift) {
  return [`${shift.weekday}, ${shift.date}`, shift.time, shift.position, shift.calledIn ? "called in" : ""].filter(Boolean).join(" · ");
}

/** Hours they're expected to work; called-in shifts don't count. */
export function noticeMinutes(notice: ScheduleNotice) {
  return notice.shifts.reduce((total, s) => (s.calledIn ? total : total + s.minutes), 0);
}

async function current(db: Db, weekStart: LocalDate) {
  if (!isLocalDate(weekStart)) throw new UserError("Choose a week.");
  const [week, [row]] = await Promise.all([
    weekSchedule(db, weekStart),
    db.select({ snapshot: schema.scheduleWeek.notifiedSnapshot }).from(schema.scheduleWeek).where(eq(schema.scheduleWeek.weekStart, weekStart)),
  ]);
  return { week, now: snapshotOf(week.shifts), notified: (row?.snapshot ?? null) as WeekSnapshot | null };
}

/**
 * For a published week: whether the team was ever told about it (weeks published before notices existed
 * weren't), and the active employees whose shifts changed since they last were.
 */
export async function pendingChanges(db: Db, weekStart: LocalDate): Promise<{ neverNotified: boolean; changed: string[] }> {
  const { week, now, notified } = await current(db, weekStart);
  if (!week.publishedAt) return { neverNotified: false, changed: [] };
  if (notified === null) return { neverNotified: Object.keys(now).length > 0, changed: [] };
  const active = new Set((await listEmployees(db)).map((e) => e.id));
  return { neverNotified: false, changed: changedEmployees(notified, now).filter((id) => active.has(id)) };
}

/**
 * Works out who to tell about a published week (everyone scheduled, or only those whose shifts changed) and
 * remembers the week as notified, so the next "changed" notice only covers later edits.
 */
export async function takeNotices(db: Db, weekStart: LocalDate, asked: ScheduleNotice["kind"]): Promise<ScheduleNotice[]> {
  const { week, now, notified } = await current(db, weekStart);
  if (!week.publishedAt) throw new UserError("Publish the week first.");
  const kind = notified === null ? "published" : asked;
  const recipients = kind === "published" ? Object.keys(now) : changedEmployees(notified, now);
  await db.update(schema.scheduleWeek).set({ notifiedSnapshot: now }).where(eq(schema.scheduleWeek.weekStart, weekStart));
  if (recipients.length === 0) return [];

  const [{ id: businessId, name: businessName, timeZone }, people, devices] = await Promise.all([
    getBusiness(db),
    listEmployees(db),
    devicesFor(db, recipients),
  ]);
  const label = formatRange({ start: weekStart, end: addDays(weekStart, 7) });
  return people
    .filter((person) => recipients.includes(person.id))
    .map((person) => ({
      kind,
      employeeId: person.id,
      name: person.displayName,
      email: person.email && person.notifyEmail ? person.email : null,
      devices: devices.get(person.id) ?? [],
      businessId,
      businessName,
      week: label,
      shifts: week.shifts
        .filter((s) => s.employeeId === person.id)
        .map((s) => {
          const [weekday, date] = formatDay(localDateOf(s.startsAt, timeZone)).split(", ");
          return {
            weekday,
            date,
            time: `${formatTime(s.startsAt, timeZone)} – ${formatTime(s.endsAt, timeZone)}`,
            position: s.position,
            calledIn: s.calledInAt !== null,
            minutes: Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000),
          };
        }),
    }));
}

export function noticeTitle(notice: ScheduleNotice) {
  return notice.kind === "published" ? `Your schedule for ${notice.week}` : `Your schedule changed: ${notice.week}`;
}

export function noticeBody(notice: ScheduleNotice) {
  if (notice.shifts.length === 0) return "You're no longer scheduled that week.";
  return notice.shifts.map(shiftText).join("\n");
}
