import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getBusiness, updateBusinessSettings } from "@/lib/server/business";
import { addSupplier, listSuppliers } from "@/lib/server/inventory";
import { enrollKiosk, listKiosks } from "@/lib/server/kiosk";
import { businessesForEmail, createBusiness, kioskByToken } from "@/lib/server/system";
import { addEmployee, listEmployees } from "@/lib/server/team";
import { type Db, schema } from "./index";
import { openLocalDatabase } from "./local";
import { withBusiness } from "./tenant";

let db: Db;
const now = new Date("2026-11-09T14:00:00Z");

beforeEach(async () => {
  db = await openLocalDatabase();
  await createBusiness(db, { id: 1, name: "Alabaster Nutrition", now });
  await createBusiness(db, { id: 2, name: "Other Cafe", now });
});

const asOne = <T>(work: (db: Db) => Promise<T>) => withBusiness(db, 1, work);
const asTwo = <T>(work: (db: Db) => Promise<T>) => withBusiness(db, 2, work);

describe("walls between businesses", () => {
  it("each business sees only its own rows", async () => {
    await asOne((tx) => addEmployee(tx, { displayName: "Ava", email: "ava@example.com" }));
    await asTwo((tx) => addEmployee(tx, { displayName: "Ben", email: "ben@example.com" }));
    await asOne((tx) => addSupplier(tx, { name: "Sysco", contact: "", notes: "" }));

    expect((await asOne(listEmployees)).map((e) => e.displayName)).toEqual(["Ava"]);
    expect((await asTwo(listEmployees)).map((e) => e.displayName)).toEqual(["Ben"]);
    expect(await asTwo(listSuppliers)).toEqual([]);
    expect((await asOne(getBusiness)).name).toBe("Alabaster Nutrition");
    expect((await asTwo(getBusiness)).name).toBe("Other Cafe");
  });

  it("names only have to be unique within a business", async () => {
    await asOne((tx) => addSupplier(tx, { name: "Sysco", contact: "", notes: "" }));
    await asTwo((tx) => addSupplier(tx, { name: "Sysco", contact: "", notes: "" }));
    await asOne((tx) => addEmployee(tx, { displayName: "Ava", email: "ava@example.com" }));
    await asTwo((tx) => addEmployee(tx, { displayName: "Ava", email: "ava@example.com" }));
    expect((await businessesForEmail(db, "ava@example.com")).map((m) => m.businessName).sort()).toEqual([
      "Alabaster Nutrition",
      "Other Cafe",
    ]);
  });

  it("can't write rows into another business", async () => {
    await expect(asOne((tx) => tx.insert(schema.supplier).values({ name: "Sneaky", businessId: 2 }))).rejects.toThrow();
    const [ben] = await asTwo((tx) => tx.insert(schema.employee).values({ displayName: "Ben" }).returning());
    const moved = await asOne((tx) =>
      tx.update(schema.employee).set({ displayName: "Changed" }).where(eq(schema.employee.id, ben.id)).returning(),
    );
    expect(moved).toEqual([]);
    const removed = await asOne((tx) => tx.delete(schema.employee).where(eq(schema.employee.id, ben.id)).returning());
    expect(removed).toEqual([]);
    expect((await asTwo(listEmployees)).map((e) => e.displayName)).toEqual(["Ben"]);
  });

  it("can't link a row to another business's row", async () => {
    const [ben] = await asTwo((tx) => tx.insert(schema.employee).values({ displayName: "Ben" }).returning());
    await expect(
      asOne((tx) =>
        tx.insert(schema.shift).values({ employeeId: ben.id, weekStart: "2026-11-09", startsAt: now, endsAt: new Date(now.getTime() + 3_600_000) }),
      ),
    ).rejects.toThrow();
  });

  it("settings changes stay in their own business", async () => {
    const two = await asTwo(getBusiness);
    await asOne((tx) => updateBusinessSettings(tx, { name: "Alabaster", missingClockOutHours: 10, kioskAutoReturnSeconds: 10, countWeekday: 1 }));
    expect(await asTwo(getBusiness)).toEqual(two);
    await expect(asOne((tx) => tx.update(schema.business).set({ name: "Hijacked" }).where(eq(schema.business.id, 2)).returning())).resolves.toEqual([]);
  });

  it("a store iPad belongs to the business that set it up", async () => {
    const { token } = await asTwo((tx) => enrollKiosk(tx, "Cafe iPad"));
    expect((await kioskByToken(db, token, now))?.businessId).toBe(2);
    expect(await asOne(listKiosks)).toEqual([]);
  });

  it("with no business chosen, the app role sees nothing", async () => {
    await asOne((tx) => addEmployee(tx, { displayName: "Ava", email: "ava@example.com" }));
    const seen = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role tenant_app`);
      return tx.select().from(schema.employee);
    });
    expect(seen).toEqual([]);
  });

  it("the app role can't touch platform tables at all", async () => {
    await db.insert(schema.businessInvite).values({ email: "x@example.com", tokenDigest: "d", createdBy: "me", expiresAt: now });
    await expect(asOne((tx) => tx.select().from(schema.businessInvite))).rejects.toThrow();
  });

  it("every business table has row-level security on", async () => {
    const result = await db.execute(
      sql`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    const rows = (result as unknown as { rows: { relname: string; relrowsecurity: boolean }[] }).rows;
    const secured = new Set(rows.filter((r) => r.relrowsecurity).map((r) => r.relname));
    const tables = rows.map((r) => r.relname).filter((name) => name !== "business");
    expect(tables.length).toBeGreaterThan(10);
    expect(tables.filter((name) => !secured.has(name))).toEqual([]);
    expect(secured.has("business")).toBe(true);
    expect([...schema.businessTables, ...schema.platformTables].sort()).toEqual([...tables].sort());
  });
});
