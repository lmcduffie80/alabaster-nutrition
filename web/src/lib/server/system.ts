import "server-only";
import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { withBusiness } from "@/db/tenant";
import { localDateOf, weekStartOf } from "@/lib/domain/time";
import { tokenDigest } from "./secrets";
import { ensureOwner, normalizeEmail } from "./team";

/**
 * With `invites.ts` and `platform.ts`, the only code that reads the database without `withBusiness`: the lookups
 * that find out which business a request belongs to. Keep it to IDs and the few fields sign-in needs.
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

/** Businesses where `email` is the only active manager who can sign in. Their account can't be deleted yet. */
export async function soleManagerOf(db: Db, email: string): Promise<string[]> {
  const sole: string[] = [];
  for (const m of await businessesForEmail(db, email)) {
    if (m.role !== "manager") continue;
    const others = await withBusiness(db, m.businessId, (tx) =>
      tx
        .select({ id: schema.employee.id })
        .from(schema.employee)
        .where(
          and(
            eq(schema.employee.role, "manager"),
            eq(schema.employee.active, true),
            isNotNull(schema.employee.email),
            ne(schema.employee.id, m.employeeId),
          ),
        )
        .limit(1),
    );
    if (others.length === 0) sole.push(m.businessName);
  }
  return sole;
}

export function soleManagerMessage(businesses: string[]) {
  return `You're the only manager of ${businesses.join(" and ")}. Add another manager with an email on the Team page first, or email shop@alabasternutrition.com to close the business.`;
}

/** Unlinks `email` from every team it's on. The employee rows and their work records stay with the business. */
export async function forgetEmail(db: Db, email: string) {
  const normalized = normalizeEmail(email);
  const rows = await db
    .selectDistinct({ businessId: schema.employee.businessId })
    .from(schema.employee)
    .where(eq(schema.employee.email, normalized));
  for (const { businessId } of rows) {
    await withBusiness(db, businessId, (tx) =>
      tx.update(schema.employee).set({ email: null }).where(eq(schema.employee.email, normalized)),
    );
  }
}

/** `MANAGER_EMAILS` people are Alabaster managers; their employee row is created or upgraded on sign-in. */
export async function ensureFirstBusinessManager(db: Db, email: string, firstName: string) {
  const [first] = await db.select({ id: schema.business.id }).from(schema.business).where(eq(schema.business.id, FIRST_BUSINESS_ID));
  if (!first) await createBusiness(db, { id: FIRST_BUSINESS_ID, name: "Alabaster Nutrition" }).catch(() => undefined);
  return withBusiness(db, FIRST_BUSINESS_ID, (tx) => ensureOwner(tx, email, firstName));
}
