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
  cancelCount,
  enterCountLine,
  finishCount,
  getCount,
  inventorySummary,
  listCounts,
  listItems,
  listSpots,
  moveSpot,
  removeSpot,
  reorderList,
  setItemActive,
  startOrContinueCount,
  stockRows,
  recordDelivery,
  updateDelivery,
  deleteDelivery,
  getDelivery,
  listDeliveries,
  type DeliveryInput,
  type ItemInput,
} from "./inventory";
import { schema } from "@/db";
import { addEmployee } from "./team";

let db: Db;
let backRoom: string;
let fridge: string;
let ava: string;
let jordan: string;
const sunday = new Date("2026-11-15T15:00:00Z");

beforeEach(async () => {
  db = await openLocalDatabase();
  await getBusiness(db, sunday);
  backRoom = await addSpot(db, "Back room");
  fridge = await addSpot(db, "Fridge");
  ava = await addEmployee(db, { displayName: "Ava", email: "" });
  jordan = await addEmployee(db, { displayName: "Jordan", email: "" });
});

async function rejects(work: Promise<unknown>, message: RegExp) {
  await expect(work).rejects.toThrow(UserError);
  await expect(work).rejects.toThrow(message);
}

function item(overrides: Partial<ItemInput> = {}): ItemInput {
  return {
    name: "Vanilla protein",
    type: "ingredient",
    unit: "tub",
    spotId: backRoom,
    supplierId: "",
    supplierCode: "",
    packSize: "",
    reorderAt: "3",
    orderUpTo: "10",
    defaultUnitCost: "",
    ...overrides,
  };
}

