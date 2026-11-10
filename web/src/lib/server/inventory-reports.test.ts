// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { openLocalDatabase } from "@/db/local";
import { getBusiness } from "./business";
import { UserError } from "./errors";
import {
  addItem,
  addSpot,
  addSupplier,
  countFixes,
  enterCountLine,
  finishCount,
  fixCountLine,
  recordDelivery,
  startOrContinueCount,
  stockRows,
} from "./inventory";
import { spendingCsv, spendingReport, stockCsv, usageCsv, usageReport } from "./inventory-reports";
import { addEmployee } from "./team";

let db: Db;
let ava: string;
let sysco: string;
let vanilla: string;
let lids: string;
const sunday = new Date("2026-11-15T15:00:00Z");
const nextSunday = new Date("2026-11-22T15:00:00Z");
const owner = "owner@example.com";

beforeEach(async () => {
  db = await openLocalDatabase();
  await getBusiness(db, sunday);
  const spot = await addSpot(db, "Back room");
  ava = await addEmployee(db, { displayName: "Ava", email: "" });
  sysco = await addSupplier(db, { name: "Sysco", contact: "", notes: "" });
  const base = { unit: "tub", spotId: spot, supplierCode: "", packSize: "", reorderAt: "1", orderUpTo: "5" };
  vanilla = await addItem(db, { ...base, name: "Vanilla protein", type: "ingredient", supplierId: sysco, defaultUnitCost: "18" });
  lids = await addItem(db, { ...base, name: "Lids", type: "supply", unit: "sleeve", supplierId: "", defaultUnitCost: "" });
});

async function rejects(work: Promise<unknown>, message: RegExp) {
  await expect(work).rejects.toThrow(UserError);
  await expect(work).rejects.toThrow(message);
}

async function count(now: Date, quantities: [string, number][]) {
  const countId = await startOrContinueCount(db, { employeeId: ava, now });
  for (const [itemId, quantity] of quantities) await enterCountLine(db, { countId, itemId, quantity, employeeId: ava, now });
  await finishCount(db, { countId, employeeId: ava, now });
  return countId;
}

function deliver(receivedOn: string, quantity: string, lineTotal: string, supplierId = sysco) {
  return recordDelivery(
    db,
    { supplierId, invoiceNumber: "", invoiceTotal: "", receivedOn, onShelfForCount: false, lines: [{ itemId: vanilla, quantity, lineTotal }] },
    { actor: owner, now: nextSunday },
  );
}

describe("fixing a finished count", () => {
  it("changes on hand and keeps who, why and what it was", async () => {
    const countId = await count(sunday, [[vanilla, 8], [lids, 2]]);
    await fixCountLine(db, { countId, itemId: vanilla, quantity: "6", reason: "Miscounted", actor: owner, now: nextSunday });
    await fixCountLine(db, { countId, itemId: lids, quantity: "", reason: "Didn't check the top shelf", actor: owner, now: nextSunday });
    await fixCountLine(db, { countId, itemId: lids, quantity: "", reason: "No change", actor: owner, now: nextSunday });

    const stock = await stockRows(db);
    expect(stock.find((r) => r.id === vanilla)?.onHand).toBe(6);
    expect(stock.find((r) => r.id === lids)?.onHand).toBeNull();
    expect((await countFixes(db, countId)).map((f) => [f.itemId, f.before, f.after, f.reason, f.actor])).toEqual([
      [vanilla, 8, 6, "Miscounted", owner],
      [lids, 2, null, "Didn't check the top shelf", owner],
    ]);
  });

  it("refuses open counts, bad numbers and a missing reason", async () => {
    const countId = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    const fix = (quantity: string, reason = "Typo") => fixCountLine(db, { countId, itemId: vanilla, quantity, reason, actor: owner, now: sunday });
    await rejects(fix("3"), /Only finished counts/);
    await enterCountLine(db, { countId, itemId: vanilla, quantity: 1, employeeId: ava, now: sunday });
    await finishCount(db, { countId, employeeId: ava, now: sunday });
    await rejects(fix("-1"), /Enter a number/);
    await rejects(fix("3", " "), /reason/);
  });
});

describe("usage report", () => {
  it("works out usage between counts, priced at the latest cost", async () => {
    expect((await usageReport(db)).period).toBeNull();
    await count(sunday, [[vanilla, 8], [lids, 5]]);
    await deliver("2026-11-17", "4", "84");
    const week2 = await count(nextSunday, [[vanilla, 9]]);

    const report = await usageReport(db);
    expect(report.period).toEqual({ toCountId: week2, from: "2026-11-15", to: "2026-11-22" });
    expect(report.lines.map((l) => [l.name, l.start, l.received, l.end, l.used, l.cost, l.flag])).toEqual([
      ["Lids", 5, 0, null, null, null, null],
      ["Vanilla protein", 8, 4, 9, 3, 63, null],
    ]);
    expect(report.costByType).toEqual({ ingredient: 63, supply: 0 });
    expect(usageCsv(report).split("\r\n")[2]).toBe("Vanilla protein,Ingredient,tub,8,4,9,3,63,");

    await fixCountLine(db, { countId: week2, itemId: vanilla, quantity: "13", reason: "Found a case", actor: owner, now: nextSunday });
    const fixed = await usageReport(db, week2);
    expect(fixed.lines.find((l) => l.itemId === vanilla)).toMatchObject({ used: -1, flag: "mismatch" });
    expect(fixed.costByType.ingredient).toBe(0);
  });
});

describe("spending and stock", () => {
  it("totals deliveries by week and month, newest first", async () => {
    const herb = await addSupplier(db, { name: "Herbal Co", contact: "", notes: "" });
    await deliver("2026-11-10", "1", "20");
    await deliver("2026-11-16", "2", "40");
    await deliver("2026-11-17", "1", "21.5");
    await deliver("2026-11-18", "1", "10", herb);
    await deliver("2026-10-30", "1", "5");

    const weeks = await spendingReport(db, "week", nextSunday);
    expect(weeks.map((b) => [b.start, b.total, b.suppliers.map((s) => [s.name, s.deliveries, s.total])])).toEqual([
      ["2026-11-16", 71.5, [["Sysco", 2, 61.5], ["Herbal Co", 1, 10]]],
      ["2026-11-09", 20, [["Sysco", 1, 20]]],
      ["2026-10-26", 5, [["Sysco", 1, 5]]],
    ]);
    const months = await spendingReport(db, "month", nextSunday);
    expect(months.map((b) => [b.start, b.total])).toEqual([
      ["2026-11-01", 91.5],
      ["2026-10-01", 5],
    ]);
    expect(spendingCsv(months, "month").split("\r\n").slice(0, 2)).toEqual(["Month,Supplier,Deliveries,Total", "2026-11,Sysco,3,81.5"]);
  });

  it("exports stock with value", async () => {
    await count(sunday, [[vanilla, 2]]);
    expect((await stockCsv(db)).split("\r\n").slice(1, 3)).toEqual([
      "Lids,Supply,Back room,,Not counted,sleeve,,,",
      "Vanilla protein,Ingredient,Back room,Sysco,2,tub,18,36,",
    ]);
  });
});
