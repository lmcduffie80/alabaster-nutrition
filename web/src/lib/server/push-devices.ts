import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { UserError } from "./errors";
import { isDeviceToken } from "./push";

/** Remembers this phone for the employee; a phone that changes hands moves to the new person. */
export async function registerDevice(db: Db, employeeId: string, token: unknown) {
  if (!isDeviceToken(token)) throw new UserError("That device couldn't be registered.");
  const value = token.toLowerCase();
  await db
    .insert(schema.pushDevice)
    .values({ employeeId, token: value })
    .onConflictDoUpdate({ target: [schema.pushDevice.businessId, schema.pushDevice.token], set: { employeeId } });
}

export async function forgetDevice(db: Db, employeeId: string, token: unknown) {
  if (!isDeviceToken(token)) return;
  await db
    .delete(schema.pushDevice)
    .where(and(eq(schema.pushDevice.employeeId, employeeId), eq(schema.pushDevice.token, token.toLowerCase())));
}

export async function forgetTokens(db: Db, tokens: string[]) {
  if (tokens.length) await db.delete(schema.pushDevice).where(inArray(schema.pushDevice.token, tokens));
}

/** Device tokens per employee, for the given people. */
export async function devicesFor(db: Db, employeeIds: string[]): Promise<Map<string, string[]>> {
  const devices = new Map<string, string[]>();
  if (employeeIds.length === 0) return devices;
  const rows = await db
    .select({ employeeId: schema.pushDevice.employeeId, token: schema.pushDevice.token })
    .from(schema.pushDevice)
    .where(inArray(schema.pushDevice.employeeId, employeeIds));
  for (const row of rows) devices.set(row.employeeId, [...(devices.get(row.employeeId) ?? []), row.token]);
  return devices;
}