describe("setup", () => {
  it("keeps spots in walking order and refuses to remove one in use", async () => {
    await moveSpot(db, fridge, "up");
    expect((await listSpots(db)).map((s) => s.name)).toEqual(["Fridge", "Back room"]);
    await addItem(db, item({ spotId: fridge }));
    await rejects(removeSpot(db, fridge), /Move this spot's items/);
    await removeSpot(db, backRoom);
    expect((await listSpots(db)).map((s) => s.name)).toEqual(["Fridge"]);
  });

  it("refuses duplicate names ignoring case, and bad levels", async () => {
    await addItem(db, item());
    await rejects(addItem(db, item({ name: "VANILLA PROTEIN" })), /already has that name/);
    await rejects(addSpot(db, "fridge"), /already a spot/);
    await rejects(addItem(db, item({ name: "Cups", reorderAt: "10", orderUpTo: "10" })), /must be more than/);
    await rejects(addItem(db, item({ name: "Cups", reorderAt: "-1" })), /enter a number/);
    await rejects(addItem(db, item({ name: "Cups", supplierCode: "C-1" })), /supplier this item code/);
  });

  it("stores halves and the pack size", async () => {
    const supplierId = await addSupplier(db, { name: "Sysco", contact: "555-0100", notes: "" });
    await addItem(db, item({ name: "Cups 16oz", type: "supply", unit: "sleeve", supplierId, supplierCode: "C16", packSize: "20", reorderAt: "2.5" }));
    const [cups] = (await listItems(db)).filter((i) => i.name === "Cups 16oz");
    expect(cups).toMatchObject({ packSize: 20, reorderAt: 2.5, supplierName: "Sysco", spotName: "Back room" });
  });
});

describe("counting", () => {
  it("shares one open count between employees and records who entered each line", async () => {
    const vanilla = await addItem(db, item());
    const berry = await addItem(db, item({ name: "Berry tea", spotId: fridge }));

    const first = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    const second = await startOrContinueCount(db, { employeeId: jordan, now: sunday });
    expect(second).toBe(first);

    await enterCountLine(db, { countId: first, itemId: vanilla, quantity: 4.5, employeeId: ava, now: sunday });
    await enterCountLine(db, { countId: first, itemId: berry, quantity: 2, employeeId: jordan, now: sunday });
    const view = await getCount(db, first);
    expect(view?.lines.map((l) => [l.name, l.quantity, l.enteredBy])).toEqual([
      ["Vanilla protein", 4.5, "Ava"],
      ["Berry tea", 2, "Jordan"],
    ]);
    expect(view).toMatchObject({ counted: 2, total: 2, status: "open", startedBy: "Ava" });
  });

  it("reports skipped items, then locks the count", async () => {
    const vanilla = await addItem(db, item());
    await addItem(db, item({ name: "Berry tea" }));
    const countId = await startOrContinueCount(db, { employeeId: ava, now: sunday });

    await rejects(finishCount(db, { countId, employeeId: ava, now: sunday }), /at least one item/);
    await enterCountLine(db, { countId, itemId: vanilla, quantity: 4, employeeId: ava, now: sunday });
    expect(await finishCount(db, { countId, employeeId: ava, now: sunday })).toEqual({ skipped: 1 });

    await rejects(enterCountLine(db, { countId, itemId: vanilla, quantity: 1, employeeId: ava, now: sunday }), /no longer open/);
    expect((await listCounts(db))[0]).toMatchObject({ status: "finished", counted: 1, total: 2, finishedBy: "Ava" });
  });

  it("starts fresh after a cancel, and only lists items active at the start", async () => {
    await addItem(db, item());
    const first = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    await addItem(db, item({ name: "Late addition" }));
    expect((await getCount(db, first))?.total).toBe(1);

    await cancelCount(db, first, sunday);
    const second = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    expect(second).not.toBe(first);
    expect((await getCount(db, second))?.total).toBe(2);
  });

  it("drops a deactivated item from the open count unless it was counted", async () => {
    const counted = await addItem(db, item());
    const blank = await addItem(db, item({ name: "Berry tea" }));
    const countId = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    await enterCountLine(db, { countId, itemId: counted, quantity: 1, employeeId: ava, now: sunday });
    await setItemActive(db, counted, false);
    await setItemActive(db, blank, false);
    expect((await getCount(db, countId))?.lines.map((l) => l.name)).toEqual(["Vanilla protein"]);
  });

  it("refuses to start when there's nothing to count", async () => {
    await rejects(startOrContinueCount(db, { employeeId: ava, now: sunday }), /no items to count/);
  });
});

describe("stock and reorder", () => {
  it("uses the latest finished count, keeping old numbers for skipped items", async () => {
    const vanilla = await addItem(db, item());
    const berry = await addItem(db, item({ name: "Berry tea", reorderAt: "1", orderUpTo: "6" }));

    const week1 = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    await enterCountLine(db, { countId: week1, itemId: vanilla, quantity: 8, employeeId: ava, now: sunday });
    await enterCountLine(db, { countId: week1, itemId: berry, quantity: 5, employeeId: ava, now: sunday });
    await finishCount(db, { countId: week1, employeeId: ava, now: sunday });

    const nextSunday = new Date("2026-11-22T15:00:00Z");
    const week2 = await startOrContinueCount(db, { employeeId: ava, now: nextSunday });
    expect((await getCount(db, week2))?.lines.map((l) => l.lastCounted)).toEqual([5, 8]);
    await enterCountLine(db, { countId: week2, itemId: vanilla, quantity: 2.5, employeeId: ava, now: nextSunday });
    await finishCount(db, { countId: week2, employeeId: ava, now: nextSunday });

    const stock = await stockRows(db);
    expect(stock.map((s) => [s.name, s.onHand, s.low])).toEqual([
      ["Berry tea", 5, false],
      ["Vanilla protein", 2.5, true],
    ]);
  });

  it("groups low items by supplier with whole-unit amounts", async () => {
    const sysco = await addSupplier(db, { name: "Sysco", contact: "555-0100", notes: "" });
    const herb = await addSupplier(db, { name: "Herbal Co", contact: "", notes: "" });
    const a = await addItem(db, item({ supplierId: sysco, supplierCode: "VP-1" }));
    const b = await addItem(db, item({ name: "Lids", supplierId: herb }));
    const c = await addItem(db, item({ name: "Straws" }));
    const countId = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    for (const [itemId, quantity] of [[a, 2.5], [b, 1], [c, 0]] as const) {
      await enterCountLine(db, { countId, itemId, quantity, employeeId: ava, now: sunday });
    }
    await finishCount(db, { countId, employeeId: ava, now: sunday });

    const groups = await reorderList(db);
    expect(groups.map((g) => [g.supplierName, g.lines.map((l) => [l.name, l.amount, l.supplierCode])])).toEqual([
      ["Herbal Co", [["Lids", 9, null]]],
      ["Sysco", [["Vanilla protein", 8, "VP-1"]]],
      ["No supplier", [["Straws", 10, null]]],
    ]);
  });

  it("knows when the weekly count is due", async () => {
    expect((await inventorySummary(db, sunday)).countDue).toBe(false);
    const vanilla = await addItem(db, item());
    expect(await inventorySummary(db, sunday)).toMatchObject({ countDue: true, lowCount: 0, openCount: null, itemCount: 1 });

    const countId = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    await enterCountLine(db, { countId, itemId: vanilla, quantity: 1, employeeId: ava, now: sunday });
    expect((await inventorySummary(db, sunday)).openCount).toMatchObject({ counted: 1, total: 1 });
    await finishCount(db, { countId, employeeId: ava, now: sunday });
    expect(await inventorySummary(db, sunday)).toMatchObject({ countDue: false, lowCount: 1, openCount: null });
  });
});

describe("deliveries", () => {
  // Counted Sunday Nov 15 (10am in New York).
  async function countedItem(quantity: number) {
    const sysco = await addSupplier(db, { name: "Sysco", contact: "", notes: "" });
    const itemId = await addItem(db, item({ supplierId: sysco, defaultUnitCost: "18" }));
    const countId = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    await enterCountLine(db, { countId, itemId, quantity, employeeId: ava, now: sunday });
    await finishCount(db, { countId, employeeId: ava, now: sunday });
    return { sysco, itemId };
  }
  const who = { actor: "owner@example.com", now: new Date("2026-11-17T15:00:00Z") };
  const input = (supplierId: string, itemId: string, overrides: Partial<DeliveryInput> = {}): DeliveryInput => ({
    supplierId,
    invoiceNumber: "",
    invoiceTotal: "",
    receivedOn: "2026-11-16",
    onShelfForCount: false,
    lines: [{ itemId, quantity: "4", lineTotal: "84" }],
    ...overrides,
  });
  const stockOf = async (itemId: string) => (await stockRows(db)).find((r) => r.id === itemId)!;

  it("adds to on hand after the count, and prices stock from the latest delivery", async () => {
    const { sysco, itemId } = await countedItem(2);
    expect(await stockOf(itemId)).toMatchObject({ onHand: 2, unitCost: 18, value: 36, low: true });

    await recordDelivery(db, input(sysco, itemId), who);
    expect(await stockOf(itemId)).toMatchObject({ onHand: 6, unitCost: 21, value: 126, low: false });

    // Before the count: already in that count. Same day, on the shelf: also already counted.
    await recordDelivery(db, input(sysco, itemId, { receivedOn: "2026-11-14", lines: [{ itemId, quantity: "5", lineTotal: "" }] }), who);
    await recordDelivery(db, input(sysco, itemId, { receivedOn: "2026-11-15", onShelfForCount: true, lines: [{ itemId, quantity: "5", lineTotal: "" }] }), who);
    expect((await stockOf(itemId)).onHand).toBe(6);
    await recordDelivery(db, input(sysco, itemId, { receivedOn: "2026-11-15", lines: [{ itemId, quantity: "1", lineTotal: "" }] }), who);
    expect((await stockOf(itemId)).onHand).toBe(7);
  });

  it("leaves never-counted items unknown", async () => {
    const sysco = await addSupplier(db, { name: "Sysco", contact: "", notes: "" });
    const itemId = await addItem(db, item());
    await recordDelivery(db, input(sysco, itemId), who);
    expect(await stockOf(itemId)).toMatchObject({ onHand: null, low: false, unitCost: 21, value: null });
  });

  it("checks the form and refuses a repeated invoice number", async () => {
    const { sysco, itemId } = await countedItem(2);
    await rejects(recordDelivery(db, input(sysco, itemId, { lines: [] }), who), /at least one item/);
    await rejects(recordDelivery(db, input(sysco, itemId, { lines: [{ itemId, quantity: "0", lineTotal: "" }] }), who), /quantity/);
    await rejects(recordDelivery(db, input(sysco, itemId, { receivedOn: "2026-11-20" }), who), /future/);
    await rejects(recordDelivery(db, input(sysco, itemId, { invoiceTotal: "abc" }), who), /Invoice total/);
    await recordDelivery(db, input(sysco, itemId, { invoiceNumber: "INV-1" }), who);
    await rejects(recordDelivery(db, input(sysco, itemId, { invoiceNumber: "inv-1" }), who), /already recorded/);
  });

  it("audits edits and deletes, and deleted deliveries stop counting", async () => {
    const { sysco, itemId } = await countedItem(2);
    const id = await recordDelivery(db, input(sysco, itemId), who);
    await rejects(updateDelivery(db, id, input(sysco, itemId), { ...who, reason: " " }), /reason/);
    await updateDelivery(db, id, input(sysco, itemId, { lines: [{ itemId, quantity: "3", lineTotal: "60" }] }), { ...who, reason: "Short one tub" });
    expect(await getDelivery(db, id)).toMatchObject({ supplierName: "Sysco", total: 60, lines: [{ quantity: 3, lineTotal: 60, name: "Vanilla protein" }] });
    expect(await stockOf(itemId)).toMatchObject({ onHand: 5, unitCost: 20 });

    await deleteDelivery(db, id, { ...who, reason: "Entered twice" });
    expect(await getDelivery(db, id)).toBeNull();
    expect(await listDeliveries(db)).toEqual([]);
    expect(await stockOf(itemId)).toMatchObject({ onHand: 2, unitCost: 18 });
    const audit = await db.select().from(schema.inventoryAudit);
    expect(audit.map((a) => [a.action, a.reason])).toEqual([["edit", "Short one tub"], ["delete", "Entered twice"]]);
  });
});
