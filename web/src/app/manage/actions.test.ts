// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { openLocalDatabase } from "@/db/local";
import { schema } from "@/db";

const state = vi.hoisted(() => ({
  db: null as unknown as Db,
  user: null as null | { email: string; verified?: boolean },
  cookies: new Map<string, string>(),
  read: (async () => {
    throw new Error("no reading set");
  }) as (pages: Uint8Array[]) => Promise<unknown>,
  kept: [] as string[],
}));

vi.mock("@/db", async (original) => ({ ...(await original<typeof import("@/db")>()), getDb: async () => state.db }));
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: async () =>
    state.user && {
      firstName: "Lee",
      primaryEmailAddress: {
        emailAddress: state.user.email,
        verification: { status: state.user.verified === false ? "unverified" : "verified" },
      },
    },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => state.cookies.set(name, value),
    delete: (name: string) => state.cookies.delete(name),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/server/invoice-reader", () => ({ readInvoice: (pages: Uint8Array[]) => state.read(pages) }));
vi.mock("@/lib/server/photo-store", () => ({
  storePhoto: async () => `invoices/${crypto.randomUUID()}.jpg`,
  keepPhotos: async (pathnames: string[]) => void state.kept.push(...pathnames),
  readPhoto: async () => null,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { addEmployeeAction, enrollKioskAction, setManagerPinAction } = await import("./actions");
const { unlockManager, enterEmployeePin, startCounting, enterCount, finishCounting } = await import("../kiosk/actions");
const inventory = await import("@/lib/server/inventory");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(async () => {
  process.env.MANAGER_EMAILS = "owner@example.com, Second.Manager@Example.com";
  state.db = await openLocalDatabase();
  state.user = null;
  state.cookies.clear();
  state.kept = [];
});

const employees = () => state.db.select().from(schema.employee);

describe("manager actions", () => {
  it("refuse anyone who isn't signed in as the manager", async () => {
    await expect(addEmployeeAction(null, form({ displayName: "Ava", email: "" }))).rejects.toThrow("REDIRECT /");

    state.user = { email: "stranger@example.com" };
    await expect(addEmployeeAction(null, form({ displayName: "Ava", email: "" }))).rejects.toThrow("REDIRECT /");

    state.user = { email: "owner@example.com", verified: false };
    await expect(addEmployeeAction(null, form({ displayName: "Ava", email: "" }))).rejects.toThrow("REDIRECT /");
    expect(await employees()).toHaveLength(0);
  });

  it("refuse employees, even signed in", async () => {
    state.user = { email: "owner@example.com" };
    await addEmployeeAction(null, form({ displayName: "Ava", email: "ava@example.com" }));
    state.user = { email: "ava@example.com" };
    await expect(addEmployeeAction(null, form({ displayName: "Mallory", email: "" }))).rejects.toThrow("REDIRECT /");
    expect((await employees()).map((e) => e.displayName).sort()).toEqual(["Ava", "Lee"]);
  });

  it("let the manager add an employee and show the new PIN once", async () => {
    state.user = { email: "OWNER@example.com" };
    const result = await addEmployeeAction(null, form({ displayName: "Ava", email: "" }));
    expect(result?.error).toBeUndefined();
    expect(result?.pin).toMatch(/^\d{4}$/);
    const [ava] = (await employees()).filter((e) => e.displayName === "Ava");
    expect(ava.pinDigest).not.toBe(result?.pin);
  });

  it("let every listed manager in", async () => {
    state.user = { email: "second.manager@example.com" };
    const result = await addEmployeeAction(null, form({ displayName: "Ava", email: "" }));
    expect(result?.error).toBeUndefined();
    const managers = (await employees()).filter((e) => e.role === "manager");
    expect(managers.map((e) => e.email)).toEqual(["second.manager@example.com"]);
  });

  it("reject malformed ids instead of erroring", async () => {
    state.user = { email: "owner@example.com" };
    const { setActiveAction } = await import("./actions");
    const result = await setActiveAction(null, form({ id: "not-a-uuid", active: "false" }));
    expect(result?.error).toMatch(/no longer exists/);
  });
});

describe("kiosk and manager PIN", () => {
  it("only work on an enrolled device, and the manager PIN can't enroll devices", async () => {
    expect(await enterEmployeePin("4821")).toEqual({ kind: "notKiosk" });

    state.user = { email: "owner@example.com" };
    await setManagerPinAction(null, form({ pin: "9036", confirm: "9036" }));
    await expect(enrollKioskAction(form({ label: "Counter iPad" }))).rejects.toThrow("REDIRECT /kiosk/ready");
    expect(state.cookies.has("alabaster_kiosk")).toBe(true);

    // Signed out at the counter: the manager PIN opens the tools...
    state.user = null;
    expect(await unlockManager("1357")).toEqual({ kind: "wrong" });
    expect(await unlockManager("9036")).toEqual({ kind: "manager" });
    const added = await addEmployeeAction(null, form({ displayName: "Maya", email: "" }));
    expect(added?.pin).toMatch(/^\d{4}$/);

    // ...but not account-only actions.
    await expect(enrollKioskAction(form({ label: "Another" }))).rejects.toThrow("REDIRECT /");
    await expect(setManagerPinAction(null, form({ pin: "2468", confirm: "2468" }))).rejects.toThrow("REDIRECT /");

    // A manager ticket copied to a browser without the kiosk cookie is useless.
    state.cookies.delete("alabaster_kiosk");
    await expect(addEmployeeAction(null, form({ displayName: "Eve", email: "" }))).rejects.toThrow("REDIRECT /");
  });
});

describe("inventory count on the kiosk", () => {
  async function setUpKioskWithItem() {
    state.user = { email: "owner@example.com" };
    await expect(enrollKioskAction(form({ label: "Counter iPad" }))).rejects.toThrow("REDIRECT /kiosk/ready");
    const added = await addEmployeeAction(null, form({ displayName: "Ava", email: "" }));
    const spotId = await inventory.addSpot(state.db, "Back room");
    const itemId = await inventory.addItem(state.db, {
      name: "Vanilla protein",
      type: "ingredient",
      unit: "tub",
      spotId,
      supplierId: "",
      supplierCode: "",
      packSize: "",
      reorderAt: "2",
      orderUpTo: "8",
      defaultUnitCost: "",
    });
    state.user = null;
    return { pin: added!.pin!, itemId };
  }

  it("needs the employee's PIN, then saves entries under their name", async () => {
    const { pin, itemId } = await setUpKioskWithItem();
    expect(await startCounting("0000")).toEqual({ kind: "wrong" });

    const started = await startCounting(pin);
    if (started.kind !== "counting") throw new Error(`expected counting, got ${started.kind}`);
    const { countId } = started.view;
    expect(started.view.lines.map((l) => l.name)).toEqual(["Vanilla protein"]);

    expect(await enterCount({ countId, itemId, quantity: "2.5" })).toEqual({ kind: "saved", quantity: 2.5 });
    expect(await enterCount({ countId, itemId, quantity: "-1" })).toMatchObject({ kind: "error" });
    expect((await inventory.getCount(state.db, countId))?.lines[0]).toMatchObject({ quantity: 2.5, enteredBy: "Ava" });

    expect(await finishCounting({ countId })).toEqual({ kind: "finished", skipped: 0 });
    expect(state.cookies.has("alabaster_kiosk_count")).toBe(false);
  });

  it("refuses entries without a count session, or off the enrolled kiosk", async () => {
    const { pin, itemId } = await setUpKioskWithItem();
    const started = await startCounting(pin);
    if (started.kind !== "counting") throw new Error("expected counting");
    const { countId } = started.view;

    const session = state.cookies.get("alabaster_kiosk_count")!;
    state.cookies.delete("alabaster_kiosk_count");
    expect(await enterCount({ countId, itemId, quantity: "3" })).toEqual({ kind: "expired" });

    state.cookies.set("alabaster_kiosk_count", session);
    state.cookies.delete("alabaster_kiosk");
    expect(await enterCount({ countId, itemId, quantity: "3" })).toEqual({ kind: "expired" });
    expect((await inventory.getCount(state.db, countId))?.lines[0].quantity).toBeNull();
  });
});

describe("inventory manager actions", () => {
  it("refuse employees and anyone signed out, and work for the manager", async () => {
    const { addSpotAction, addItemAction, cancelCountAction, fixCountLineAction } = await import("./inventory-actions");
    const { GET: exportReport } = await import("./inventory/reports/export/route");
    const { NextRequest } = await import("next/server");
    const report = () => exportReport(new NextRequest("http://localhost/manage/inventory/reports/export?report=stock"));
    expect((await report()).status).toBe(403);
    await expect(addSpotAction(null, form({ name: "Back room" }))).rejects.toThrow("REDIRECT /");

    state.user = { email: "owner@example.com" };
    await addEmployeeAction(null, form({ displayName: "Ava", email: "ava@example.com" }));
    expect(await addSpotAction(null, form({ name: "Back room" }))).toMatchObject({ success: expect.any(String) });
    const [spot] = await inventory.listSpots(state.db);
    const item = { name: "Cups", type: "supply", unit: "sleeve", spotId: spot.id, supplierId: "", supplierCode: "", packSize: "", reorderAt: "1", orderUpTo: "4", defaultUnitCost: "" };
    expect((await addItemAction(null, form(item)))?.error).toBeUndefined();
    const stock = await report();
    expect(stock.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(await stock.text()).toContain("Cups,Supply,Back room");

    state.user = { email: "ava@example.com" };
    expect((await report()).status).toBe(403);
    await expect(fixCountLineAction(null, form({ countId: spot.id, itemId: spot.id, quantity: "1", reason: "Typo" }))).rejects.toThrow("REDIRECT /");
    await expect(addSpotAction(null, form({ name: "Fridge" }))).rejects.toThrow("REDIRECT /");
    await expect(addItemAction(null, form({ ...item, name: "Lids" }))).rejects.toThrow("REDIRECT /");
    await expect(cancelCountAction(null, form({ countId: spot.id }))).rejects.toThrow("REDIRECT /");
    expect((await inventory.listSpots(state.db)).map((s) => s.name)).toEqual(["Back room"]);
    expect((await inventory.listItems(state.db)).map((i) => i.name)).toEqual(["Cups"]);
  });

  it("record a delivery from the form and open it, but not for employees", async () => {
    const { recordDeliveryAction } = await import("./inventory-actions");
    state.user = { email: "owner@example.com" };
    await addEmployeeAction(null, form({ displayName: "Ava", email: "ava@example.com" }));
    const spotId = await inventory.addSpot(state.db, "Back room");
    const supplierId = await inventory.addSupplier(state.db, { name: "Sysco", contact: "", notes: "" });
    const itemId = await inventory.addItem(state.db, {
      name: "Cups", type: "supply", unit: "sleeve", spotId, supplierId: "", supplierCode: "", packSize: "", reorderAt: "1", orderUpTo: "4", defaultUnitCost: "",
    });
    const fields = { supplierId, receivedOn: "2026-01-05", invoiceNumber: "A1", invoiceTotal: "", lines: JSON.stringify([{ itemId, quantity: "40", lineTotal: "62.00" }]) };

    expect(await recordDeliveryAction(null, form({ ...fields, lines: "not json" }))).toMatchObject({ error: "Add at least one item." });
    await expect(recordDeliveryAction(null, form(fields))).rejects.toThrow(/REDIRECT \/manage\/inventory\/deliveries\/[0-9a-f-]{36}/);

    state.user = { email: "ava@example.com" };
    await expect(recordDeliveryAction(null, form({ ...fields, invoiceNumber: "A2" }))).rejects.toThrow("REDIRECT /");
    expect((await inventory.listDeliveries(state.db)).map((d) => d.invoiceNumber)).toEqual(["A1"]);
  });
});

describe("scanning invoices", () => {
  const photo = (bytes = 10) => new File([new Uint8Array(bytes)], "page.jpg", { type: "image/jpeg" });
  const photos = (...files: File[]) => {
    const data = new FormData();
    for (const file of files) data.append("photo", file);
    return data;
  };

  async function setUp() {
    state.user = { email: "owner@example.com" };
    const spotId = await inventory.addSpot(state.db, "Back room");
    const supplierId = await inventory.addSupplier(state.db, { name: "Sysco", contact: "", notes: "" });
    const itemId = await inventory.addItem(state.db, {
      name: "Cups", type: "supply", unit: "sleeve", spotId, supplierId, supplierCode: "45", packSize: "20", reorderAt: "1", orderUpTo: "4", defaultUnitCost: "",
    });
    return { supplierId, itemId };
  }

  it("fill in the delivery from the photos, and keep the photos when it's saved", async () => {
    const { scanInvoiceAction } = await import("./inventory/deliveries/scan-actions");
    const { recordDeliveryAction } = await import("./inventory-actions");
    const { supplierId, itemId } = await setUp();
    state.read = async (pages) => {
      expect(pages).toHaveLength(2);
      return {
        supplierName: "SYSCO", invoiceNumber: "9", invoiceDate: "2026-01-05", invoiceTotal: 80,
        lines: [{ itemCode: "45", description: "CUP 16OZ", quantity: 2, invoiceUnit: "case", unitPrice: 40, lineTotal: 80 }],
      };
    };
    const result = await scanInvoiceAction(photos(photo(), photo()));
    if (result.kind !== "read") throw new Error(`expected read, got ${result.kind}`);
    expect(result.prefill).toMatchObject({ supplierId, invoiceNumber: "9", lines: [{ itemId, quantity: "40", lineTotal: "80" }] });
    expect(result.photoIds).toHaveLength(2);

    const fields = { supplierId, receivedOn: "2026-01-05", invoiceNumber: "9", invoiceTotal: "80", lines: JSON.stringify(result.prefill.lines), photoIds: JSON.stringify(result.photoIds) };
    await expect(recordDeliveryAction(null, form(fields))).rejects.toThrow(/REDIRECT \/manage\/inventory\/deliveries\//);
    const [saved] = await inventory.listDeliveries(state.db);
    expect(state.kept).toHaveLength(2);
    const attached = await state.db.select().from(schema.invoicePhoto);
    expect(attached.every((p) => p.deliveryId === saved.id)).toBe(true);
  });

  it("fall back to typing it in when the invoice can't be read, and stop after the daily limit", async () => {
    const { scanInvoiceAction } = await import("./inventory/deliveries/scan-actions");
    await setUp();
    state.read = async () => {
      throw new Error("model unavailable");
    };
    expect(await scanInvoiceAction(photos(photo()))).toMatchObject({ kind: "unreadable", photoIds: [expect.any(String)] });
    expect(await scanInvoiceAction(photos())).toMatchObject({ kind: "error", message: /Choose a photo/ });
    expect(await scanInvoiceAction(photos(new File(["x"], "a.png", { type: "image/png" })))).toMatchObject({ kind: "error" });
    expect(await scanInvoiceAction(photos(...Array.from({ length: 6 }, () => photo())))).toMatchObject({ kind: "error", message: /up to 5/ });

    await state.db.insert(schema.invoiceScan).values(Array.from({ length: 29 }, () => ({ actor: "owner", at: new Date(), ok: true })));
    expect(await scanInvoiceAction(photos(photo()))).toMatchObject({ kind: "error", message: /30 scans/ });
  });

  it("are for managers only", async () => {
    const { scanInvoiceAction, quickAddSupplierAction } = await import("./inventory/deliveries/scan-actions");
    await expect(scanInvoiceAction(photos(photo()))).rejects.toThrow("REDIRECT /");
    await expect(quickAddSupplierAction("US Foods")).rejects.toThrow("REDIRECT /");
    state.user = { email: "owner@example.com" };
    expect(await quickAddSupplierAction("US Foods")).toMatchObject({ ok: true, value: { name: "US Foods" } });
    expect(await quickAddSupplierAction("us foods")).toMatchObject({ ok: false, error: /already/ });
  });
});
