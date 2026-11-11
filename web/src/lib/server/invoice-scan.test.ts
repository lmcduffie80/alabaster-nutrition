// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { openBusinessDatabase } from "@/test/businesses";
import { addItem, addSpot, addSupplier, listItems, recordDelivery, type ItemInput } from "./inventory";
import type { InvoiceReading } from "./invoice-reader";
import { matchInvoice, sameSupplier } from "./invoice-scan";

let db: Db;
let sysco: string;
let spotId: string;
const today = "2026-11-17";
const now = new Date("2026-11-17T15:00:00Z");

const item = (overrides: Partial<ItemInput>): ItemInput => ({
  name: "Item",
  type: "supply",
  unit: "sleeve",
  spotId,
  supplierId: "",
  supplierCode: "",
  packSize: "",
  reorderAt: "1",
  orderUpTo: "5",
  defaultUnitCost: "",
  ...overrides,
});

const reading = (overrides: Partial<InvoiceReading> = {}): InvoiceReading => ({
  supplierName: "SYSCO Corporation",
  invoiceNumber: "884120",
  invoiceDate: "2026-11-16",
  invoiceTotal: 151.5,
  lines: [],
  ...overrides,
});

const line = (overrides: Partial<InvoiceReading["lines"][number]>): InvoiceReading["lines"][number] => ({
  itemCode: null,
  description: "",
  quantity: null,
  invoiceUnit: null,
  unitPrice: null,
  lineTotal: null,
  ...overrides,
});

beforeEach(async () => {
  db = await openBusinessDatabase(now);
  spotId = await addSpot(db, "Back room");
  sysco = await addSupplier(db, { name: "Sysco", contact: "", notes: "" });
});

describe("matching a scanned invoice", () => {
  it("recognizes supplier names as printed on invoices", () => {
    expect(sameSupplier("SYSCO Corporation", "Sysco")).toBe(true);
    expect(sameSupplier("Gordon Food Service, Inc.", "Gordon Food Service")).toBe(true);
    expect(sameSupplier("US Foods", "Sysco")).toBe(false);
    expect(sameSupplier("Co.", "Sysco")).toBe(false);
  });

  it("matches lines by the supplier's code and converts cases to count units", async () => {
    const cups = await addItem(db, item({ name: "16oz cups", supplierId: sysco, supplierCode: "0045121", packSize: "20" }));
    const lids = await addItem(db, item({ name: "Lids", supplierId: sysco, supplierCode: "77" }));
    const prefill = await matchInvoice(
      db,
      reading({
        lines: [
          line({ itemCode: "0045121", description: "CUP PLAS 16OZ", quantity: 2, unitPrice: 41.25, lineTotal: 82.5 }),
          line({ itemCode: "77", description: "LID DOME", quantity: 3, unitPrice: 20 }),
          line({ itemCode: "999", description: "FUEL SURCHARGE", quantity: 1, lineTotal: 9 }),
        ],
      }),
      today,
    );
    expect(prefill).toMatchObject({ supplierId: sysco, unknownSupplier: null, invoiceNumber: "884120", invoiceTotal: "151.5", receivedOn: "2026-11-16", duplicate: false });
    expect(prefill.lines).toEqual([
      { itemId: cups, quantity: "40", lineTotal: "82.5", invoiceCode: "0045121", invoiceDescription: "CUP PLAS 16OZ", invoiceQuantity: 2 },
      { itemId: lids, quantity: "3", lineTotal: "60", invoiceCode: "77", invoiceDescription: "LID DOME", invoiceQuantity: 3 },
      { itemId: "", quantity: "", lineTotal: "9", invoiceCode: "999", invoiceDescription: "FUEL SURCHARGE", invoiceQuantity: 1 },
    ]);
  });

  it("offers an unknown supplier, and falls back to today for missing or future dates", async () => {
    const prefill = await matchInvoice(db, reading({ supplierName: "Restaurant Depot", invoiceDate: null }), today);
    expect(prefill).toMatchObject({ supplierId: "", unknownSupplier: "Restaurant Depot", receivedOn: today });
    expect((await matchInvoice(db, reading({ invoiceDate: "2026-12-01" }), today)).receivedOn).toBe(today);
    expect((await matchInvoice(db, reading({ invoiceDate: "Nov 3" }), today)).receivedOn).toBe(today);
  });

  it("flags an invoice that's already recorded", async () => {
    const cups = await addItem(db, item({ name: "16oz cups" }));
    await recordDelivery(
      db,
      { supplierId: sysco, invoiceNumber: "884120", invoiceTotal: "", receivedOn: "2026-11-16", onShelfForCount: false, lines: [{ itemId: cups, quantity: "1", lineTotal: "" }] },
      { actor: "owner", now },
    );
    expect((await matchInvoice(db, reading(), today)).duplicate).toBe(true);
  });

  it("remembers a code chosen by hand, without overwriting an item's existing code", async () => {
    const cups = await addItem(db, item({ name: "16oz cups" }));
    const lids = await addItem(db, item({ name: "Lids", supplierId: sysco, supplierCode: "77" }));
    await recordDelivery(
      db,
      {
        supplierId: sysco,
        invoiceNumber: "",
        invoiceTotal: "",
        receivedOn: "2026-11-16",
        onShelfForCount: false,
        lines: [
          { itemId: cups, quantity: "40", lineTotal: "", invoiceCode: "0045121" },
          { itemId: lids, quantity: "3", lineTotal: "", invoiceCode: "78" },
        ],
      },
      { actor: "owner", now },
    );
    const codes = Object.fromEntries((await listItems(db)).map((i) => [i.name, [i.supplierId, i.supplierCode]]));
    expect(codes).toEqual({ "16oz cups": [sysco, "0045121"], Lids: [sysco, "77"] });
  });
});
