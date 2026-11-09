import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { instantAt, isLocalDate, weekStartOf, type LocalDate } from "@/lib/domain/time";
import { getBusiness } from "./business";
import { UserError } from "./errors";

export type ScheduledShift = {
  id: string;
  employeeId: string;
  weekStart: LocalDate;
  startsAt: Date;
  endsAt: Date;
  position: string;
};

const shiftColumns = {
  id: schema.shift.id,
  employeeId: schema.shift.employeeId,
  weekStart: schema.shift.weekStart,
  startsAt: schema.shift.startsAt,
  endsAt: schema.shift.endsAt,
  position: schema.shift.position,
};

export type ShiftInput = {
  employeeId: string;
  date: LocalDate;
  /** Minutes after midnight, local time. */
  startMinutes: number;
  endMinutes: number;
  position: string;
};

const MAX_SHIFT_MINUTES = 16 * 60;

async function resolve(db: Db, input: ShiftInput) {
  if (!isLocalDate(input.date)) throw new UserError("Choose a day for the shift.");
  const valid = (m: number) => Number.isInteger(m) && m >= 0 && m < 24 * 60;
  if (!valid(input.startMinutes) || !valid(input.endMinutes)) throw new UserError("Enter a start and end time.");
  // An end time at or before the start means the shift runs past midnight.
  const length = (input.endMinutes - input.startMinutes + 24 * 60) % (24 * 60) || 24 * 60;
  if (length > MAX_SHIFT_MINUTES) throw new UserError("A shift can be at most 16 hours.");
  const [employee] = await db
    .select({ active: schema.employee.active })
    .from(schema.employee)
    .where(eq(schema.employee.id, input.employeeId));
  if (!employee?.active) throw new UserError("Choose an active employee.");
  const { timeZone } = await getBusiness(db);
  const startsAt = instantAt(input.date, input.startMinutes, timeZone);
  return {
    employeeId: input.employeeId,
    weekStart: weekStartOf(input.date),
    startsAt,
    endsAt: new Date(startsAt.getTime() + length * 60_000),
    position: input.position.trim().slice(0, 40),
  };
}

export async function addShift(db: Db, input: ShiftInput) {
  const values = await resolve(db, input);
  await db.insert(schema.scheduleWeek).values({ weekStart: values.weekStart }).onConflictDoNothing();
  await db.insert(schema.shift).values(values);
}

export async function updateShift(db: Db, id: string, input: ShiftInput) {
  const values = await resolve(db, input);
  await db.insert(schema.scheduleWeek).values({ weekStart: values.weekStart }).onConflictDoNothing();
  const updated = await db.update(schema.shift).set(values).where(eq(schema.shift.id, id)).returning({ id: schema.shift.id });
  if (updated.length === 0) throw new UserError("That shift was already deleted.");
}

export async function deleteShift(db: Db, id: string) {
  await db.delete(schema.shift).where(eq(schema.shift.id, id));
}

export async function weekSchedule(db: Db, weekStart: LocalDate) {
  const [week] = await db.select().from(schema.scheduleWeek).where(eq(schema.scheduleWeek.weekStart, weekStart));
  const shifts = await db
    .select(shiftColumns)
    .from(schema.shift)
    .where(eq(schema.shift.weekStart, weekStart))
    .orderBy(asc(schema.shift.startsAt));
  return { weekStart, publishedAt: week?.publishedAt ?? null, shifts };
}

export async function publishWeek(db: Db, weekStart: LocalDate, now = new Date()) {
  if (!isLocalDate(weekStart)) throw new UserError("Choose a week.");
  await db
    .insert(schema.scheduleWeek)
    .values({ weekStart, publishedAt: now })
    .onConflictDoUpdate({ target: schema.scheduleWeek.weekStart, set: { publishedAt: now } });
}

export async function unpublishWeek(db: Db, weekStart: LocalDate) {
  await db.update(schema.scheduleWeek).set({ publishedAt: null }).where(eq(schema.scheduleWeek.weekStart, weekStart));
}

/** Shifts employees are allowed to see: only weeks the manager has published. */
export async function publishedShifts(db: Db, range: { from: Date; to: Date }, employeeIds?: string[]): Promise<ScheduledShift[]> {
  return db
    .select(shiftColumns)
    .from(schema.shift)
    .innerJoin(schema.scheduleWeek, eq(schema.scheduleWeek.weekStart, schema.shift.weekStart))
    .where(
      and(
        isNotNull(schema.scheduleWeek.publishedAt),
        gte(schema.shift.endsAt, range.from),
        lt(schema.shift.startsAt, range.to),
        employeeIds ? inArray(schema.shift.employeeId, employeeIds) : undefined,
      ),
    )
    .orderBy(asc(schema.shift.startsAt));
}
