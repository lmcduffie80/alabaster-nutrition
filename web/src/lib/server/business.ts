import "server-only";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";

export type Business = typeof schema.business.$inferSelect;

/**
 * The current business's settings: the only `business` row `withBusiness` lets through. Seeing two rows
 * means the caller skipped `withBusiness`, so it fails rather than guess.
 */
export async function getBusiness(db: Db): Promise<Business> {
  const rows = await db.select().from(schema.business).limit(2);
  if (rows.length !== 1) throw new Error(rows.length ? "Business data was read without withBusiness." : "No business is selected for this request.");
  return rows[0];
}

export type BusinessSettings = Pick<Business, "name" | "missingClockOutHours" | "kioskAutoReturnSeconds" | "countWeekday">;

export async function updateBusinessSettings(db: Db, settings: BusinessSettings) {
  const { id } = await getBusiness(db);
  await db.update(schema.business).set(settings).where(eq(schema.business.id, id));
}
