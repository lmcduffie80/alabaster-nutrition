import "server-only";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { localDateOf, weekStartOf } from "@/lib/domain/time";

export type Business = typeof schema.business.$inferSelect;

const DEFAULT_TIME_ZONE = "America/New_York";

/** The store's settings row, created with Alabaster defaults the first time it's needed. */
export async function getBusiness(db: Db, now = new Date()): Promise<Business> {
  const [existing] = await db.select().from(schema.business).limit(1);
  if (existing) return existing;
  const anchor = weekStartOf(localDateOf(now, DEFAULT_TIME_ZONE));
  await db.insert(schema.business).values({ id: 1, payPeriodAnchor: anchor }).onConflictDoNothing();
  const [created] = await db.select().from(schema.business).where(eq(schema.business.id, 1));
  return created;
}

export type BusinessSettings = Pick<Business, "name" | "missingClockOutHours" | "kioskAutoReturnSeconds">;

export async function updateBusinessSettings(db: Db, settings: BusinessSettings) {
  await getBusiness(db);
  await db.update(schema.business).set(settings).where(eq(schema.business.id, 1));
}
