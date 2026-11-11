import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { withBusiness } from "@/db/tenant";
import { localDateOf, weekStartOf } from "@/lib/domain/time";
import { tokenDigest } from "./secrets";
import { ensureOwner, normalizeEmail } from "./team";

/**
 * The only code that reads the database without `withBusiness`: the lookups that find out which business a
 * request belongs to. Keep it to IDs and the few fields sign-in needs.
 */

/** Alabaster, whose managers can also come from `MANAGER_EMAILS`. */
export const FIRST_BUSINESS_ID = 1;

export type Membership = {
  businessId: number;
  businessName: string;
  employeeId: string;
  role: "manager" | "employee";
  displayName: string;
};

export async function businessesForEmail(db: Db, email: string): Promise<Membership[]> {
  return db
    .select({
      businessId: schema.employee.businessId,
      businessName: schema.business.name,
      employeeId: schema.employee.id,
      role: schema.employee.role,
      displayName: schema.employee.displayName,
    })
    .from(schema.employee)
    .innerJoin(schema.business, eq(schema.business.id, schema.employee.businessId))
    .where(and(eq(schema.employee.email, normalizeEmail(email)), eq(schema.employee.active, true)))
    .orderBy(asc(schema.business.name));
}

export type KioskDevice = typeof schema.kioskDevice.$inferSelect;

export async function kioskByToken(db: Db, token: string | undefined, now = new Date()): Promise<KioskDevice | null> {
  if (!token) return null;
  const [device] = await db
    .select()
    .from(schema.kioskDevice)
    .where(and(eq(schema.kioskDevice.tokenDigest, tokenDigest(token)), isNull(schema.kioskDevice.revokedAt)));
  if (!device) return null;
  if (!device.lastSeenAt || now.getTime() - device.lastSeenAt.getTime() > 3_600_000) {
    await db.update(schema.kioskDevice).set({ lastSeenAt: now }).where(eq(schema.kioskDevice.id, device.id));
  }
  return device;
}

export async function createBusiness(
  db: Db,
  input: { name: string; timeZone?: string; now?: Date; id?: number },
): Promise<number> {
  const timeZone = input.timeZone ?? "America/New_York";
  const [created] = await db
    .insert(schema.business)
    .values({
      ...(input.id ? { id: input.id } : {}),
      name: input.name,
      timeZone,
      payPeriodAnchor: weekStartOf(localDateOf(input.now ?? new Date(), timeZone)),
    })
    .returning({ id: schema.business.id });
  return created.id;
}

/** `MANAGER_EMAILS` people are Alabaster managers; their employee row is created or upgraded on sign-in. */
export async function ensureFirstBusinessManager(db: Db, email: string, firstName: string) {
  const [first] = await db.select({ id: schema.business.id }).from(schema.business).where(eq(schema.business.id, FIRST_BUSINESS_ID));
  if (!first) await createBusiness(db, { id: FIRST_BUSINESS_ID, name: "Alabaster Nutrition" }).catch(() => undefined);
  return withBusiness(db, FIRST_BUSINESS_ID, (tx) => ensureOwner(tx, email, firstName));
}
