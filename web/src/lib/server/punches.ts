import "server-only";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { currentStatus, isAllowed, punchKinds, type ClockStatus, type EffectivePunch, type PunchKind } from "@/lib/domain/punches";
import { UserError } from "./errors";

const p = schema.punch;
const effectiveAt = sql<Date>`coalesce(${p.effectiveAt}, ${p.at})`;

function toEffective(row: { id: string; kind: PunchKind; at: Date; effectiveAt: Date | null }): EffectivePunch {
  return { id: row.id, kind: row.kind, at: row.effectiveAt ?? row.at, adjusted: row.effectiveAt !== null };
}

const punchColumns = { id: p.id, employeeId: p.employeeId, kind: p.kind, at: p.at, effectiveAt: p.effectiveAt };

/** Punches that count, for these employees, between two instants (by their current time). */
export async function effectivePunches(db: Db, employeeIds: string[], from: Date, to: Date) {
  const byEmployee = new Map<string, EffectivePunch[]>(employeeIds.map((id) => [id, []]));
  if (employeeIds.length === 0) return byEmployee;
  const rows = await db
    .select(punchColumns)
    .from(p)
    .where(and(inArray(p.employeeId, employeeIds), eq(p.voided, false), gte(effectiveAt, from), lt(effectiveAt, to)))
    .orderBy(effectiveAt);
  for (const row of rows) byEmployee.get(row.employeeId)?.push(toEffective(row));
  return byEmployee;
}

/** Everything since the employee's latest clock-in: enough to know where they stand now. */
export async function currentShiftPunches(db: Db, employeeId: string): Promise<EffectivePunch[]> {
  const [lastIn] = await db
    .select({ at: effectiveAt })
    .from(p)
    .where(and(eq(p.employeeId, employeeId), eq(p.voided, false), eq(p.kind, "clockIn")))
    .orderBy(desc(effectiveAt))
    .limit(1);
  if (!lastIn) return [];
  const rows = await db
    .select(punchColumns)
    .from(p)
    .where(and(eq(p.employeeId, employeeId), eq(p.voided, false), gte(effectiveAt, new Date(lastIn.at))))
    .orderBy(effectiveAt);
  return rows.map(toEffective);
}

export async function clockStatus(db: Db, employeeId: string, now: Date): Promise<ClockStatus> {
  return currentStatus(await currentShiftPunches(db, employeeId), now);
}

const wrongState: Record<PunchKind, string> = {
  clockIn: "You're already clocked in.",
  clockOut: "You're not clocked in.",
  breakStart: "You can only start a break while clocked in.",
  breakEnd: "You're not on a break.",
};

/**
 * Records a punch at the server's time. A repeated `requestId` returns the first result
 * instead of punching twice.
 */
export async function recordKioskPunch(
  db: Db,
  input: { employeeId: string; kind: PunchKind; requestId: string; kioskDeviceId: string; now: Date },
) {
  if (!punchKinds.includes(input.kind)) throw new UserError("Unknown action.");
  return db.transaction(async (tx) => {
    const [repeat] = await tx.select({ at: p.at, kind: p.kind }).from(p).where(eq(p.requestId, input.requestId));
    if (repeat) return repeat;

    // Serialize punches per employee so two quick taps can't both pass the state check.
    await tx.select({ id: schema.employee.id }).from(schema.employee).where(eq(schema.employee.id, input.employeeId)).for("update");
    const status = currentStatus(await currentShiftPunches(tx, input.employeeId), input.now);
    if (!isAllowed(status, input.kind)) throw new UserError(wrongState[input.kind]);

    const [created] = await tx
      .insert(p)
      .values({
        employeeId: input.employeeId,
        kind: input.kind,
        at: input.now,
        source: "kiosk",
        kioskDeviceId: input.kioskDeviceId,
        requestId: input.requestId,
      })
      .returning({ at: p.at, kind: p.kind });
    return created;
  });
}

function requireReason(reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < 3) throw new UserError("Add a short reason for the change.");
  if (trimmed.length > 300) throw new UserError("Keep the reason under 300 characters.");
  return trimmed;
}

function assertNotFuture(at: Date, now: Date) {
  if (at.getTime() > now.getTime() + 60_000) throw new UserError("A punch can't be in the future.");
}

export async function addManagerPunch(
  db: Db,
  input: { employeeId: string; kind: PunchKind; at: Date; reason: string; changedBy: string; now: Date },
) {
  const reason = requireReason(input.reason);
  if (!punchKinds.includes(input.kind)) throw new UserError("Unknown punch type.");
  assertNotFuture(input.at, input.now);
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(p)
      .values({ employeeId: input.employeeId, kind: input.kind, at: input.at, source: "manager" })
      .returning({ id: p.id });
    await tx.insert(schema.punchAudit).values({
      punchId: created.id,
      action: "add",
      newAt: input.at,
      reason,
      changedBy: input.changedBy,
    });
  });
}

export async function editPunchTime(db: Db, input: { punchId: string; at: Date; reason: string; changedBy: string; now: Date }) {
  const reason = requireReason(input.reason);
  assertNotFuture(input.at, input.now);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(p).where(eq(p.id, input.punchId)).for("update");
    if (!row || row.voided) throw new UserError("That punch was removed or no longer exists.");
    const previous = row.effectiveAt ?? row.at;
    // For a manager-added punch the original time is the manager's entry, so the edit replaces it.
    await tx.update(p).set({ effectiveAt: input.at }).where(eq(p.id, row.id));
    await tx.insert(schema.punchAudit).values({
      punchId: row.id,
      action: "edit",
      previousAt: previous,
      newAt: input.at,
      reason,
      changedBy: input.changedBy,
    });
  });
}

export async function removePunch(db: Db, input: { punchId: string; reason: string; changedBy: string }) {
  const reason = requireReason(input.reason);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(p).where(eq(p.id, input.punchId)).for("update");
    if (!row || row.voided) throw new UserError("That punch was already removed.");
    await tx.update(p).set({ voided: true }).where(eq(p.id, row.id));
    await tx.insert(schema.punchAudit).values({
      punchId: row.id,
      action: "remove",
      previousAt: row.effectiveAt ?? row.at,
      reason,
      changedBy: input.changedBy,
    });
  });
}

export async function punchHistory(db: Db, punchIds: string[]) {
  if (punchIds.length === 0) return [];
  return db
    .select()
    .from(schema.punchAudit)
    .where(inArray(schema.punchAudit.punchId, punchIds))
    .orderBy(schema.punchAudit.createdAt);
}
