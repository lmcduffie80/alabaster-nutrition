import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { afterFailedAttempt } from "@/lib/domain/pins";
import { getBusiness } from "./business";
import { UserError } from "./errors";
import { newToken, pinDigest, tokenDigest } from "./secrets";

export type { KioskDevice } from "./system";

export async function enrollKiosk(db: Db, label: string) {
  const name = label.trim().slice(0, 40) || "Store iPad";
  const token = newToken();
  const [device] = await db
    .insert(schema.kioskDevice)
    .values({ label: name, tokenDigest: tokenDigest(token) })
    .returning();
  return { device, token };
}

export async function listKiosks(db: Db) {
  return db.select().from(schema.kioskDevice).where(isNull(schema.kioskDevice.revokedAt)).orderBy(schema.kioskDevice.createdAt);
}

export async function revokeKiosk(db: Db, id: string, now = new Date()) {
  await db.update(schema.kioskDevice).set({ revokedAt: now }).where(eq(schema.kioskDevice.id, id));
}

export type PinCheck =
  | { kind: "employee"; employeeId: string; displayName: string }
  | { kind: "manager" }
  | { kind: "wrong" }
  | { kind: "locked"; lockedUntil: Date };

/**
 * Checks a PIN typed on a kiosk, counting wrong tries per kiosk.
 * `expect` limits which PIN is accepted: an employee's on the keypad, the manager PIN on the manager pad.
 */
export async function checkKioskPin(
  db: Db,
  input: { kioskId: string; pin: string; expect: "employee" | "manager"; now: Date },
): Promise<PinCheck> {
  return db.transaction(async (tx) => {
    const [device] = await tx.select().from(schema.kioskDevice).where(eq(schema.kioskDevice.id, input.kioskId)).for("update");
    if (!device || device.revokedAt) throw new UserError("This device isn't the store kiosk anymore.");
    if (device.lockedUntil && device.lockedUntil > input.now) return { kind: "locked", lockedUntil: device.lockedUntil };

    let match: PinCheck = { kind: "wrong" };
    if (/^\d{4}$/.test(input.pin)) {
      const digest = pinDigest(input.pin);
      if (input.expect === "manager") {
        const business = await getBusiness(tx);
        if (business.managerPinDigest === digest) match = { kind: "manager" };
      } else {
        const [employee] = await tx
          .select({ id: schema.employee.id, displayName: schema.employee.displayName })
          .from(schema.employee)
          .where(and(eq(schema.employee.pinDigest, digest), eq(schema.employee.active, true)));
        if (employee) match = { kind: "employee", employeeId: employee.id, displayName: employee.displayName };
      }
    }

    if (match.kind !== "wrong") {
      if (device.failedAttempts !== 0) {
        await tx.update(schema.kioskDevice).set({ failedAttempts: 0 }).where(eq(schema.kioskDevice.id, device.id));
      }
      return match;
    }
    const next = afterFailedAttempt(device.failedAttempts, input.now);
    await tx.update(schema.kioskDevice).set(next).where(eq(schema.kioskDevice.id, device.id));
    return next.lockedUntil ? { kind: "locked", lockedUntil: next.lockedUntil } : { kind: "wrong" };
  });
}
