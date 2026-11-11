import { sql } from "drizzle-orm";
import type { Db } from "./index";

/**
 * Runs `work` in one transaction that can only see and write `businessId`'s rows: it sets the setting the
 * row-level security policies read and drops to the `tenant_app` role, both until the transaction ends.
 */
export async function withBusiness<T>(db: Db, businessId: number, work: (db: Db) => Promise<T>): Promise<T> {
  if (!Number.isSafeInteger(businessId) || businessId < 1) throw new Error("A business is required.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.business_id', ${String(businessId)}, true)`);
    await tx.execute(sql`set local role tenant_app`);
    return work(tx as unknown as Db);
  });
}

/**
 * Tests only: makes the whole single-connection test database act as one business (or, with `null`, the
 * unrestricted owner again).
 */
export async function asBusiness(db: Db, businessId: number | null) {
  if (businessId === null) {
    await db.execute(sql`reset role`);
    await db.execute(sql`select set_config('app.business_id', '', false)`);
    return;
  }
  await db.execute(sql`reset role`);
  await db.execute(sql`select set_config('app.business_id', ${String(businessId)}, false)`);
  await db.execute(sql`set role tenant_app`);
}
