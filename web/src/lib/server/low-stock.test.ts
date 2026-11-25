// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema, type Db } from "@/db";
import { openBusinessDatabase } from "@/test/businesses";

const sent = vi.hoisted(() => ({
  emails: [] as { to: string; subject: string; text: string; html: string }[],
  pushes: [] as { tokens: string[]; title: string; body: string; path: string }[],
  later: [] as (() => Promise<void>)[],
}));
vi.mock("next/server", () => ({ after: (work: () => Promise<void>) => void sent.later.push(work) }));
vi.mock("./email", async (original) => ({
  ...(await original<typeof import("./email")>()),
  sendEmail: async (email: (typeof sent.emails)[number]) => (sent.emails.push(email), true),
}));
vi.mock("./push", async (original) => ({
  ...(await original<typeof import("./push")>()),
  sendPush: async (tokens: string[], message: { title: string; body: string; path: string }) => {
    if (tokens.length) sent.pushes.push({ tokens, ...message });
    return { invalid: [] };
  },
}));

const { addItem, addSpot, enterCountLine, finishCount, startOrContinueCount } = await import("./inventory");
const { addEmployee } = await import("./team");
const { registerDevice } = await import("./push-devices");
const { alertLowStock, lowStockPush } = await import("./low-stock");

let db: Db;
let spot: string;
let ava: string;
const now = new Date("2026-11-15T15:00:00Z");
const token = "ab".repeat(32);
const item = (name: string) => ({
  name,
  type: "ingredient",
  unit: "each",
  spotId: spot,
  supplierId: "",
  supplierCode: "",
  packSize: "",
  reorderAt: "1",
  orderUpTo: "6",
  defaultUnitCost: "",
});

async function count(quantities: [string, number][]) {
  const countId = await startOrContinueCount(db, { employeeId: ava, now });
  for (const [itemId, quantity] of quantities) await enterCountLine(db, { countId, itemId, quantity, employeeId: ava, now });
  await finishCount(db, { countId, employeeId: ava, now });
  await alertLowStock(db, { employeeId: ava, origin: "https://app.example.com" });
  await Promise.all(sent.later.map((work) => work()));
}

beforeEach(async () => {
  sent.emails = [];
  sent.pushes = [];
  sent.later = [];
  db = await openBusinessDatabase(now);
  spot = await addSpot(db, "Shelf");
  ava = await addEmployee(db, { displayName: "Ava", email: "" });
  const boss = await addEmployee(db, { displayName: "Lee McDuffie", email: "lee@example.com" });
  await db.update(schema.employee).set({ role: "manager" }).where(eq(schema.employee.id, boss));
  await registerDevice(db, boss, token);
});

describe("low-stock alerts", () => {
  it("tells managers by phone and email what a finished count left at or below its reorder level", async () => {
    const mango = await addItem(db, item("Mango tea"));
    const berry = await addItem(db, item("Berry tea"));
    const vanilla = await addItem(db, item("Vanilla protein"));
    await count([
      [mango, 1],
      [berry, 0],
      [vanilla, 4],
    ]);

    expect(sent.pushes).toEqual([
      { tokens: [token], title: expect.stringMatching(/^2 items to reorder · /), body: "Berry tea (0 each)\nMango tea (1 each)", path: "/manage/inventory/reorder" },
    ]);
    expect(sent.emails.map((e) => e.to)).toEqual(["lee@example.com"]);
    expect(sent.emails[0].text).toContain("Hi Lee,");
    expect(sent.emails[0].text).toContain("Ava just finished the inventory count");
    expect(sent.emails[0].text).toContain("- Berry tea: 0 each on hand, order 6");
    expect(sent.emails[0].text).toContain("- Mango tea: 1 each on hand, order 5");
    expect(sent.emails[0].html).toContain('href="https://app.example.com/manage/inventory/reorder"');
  });

  it("stays quiet when nothing is low", async () => {
    const vanilla = await addItem(db, item("Vanilla protein"));
    await count([[vanilla, 4]]);
    expect(sent.later).toEqual([]);
    expect(sent.emails).toEqual([]);
  });

  it("keeps long pushes short", () => {
    const items = ["A", "B", "C", "D", "E"].map((name) => ({ name, unit: "each", onHand: 0, order: 2, supplierCode: null }));
    expect(lowStockPush("Shop", items)).toMatchObject({ title: "5 items to reorder · Shop", body: "A (0 each)\nB (0 each)\nC (0 each)\n+2 more" });
  });
});
