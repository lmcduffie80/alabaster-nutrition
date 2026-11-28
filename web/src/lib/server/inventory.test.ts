// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { openBusinessDatabase } from "@/test/businesses";
import { UserError } from "./errors";
import {
  addItem,
  addSpot,
  addSupplier,
  cancelCount,
  addItemToCount,
  enterCountLine,
  enterCountLines,
  finishCount,
  getCount,
  inventorySummary,
  listCounts,
  listItems,
  listSpots,
  moveSpot,
  removeSpot,
  reorderList,
  setCountLineNoOrder,
  setItemActive,
  startOrContinueCount,
  stockRows,
  recordDelivery,
  updateDelivery,
  deleteDelivery,
  getDelivery,
  listDeliveries,
  createItemsFromReceipt,
  type DeliveryInput,
  type ReceiptItemInput,
  type ItemInput,
} from "./inventory";
import { schema } from "@/db";
import { orderCost } from "@/app/manage/inventory/reorder/reorder-editor";
import { addEmployee } from "./team";

let db: Db;
let backRoom: string;
let fridge: string;
let ava: string;
let jordan: string;
const sunday = new Date("2026-11-15T15:00:00Z");

beforeEach(async () => {
  db = await openBusinessDatabase(sunday);
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

  it("saves a manager's sheet without overwriting lines counted on the iPad meanwhile", async () => {
    const vanilla = await addItem(db, item());
    const berry = await addItem(db, item({ name: "Berry tea", spotId: fridge }));
    const countId = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    await enterCountLine(db, { countId, itemId: berry, quantity: 2, employeeId: jordan, now: sunday });

    const saved = await enterCountLines(db, {
      countId,
      lines: [
        { itemId: vanilla, quantity: "3.5", previous: "" },
        { itemId: berry, quantity: "", previous: "" },
      ],
      employeeId: ava,
      now: sunday,
    });
    expect(saved).toBe(1);
    const view = await getCount(db, countId);
    expect(view?.lines.map((l) => [l.name, l.quantity, l.enteredBy])).toEqual([
      ["Vanilla protein", 3.5, "Ava"],
      ["Berry tea", 2, "Jordan"],
    ]);

    await rejects(
      enterCountLines(db, { countId, lines: [{ itemId: vanilla, quantity: "lots", previous: "3.5" }], employeeId: ava, now: sunday }),
      /isn't a number/,
    );
    expect((await getCount(db, countId))?.lines[0].quantity).toBe(3.5);
  });

  it("adds an item that wasn't on the list, matching what's on file first", async () => {
    const herb = await addSupplier(db, { name: "Herbal Co", contact: "", notes: "" });
    await addItem(db, item({ supplierId: herb, supplierCode: "V-100" }));
    const berry = await addItem(db, item({ name: "Berry tea", spotId: fridge }));
    await setItemActive(db, berry, false);
    const countId = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    const add = (fields: { code?: string; name?: string; quantity?: string }) =>
      addItemToCount(db, { countId, code: "", name: "", unit: "", quantity: "2", employeeId: ava, now: sunday, ...fields });

    await rejects(add({ code: "v-100" }), /Vanilla protein is already on this count/);
    expect(await add({ name: "berry TEA", quantity: "3" })).toEqual({ name: "Berry tea", added: false });
    await rejects(add({ code: "NEW-1" }), /Add a description/);
    await rejects(add({ name: "Mango tea", quantity: "" }), /how many/);
    expect(await add({ code: "NEW-1", name: "Mango  tea", quantity: "4" })).toEqual({ name: "Mango tea", added: true });

    const view = await getCount(db, countId);
    expect(view?.lines.map((l) => [l.name, l.quantity, l.enteredBy]).sort()).toEqual([
      ["Berry tea", 3, "Ava"],
      ["Mango tea", 4, "Ava"],
      ["Vanilla protein", null, null],
    ]);
    const mango = (await listItems(db)).find((i) => i.name === "Mango tea");
    expect(mango).toMatchObject({ supplierId: herb, supplierCode: "NEW-1", unit: "each", reorderAt: 1, orderUpTo: 4, active: true });
    expect((await listItems(db)).find((i) => i.id === berry)?.active).toBe(true);
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
    const a = await addItem(db, item({ supplierId: sysco, supplierCode: "VP-1", defaultUnitCost: "18.5" }));
    const b = await addItem(db, item({ name: "Lids", supplierId: herb }));
    const c = await addItem(db, item({ name: "Straws" }));
    const countId = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    for (const [itemId, quantity] of [[a, 2.5], [b, 1], [c, 0]] as const) {
      await enterCountLine(db, { countId, itemId, quantity, employeeId: ava, now: sunday });
    }
    await finishCount(db, { countId, employeeId: ava, now: sunday });

    const groups = await reorderList(db);
    expect(groups.map((g) => [g.supplierName, g.lines.map((l) => [l.name, l.amount, l.supplierCode, l.unitCost])])).toEqual([
      ["Herbal Co", [["Lids", 9, null, null]]],
      ["Sysco", [["Vanilla protein", 8, "VP-1", 18.5]]],
      ["No supplier", [["Straws", 10, null, null]]],
    ]);
    const lines = groups.flatMap((g) => g.lines);
    expect(orderCost(lines, {})).toEqual({ total: 148, unpriced: 2 });
    expect(orderCost(lines, { [a]: 2, [b]: 0 })).toEqual({ total: 37, unpriced: 1 });
  });

  it("leaves items marked no order needed off the reorder list until the next count", async () => {
    const a = await addItem(db, item());
    const b = await addItem(db, item({ name: "Lids" }));
    const first = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    await enterCountLine(db, { countId: first, itemId: a, quantity: 0, employeeId: ava, now: sunday });
    await enterCountLine(db, { countId: first, itemId: b, quantity: 0, employeeId: ava, now: sunday });
    await setCountLineNoOrder(db, { countId: first, itemId: b, noOrder: true });
    await finishCount(db, { countId: first, employeeId: ava, now: sunday });

    expect((await getCount(db, first))?.lines.map((l) => [l.name, l.noOrder])).toEqual([["Lids", true], ["Vanilla protein", false]]);
    expect((await reorderList(db)).flatMap((g) => g.lines.map((l) => l.name))).toEqual(["Vanilla protein"]);
    expect((await stockRows(db)).find((r) => r.id === b)).toMatchObject({ onHand: 0, noOrder: true, low: false });

    const later = new Date(sunday.getTime() + 7 * 86_400_000);
    const second = await startOrContinueCount(db, { employeeId: ava, now: later });
    await enterCountLine(db, { countId: second, itemId: b, quantity: 0, employeeId: ava, now: later });
    await finishCount(db, { countId: second, employeeId: ava, now: later });
    expect((await reorderList(db)).flatMap((g) => g.lines.map((l) => l.name)).sort()).toEqual(["Lids", "Vanilla protein"]);
    await expect(setCountLineNoOrder(db, { countId: second, itemId: b, noOrder: true })).rejects.toThrow(/no longer open/);
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

  it("counts everything delivered for a never-counted item, and leaves it unknown until something arrives", async () => {
    const sysco = await addSupplier(db, { name: "Sysco", contact: "", notes: "" });
    const itemId = await addItem(db, item());
    expect(await stockOf(itemId)).toMatchObject({ onHand: null, low: false, value: null });
    await recordDelivery(db, input(sysco, itemId), who);
    await recordDelivery(db, input(sysco, itemId, { receivedOn: "2026-11-10" }), who);
    expect(await stockOf(itemId)).toMatchObject({ onHand: 8, low: false, unitCost: 21, value: 168 });
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

  it("adds new products on a delivery as items with the invoice's SKU", async () => {
    const herbalife = await addSupplier(db, { name: "Herbalife", contact: "", notes: "" });
    const { itemId } = await countedItem(2);
    const id = await recordDelivery(
      db,
      input(herbalife, itemId, {
        lines: [
          { itemId, quantity: "1", lineTotal: "" },
          { itemId: "", quantity: "3", lineTotal: "28.98", invoiceCode: "179M", invoiceDescription: "DRINK MIX BLUEBERRY 4.4OZ", newItem: { name: "DRINK MIX BLUEBERRY 4.4OZ", unit: "" } },
        ],
      }),
      who,
    );
    const added = (await listItems(db)).find((i) => i.supplierCode === "179M")!;
    expect(added).toMatchObject({
      name: "DRINK MIX BLUEBERRY 4.4OZ",
      unit: "each",
      supplierId: herbalife,
      spotId: backRoom,
      startingQuantity: 3,
      startingOn: "2026-11-16",
      reorderAt: 1,
      orderUpTo: 3,
    });
    expect((await getDelivery(db, id))!.lines.map((l) => l.name).sort()).toEqual(["DRINK MIX BLUEBERRY 4.4OZ", "Vanilla protein"]);
    expect(await stockOf(added.id)).toMatchObject({ onHand: 3 });

    const newLine = { itemId: "", quantity: "1", lineTotal: "", newItem: { name: "Again", unit: "tub" } };
    await rejects(updateDelivery(db, id, input(herbalife, itemId, { lines: [newLine] }), { ...who, reason: "x" }), /Choose an item/);
    await rejects(recordDelivery(db, input(herbalife, itemId, { lines: [{ ...newLine, newItem: { name: " ", unit: "" } }] }), who), /name/);
    expect((await listItems(db)).length).toBe(2);
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

describe("items from a receipt", () => {
  const who = { actor: "owner@example.com", now: new Date("2026-11-17T15:00:00Z") };
  const newLine = (name: string, overrides: Partial<ReceiptItemInput> = {}): ReceiptItemInput => ({
    item: { name, type: "ingredient", unit: "bag", spotId: fridge, packSize: "1", reorderAt: "", orderUpTo: "", defaultUnitCost: "" },
    invoiceCode: "",
    invoiceDescription: name.toUpperCase(),
    received: "6",
    onHand: "6",
    lineTotal: "30",
    ...overrides,
  });
  const stockOf = async (itemId: string) => (await stockRows(db)).find((r) => r.id === itemId)!;

  it("creates each item with its code and starting stock, and saves the receipt as one delivery", async () => {
    const costco = await addSupplier(db, { name: "Costco", contact: "", notes: "" });
    const cups = await addItem(db, item({ name: "Cups", unit: "sleeve", supplierId: costco }));
    const countId = await startOrContinueCount(db, { employeeId: ava, now: sunday });
    await enterCountLine(db, { countId, itemId: cups, quantity: 2, employeeId: ava, now: sunday });
    await finishCount(db, { countId, employeeId: ava, now: sunday });

    const { deliveryId, itemIds } = await createItemsFromReceipt(
      db,
      {
        delivery: { supplierId: costco, invoiceNumber: "R-77", invoiceTotal: "", receivedOn: "2026-11-16" },
        existing: [{ itemId: cups, quantity: "3", lineTotal: "12", invoiceCode: "", invoiceDescription: "CUPS" }],
        created: [newLine("Frozen mango", { invoiceCode: "00451", onHand: "8" }), newLine("Chia seeds", { received: "" })],
      },
      who,
    );
    const [mango, chia] = itemIds;

    expect(await stockOf(mango)).toMatchObject({ supplierCode: "00451", supplierId: costco, onHand: 8, unitCost: 5, reorderAt: null, low: false });
    expect(await stockOf(chia)).toMatchObject({ onHand: 6, startingOn: "2026-11-16" });
    expect(await stockOf(cups)).toMatchObject({ onHand: 5 });
    const saved = await getDelivery(db, deliveryId!);
    expect(saved?.invoiceNumber).toBe("R-77");
    expect(saved?.lines.map((l) => l.itemId).sort()).toEqual([cups, mango].sort());

    await recordDelivery(db, { supplierId: costco, invoiceNumber: "", invoiceTotal: "", receivedOn: "2026-11-17", onShelfForCount: false, lines: [{ itemId: mango, quantity: "2", lineTotal: "" }] }, who);
    expect((await stockOf(mango)).onHand).toBe(10);
  });

  it("saves nothing when any line has a problem", async () => {
    const costco = await addSupplier(db, { name: "Costco", contact: "", notes: "" });
    await addItem(db, item({ name: "Mango", supplierId: costco, supplierCode: "00451" }));
    const before = (await listItems(db)).length;
    const attempt = (created: ReceiptItemInput[]) =>
      createItemsFromReceipt(db, { delivery: { supplierId: costco, invoiceNumber: "", invoiceTotal: "", receivedOn: "2026-11-16" }, existing: [], created }, who);

    await rejects(attempt([newLine("Chia seeds"), newLine("Strawberries", { invoiceCode: "00451" })]), /Strawberries: .*item code/);
    await rejects(attempt([newLine("Chia seeds", { onHand: "" })]), /Chia seeds: enter how many are on hand/);
    await rejects(attempt([newLine("Chia seeds", { item: { ...newLine("x").item, name: "Chia seeds", reorderAt: "2" } })]), /both/);
    await rejects(attempt([]), /at least one line/);
    expect((await listItems(db)).length).toBe(before);
    expect(await listDeliveries(db)).toEqual([]);
  });
});
