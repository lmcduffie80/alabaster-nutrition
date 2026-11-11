import type { Db } from "@/db";
import { openLocalDatabase } from "@/db/local";
import { asBusiness } from "@/db/tenant";
import { createBusiness, FIRST_BUSINESS_ID } from "@/lib/server/system";

/** A fresh in-memory database holding Alabaster as business #1, acting as that business. */
export async function openBusinessDatabase(now = new Date()): Promise<Db> {
  const db = await openLocalDatabase();
  await createBusiness(db, { id: FIRST_BUSINESS_ID, name: "Alabaster Nutrition", now });
  await asBusiness(db, FIRST_BUSINESS_ID);
  return db;
}
