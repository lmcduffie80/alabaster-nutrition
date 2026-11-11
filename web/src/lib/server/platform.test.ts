import { beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "@/db";
import { openLocalDatabase } from "@/db/local";
import { withBusiness } from "@/db/tenant";
import { businessUsage, usageTotals } from "./platform";
import { createBusiness } from "./system";

let db: Db;
const now = new Date("2026-11-11T15:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

beforeEach(async () => {
  db = await openLocalDatabase();
  await createBusiness(db, { id: 1, name: "Alabaster Nutrition", now: daysAgo(30) });
  await createBusiness(db, { id: 2, name: "Demo Cafe", now: daysAgo(1) });
});

describe("business usage", () => {
  it("counts each business's team, kiosks and recent punches, ignoring voided and old ones", async () => {
    await withBusiness(db, 1, async (tx) => {
      const [lee, ava] = await tx
        .insert(schema.employee)
        .values([
          { displayName: "Lee", email: "lee@example.com", role: "manager" },
          { displayName: "Ava", email: null },
          { displayName: "Old", email: "old@example.com", active: false },
        ])
        .returning({ id: schema.employee.id });
      await tx.insert(schema.kioskDevice).values([
        { label: "Store iPad", tokenDigest: "a" },
        { label: "Old iPad", tokenDigest: "b", revokedAt: daysAgo(3) },
      ]);
      await tx.insert(schema.punch).values([
        { employeeId: ava.id, kind: "clockIn", at: daysAgo(2), source: "kiosk" },
        { employeeId: ava.id, kind: "clockOut", at: daysAgo(1.8), source: "kiosk" },
        { employeeId: lee.id, kind: "clockIn", at: daysAgo(1), source: "kiosk", voided: true },
        { employeeId: lee.id, kind: "clockIn", at: daysAgo(20), source: "kiosk" },
      ]);
    });

    const usage = await businessUsage(db, now);
    expect(usage.map((b) => b.name)).toEqual(["Alabaster Nutrition", "Demo Cafe"]);
    expect(usage[0]).toMatchObject({ team: 2, withEmail: 1, managers: 1, kiosks: 1, recentPunches: 2 });
    expect(usage[0].lastPunchAt).toEqual(daysAgo(1.8));
    expect(usage[1]).toMatchObject({ team: 0, recentPunches: 0, lastPunchAt: null });
    expect(usageTotals(usage)).toEqual({ businesses: 2, activeBusinesses: 1, team: 2, withEmail: 1, recentPunches: 2 });
  });
});
