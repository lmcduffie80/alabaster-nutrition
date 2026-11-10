import "server-only";
import { and, asc, count as countRows, desc, eq, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@/db";
import {
  countDue,
  deliveryCounts,
  isLow,
  itemTypes,
  onHand,
  parseMoney,
  parseQuantity,
  reorderAmount,
  round2,
  stockValue,
  unitCost,
  type ItemType,
} from "@/lib/domain/inventory";
import { isLocalDate, localDateOf, type LocalDate } from "@/lib/domain/time";
import { getBusiness } from "./business";
import { UserError } from "./errors";
import { listEmployees } from "./team";

const { storageSpot, supplier, inventoryItem, inventoryCount, inventoryCountLine, delivery, deliveryLine, inventoryAudit } = schema;

function parse<T>(schemaToUse: z.ZodType<T>, value: unknown): T {
  const result = schemaToUse.safeParse(value);
  if (!result.success) throw new UserError(result.error.issues[0]?.message ?? "Check the details and try again.");
  return result.data;
}

function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

async function unique<T>(work: Promise<T>, message: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserError(message);
    throw error;
  }
}

const uuid = z.uuid();
const isId = (value: string) => uuid.safeParse(value).success;

async function employeeNames(db: Db) {
  return new Map((await listEmployees(db, { includeInactive: true })).map((e) => [e.id, e.displayName]));
}

// Storage spots

export type Spot = { id: string; name: string; sortOrder: number; itemCount: number };

const spotName = z.string().trim().min(1, "Enter a name for the spot.").max(40, "Keep the name under 40 characters.");

export async function listSpots(db: Db): Promise<Spot[]> {
  const rows = await db
    .select({
      id: storageSpot.id,
      name: storageSpot.name,
      sortOrder: storageSpot.sortOrder,
      itemCount: sql<number>`count(${inventoryItem.id}) filter (where ${inventoryItem.active})`.mapWith(Number),
    })
    .from(storageSpot)
    .leftJoin(inventoryItem, eq(inventoryItem.spotId, storageSpot.id))
    .groupBy(storageSpot.id)
    .orderBy(asc(storageSpot.sortOrder));
  return rows;
}

export async function addSpot(db: Db, name: string) {
  const parsed = parse(spotName, name);
  const [{ last }] = await db.select({ last: max(storageSpot.sortOrder) }).from(storageSpot);
  const [row] = await unique(
    db.insert(storageSpot).values({ name: parsed, sortOrder: (last ?? -1) + 1 }).returning({ id: storageSpot.id }),
    "There's already a spot with that name.",
  );
  return row.id;
}

export async function renameSpot(db: Db, id: string, name: string) {
  const parsed = parse(spotName, name);
  await unique(db.update(storageSpot).set({ name: parsed }).where(eq(storageSpot.id, id)), "There's already a spot with that name.");
}

export async function moveSpot(db: Db, id: string, direction: "up" | "down") {
  const spots = await listSpots(db);
  const index = spots.findIndex((s) => s.id === id);
  const other = spots[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !other) return;
  await db.transaction(async (tx) => {
    await tx.update(storageSpot).set({ sortOrder: other.sortOrder }).where(eq(storageSpot.id, id));
    await tx.update(storageSpot).set({ sortOrder: spots[index].sortOrder }).where(eq(storageSpot.id, other.id));
  });
}

export async function removeSpot(db: Db, id: string) {
  const [{ used }] = await db.select({ used: countRows() }).from(inventoryItem).where(eq(inventoryItem.spotId, id));
  if (used > 0) throw new UserError("Move this spot's items to another spot first (including former items).");
  await db.delete(storageSpot).where(eq(storageSpot.id, id));
}

// Suppliers

export type Supplier = typeof supplier.$inferSelect;

const supplierInput = z.object({
  name: z.string().trim().min(1, "Enter the supplier's name.").max(80, "Keep the name under 80 characters."),
  contact: z.string().trim().max(200, "Keep the contact details under 200 characters."),
  notes: z.string().trim().max(1000, "Keep the notes under 1000 characters."),
});
export type SupplierInput = z.input<typeof supplierInput>;

export async function listSuppliers(db: Db, options: { includeInactive?: boolean } = {}): Promise<Supplier[]> {
  return db
    .select()
    .from(supplier)
    .where(options.includeInactive ? undefined : eq(supplier.active, true))
    .orderBy(asc(sql`lower(${supplier.name})`));
}

export async function addSupplier(db: Db, input: SupplierInput) {
  const values = parse(supplierInput, input);
  const [row] = await unique(
    db.insert(supplier).values(values).returning({ id: supplier.id }),
    "There's already a supplier with that name.",
  );
  return row.id;
}

export async function updateSupplier(db: Db, id: string, input: SupplierInput) {
  const values = parse(supplierInput, input);
  await unique(db.update(supplier).set(values).where(eq(supplier.id, id)), "There's already a supplier with that name.");
}

export async function setSupplierActive(db: Db, id: string, active: boolean) {
  await db.update(supplier).set({ active }).where(eq(supplier.id, id));
}

// Items

export type Item = typeof inventoryItem.$inferSelect & { spotName: string; supplierName: string | null };

/** Everything as typed into the item form. */
export type ItemInput = {
  name: string;
  type: string;
  unit: string;
  spotId: string;
  supplierId: string;
  supplierCode: string;
  packSize: string;
  reorderAt: string;
  orderUpTo: string;
  defaultUnitCost: string;
};

function amount(value: string, label: string, options: { required?: boolean } = {}) {
  let parsed: number | null;
  try {
    parsed = parseQuantity(value.replace(/^\$/, ""));
  } catch {
    throw new UserError(`${label}: enter a number like 3 or 2.5.`);
  }
  if (parsed === null && options.required) throw new UserError(`Enter ${label.toLowerCase()}.`);
  return parsed;
}

async function parseItem(db: Db, input: ItemInput) {
  const name = parse(z.string().trim().min(1, "Enter the item's name.").max(80, "Keep the name under 80 characters."), input.name);
  if (!(itemTypes as readonly string[]).includes(input.type)) throw new UserError("Choose ingredient or supply.");
  const unit = parse(
    z.string().trim().min(1, "Enter the unit you count it in, like tub or bag.").max(40, "Keep the unit under 40 characters."),
    input.unit,
  );
  if (!isId(input.spotId)) throw new UserError("Choose where it's stored.");
  const [spot] = await db.select({ id: storageSpot.id }).from(storageSpot).where(eq(storageSpot.id, input.spotId));
  if (!spot) throw new UserError("Choose where it's stored.");

  let supplierId: string | null = null;
  if (input.supplierId) {
    if (!isId(input.supplierId)) throw new UserError("Choose a supplier.");
    const [row] = await db.select({ id: supplier.id }).from(supplier).where(eq(supplier.id, input.supplierId));
    if (!row) throw new UserError("Choose a supplier.");
    supplierId = row.id;
  }
  const supplierCode = input.supplierCode.trim() || null;
  if (supplierCode && !supplierId) throw new UserError("Choose the supplier this item code belongs to.");
  if (supplierCode && supplierCode.length > 40) throw new UserError("Keep the item code under 40 characters.");

  const packSize = amount(input.packSize || "1", "Pack size", { required: true })!;
  if (packSize <= 0) throw new UserError("Pack size must be more than 0.");
  const reorderAt = amount(input.reorderAt, "The reorder level", { required: true })!;
  const orderUpTo = amount(input.orderUpTo, "The order-up-to level", { required: true })!;
  if (orderUpTo <= reorderAt) throw new UserError("“Order up to” must be more than “Reorder at”.");
  const defaultUnitCost = amount(input.defaultUnitCost, "Cost");

  return { name, type: input.type as ItemType, unit, spotId: spot.id, supplierId, supplierCode, packSize, reorderAt, orderUpTo, defaultUnitCost };
}

const itemUniqueMessage = "Another item already has that name, or that supplier item code.";

export async function listItems(db: Db, options: { includeInactive?: boolean } = {}): Promise<Item[]> {
  const rows = await db
    .select({ item: inventoryItem, spotName: storageSpot.name, supplierName: supplier.name, spotOrder: storageSpot.sortOrder })
    .from(inventoryItem)
    .innerJoin(storageSpot, eq(storageSpot.id, inventoryItem.spotId))
    .leftJoin(supplier, eq(supplier.id, inventoryItem.supplierId))
    .where(options.includeInactive ? undefined : eq(inventoryItem.active, true))
    .orderBy(asc(storageSpot.sortOrder), asc(sql`lower(${inventoryItem.name})`));
  return rows.map((r) => ({ ...r.item, spotName: r.spotName, supplierName: r.supplierName }));
}

export async function addItem(db: Db, input: ItemInput) {
  const values = await parseItem(db, input);
  const [row] = await unique(db.insert(inventoryItem).values(values).returning({ id: inventoryItem.id }), itemUniqueMessage);
  return row.id;
}

export async function updateItem(db: Db, id: string, input: ItemInput) {
  const values = await parseItem(db, input);
  await unique(db.update(inventoryItem).set(values).where(eq(inventoryItem.id, id)), itemUniqueMessage);
}

/** A deactivated item leaves the open count unless someone already counted it. */
export async function setItemActive(db: Db, id: string, active: boolean) {
  await db.transaction(async (tx) => {
    await tx.update(inventoryItem).set({ active }).where(eq(inventoryItem.id, id));
    if (active) return;
    const [open] = await tx.select({ id: inventoryCount.id }).from(inventoryCount).where(eq(inventoryCount.status, "open"));
    if (!open) return;
    await tx
      .delete(inventoryCountLine)
      .where(and(eq(inventoryCountLine.countId, open.id), eq(inventoryCountLine.itemId, id), isNull(inventoryCountLine.quantity)));
  });
}

// Counts

/** Each item's most recent counted quantity on a finished count. */
async function lastCounts(db: Db) {
  const rows = await db
    .selectDistinctOn([inventoryCountLine.itemId], {
      itemId: inventoryCountLine.itemId,
      quantity: inventoryCountLine.quantity,
      at: inventoryCount.finishedAt,
    })
    .from(inventoryCountLine)
    .innerJoin(inventoryCount, eq(inventoryCount.id, inventoryCountLine.countId))
    .where(and(eq(inventoryCount.status, "finished"), isNotNull(inventoryCountLine.quantity)))
    .orderBy(inventoryCountLine.itemId, desc(inventoryCount.finishedAt));
  return new Map(rows.map((r) => [r.itemId, { quantity: r.quantity!, at: r.at! }]));
}

export type CountLineView = {
  itemId: string;
  name: string;
  unit: string;
  spotName: string;
  lastCounted: number | null;
  quantity: number | null;
  enteredBy: string | null;
  enteredAt: Date | null;
};

export type CountView = {
  id: string;
  status: "open" | "finished" | "cancelled";
  startedAt: Date;
  startedBy: string;
  finishedAt: Date | null;
  finishedBy: string | null;
  counted: number;
  total: number;
  lines: CountLineView[];
};

export async function getCount(db: Db, id: string): Promise<CountView | null> {
  if (!isId(id)) return null;
  const [header] = await db.select().from(inventoryCount).where(eq(inventoryCount.id, id));
  if (!header) return null;
  const [rows, names, previous] = await Promise.all([
    db
      .select({
        itemId: inventoryCountLine.itemId,
        name: inventoryItem.name,
        unit: inventoryItem.unit,
        spotName: storageSpot.name,
        quantity: inventoryCountLine.quantity,
        enteredBy: inventoryCountLine.enteredBy,
        enteredAt: inventoryCountLine.enteredAt,
      })
      .from(inventoryCountLine)
      .innerJoin(inventoryItem, eq(inventoryItem.id, inventoryCountLine.itemId))
      .innerJoin(storageSpot, eq(storageSpot.id, inventoryItem.spotId))
      .where(eq(inventoryCountLine.countId, id))
      .orderBy(asc(storageSpot.sortOrder), asc(sql`lower(${inventoryItem.name})`)),
    employeeNames(db),
    lastCounts(db),
  ]);
  const lines = rows.map((r) => ({
    ...r,
    enteredBy: r.enteredBy ? (names.get(r.enteredBy) ?? null) : null,
    lastCounted: header.status === "open" ? (previous.get(r.itemId)?.quantity ?? null) : null,
  }));
  return {
    id: header.id,
    status: header.status,
    startedAt: header.startedAt,
    startedBy: names.get(header.startedBy) ?? "",
    finishedAt: header.finishedAt,
    finishedBy: header.finishedBy ? (names.get(header.finishedBy) ?? null) : null,
    counted: lines.filter((l) => l.quantity !== null).length,
    total: lines.length,
    lines,
  };
}

export async function openCountId(db: Db): Promise<string | null> {
  const [open] = await db.select({ id: inventoryCount.id }).from(inventoryCount).where(eq(inventoryCount.status, "open"));
  return open?.id ?? null;
}

/** The open count, or a new one listing every active item. */
export async function startOrContinueCount(db: Db, input: { employeeId: string; now: Date }): Promise<string> {
  const existing = await openCountId(db);
  if (existing) return existing;
  try {
    return await db.transaction(async (tx) => {
      const items = await tx.select({ id: inventoryItem.id }).from(inventoryItem).where(eq(inventoryItem.active, true));
      if (items.length === 0) throw new UserError("There are no items to count yet. A manager adds them under Inventory → Items.");
      const [created] = await tx
        .insert(inventoryCount)
        .values({ startedAt: input.now, startedBy: input.employeeId })
        .returning({ id: inventoryCount.id });
      await tx.insert(inventoryCountLine).values(items.map((item) => ({ countId: created.id, itemId: item.id })));
      return created.id;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await openCountId(db);
    if (!raced) throw error;
    return raced;
  }
}

async function requireOpen(db: Db, countId: string) {
  if (!isId(countId)) throw new UserError("This count is no longer open.");
  const [row] = await db.select({ status: inventoryCount.status }).from(inventoryCount).where(eq(inventoryCount.id, countId));
  if (row?.status !== "open") throw new UserError("This count is no longer open.");
}

export async function enterCountLine(
  db: Db,
  input: { countId: string; itemId: string; quantity: number | null; employeeId: string; now: Date },
) {
  await requireOpen(db, input.countId);
  if (!isId(input.itemId)) throw new UserError("That item isn't on this count.");
  const updated = await db
    .update(inventoryCountLine)
    .set({
      quantity: input.quantity,
      enteredBy: input.quantity === null ? null : input.employeeId,
      enteredAt: input.quantity === null ? null : input.now,
    })
    .where(and(eq(inventoryCountLine.countId, input.countId), eq(inventoryCountLine.itemId, input.itemId)))
    .returning({ itemId: inventoryCountLine.itemId });
  if (updated.length === 0) throw new UserError("That item isn't on this count.");
}

export async function finishCount(db: Db, input: { countId: string; employeeId: string; now: Date }) {
  await requireOpen(db, input.countId);
  const lines = await db
    .select({ quantity: inventoryCountLine.quantity })
    .from(inventoryCountLine)
    .where(eq(inventoryCountLine.countId, input.countId));
  const skipped = lines.filter((l) => l.quantity === null).length;
  if (skipped === lines.length) throw new UserError("Count at least one item before finishing.");
  await db
    .update(inventoryCount)
    .set({ status: "finished", finishedAt: input.now, finishedBy: input.employeeId })
    .where(and(eq(inventoryCount.id, input.countId), eq(inventoryCount.status, "open")));
  return { skipped };
}

export async function cancelCount(db: Db, countId: string, now: Date) {
  await requireOpen(db, countId);
  await db.update(inventoryCount).set({ status: "cancelled", cancelledAt: now }).where(eq(inventoryCount.id, countId));
}

export type CountSummary = Omit<CountView, "lines">;

export async function listCounts(db: Db, limit = 52): Promise<CountSummary[]> {
  const [rows, names] = await Promise.all([
    db
      .select({
        count: inventoryCount,
        counted: sql<number>`count(${inventoryCountLine.quantity})`.mapWith(Number),
        total: sql<number>`count(${inventoryCountLine.itemId})`.mapWith(Number),
      })
      .from(inventoryCount)
      .leftJoin(inventoryCountLine, eq(inventoryCountLine.countId, inventoryCount.id))
      .groupBy(inventoryCount.id)
      .orderBy(desc(inventoryCount.startedAt))
      .limit(limit),
    employeeNames(db),
  ]);
  return rows.map(({ count, counted, total }) => ({
    id: count.id,
    status: count.status,
    startedAt: count.startedAt,
    startedBy: names.get(count.startedBy) ?? "",
    finishedAt: count.finishedAt,
    finishedBy: count.finishedBy ? (names.get(count.finishedBy) ?? null) : null,
    counted,
    total,
  }));
}

// Deliveries

export type DeliveryLineInput = {
  itemId: string;
  quantity: string;
  lineTotal: string;
  invoiceCode?: string;
  invoiceDescription?: string;
};

/** Everything as typed into the delivery form; quantities are in each item's count unit. */
export type DeliveryInput = {
  supplierId: string;
  invoiceNumber: string;
  invoiceTotal: string;
  receivedOn: string;
  onShelfForCount: boolean;
  lines: DeliveryLineInput[];
};

export const MAX_DELIVERY_LINES = 100;

function money(value: string, label: string) {
  try {
    return parseMoney(value);
  } catch (error) {
    throw new UserError(`${label}: ${(error as Error).message}`);
  }
}

async function parseDelivery(db: Db, input: DeliveryInput, today: LocalDate) {
  if (!isId(input.supplierId)) throw new UserError("Choose the supplier.");
  const [found] = await db.select({ id: supplier.id }).from(supplier).where(eq(supplier.id, input.supplierId));
  if (!found) throw new UserError("Choose the supplier.");
  if (!isLocalDate(input.receivedOn)) throw new UserError("Enter the date it arrived.");
  if (input.receivedOn > today) throw new UserError("The received date can't be in the future.");
  const invoiceNumber = input.invoiceNumber.trim() || null;
  if (invoiceNumber && invoiceNumber.length > 40) throw new UserError("Keep the invoice number under 40 characters.");
  const invoiceTotal = money(input.invoiceTotal, "Invoice total");

  const filled = input.lines.filter((line) => line.itemId || line.quantity.trim() || line.lineTotal.trim());
  if (filled.length === 0) throw new UserError("Add at least one item.");
  if (filled.length > MAX_DELIVERY_LINES) throw new UserError(`A delivery can have up to ${MAX_DELIVERY_LINES} lines.`);
  const ids = [...new Set(filled.map((line) => line.itemId))];
  if (!ids.every(isId)) throw new UserError("Choose an item on every line.");
  const items = await db
    .select({ id: inventoryItem.id, name: inventoryItem.name })
    .from(inventoryItem)
    .where(inArray(inventoryItem.id, ids));
  const names = new Map(items.map((i) => [i.id, i.name]));

  const lines = filled.map((line) => {
    const name = names.get(line.itemId);
    if (!name) throw new UserError("Choose an item on every line.");
    let quantity: number | null;
    try {
      quantity = parseQuantity(line.quantity);
    } catch {
      throw new UserError(`${name}: enter the quantity received, like 4 or 2.5.`);
    }
    if (!quantity) throw new UserError(`${name}: enter the quantity received.`);
    return {
      itemId: line.itemId,
      quantity,
      lineTotal: money(line.lineTotal, name),
      invoiceCode: line.invoiceCode?.trim().slice(0, 40) || null,
      invoiceDescription: line.invoiceDescription?.trim().slice(0, 200) || null,
    };
  });
  return { header: { supplierId: found.id, invoiceNumber, invoiceTotal, receivedOn: input.receivedOn, onShelfForCount: input.onShelfForCount }, lines };
}

const duplicateInvoice = "That invoice number from this supplier is already recorded.";

async function businessToday(db: Db, now: Date) {
  return localDateOf(now, (await getBusiness(db)).timeZone);
}

export async function recordDelivery(db: Db, input: DeliveryInput, who: { actor: string; now: Date }) {
  const { header, lines } = await parseDelivery(db, input, await businessToday(db, who.now));
  return unique(
    db.transaction(async (tx) => {
      const [row] = await tx
        .insert(delivery)
        .values({ ...header, recordedBy: who.actor, recordedAt: who.now })
        .returning({ id: delivery.id });
      await tx.insert(deliveryLine).values(lines.map((line) => ({ ...line, deliveryId: row.id })));
      return row.id;
    }),
    duplicateInvoice,
  );
}

const reasonSchema = z.string().trim().min(1, "Enter a reason for the change.").max(200, "Keep the reason under 200 characters.");

async function deliverySnapshot(db: Db, id: string) {
  if (!isId(id)) return null;
  const [header] = await db
    .select()
    .from(delivery)
    .where(and(eq(delivery.id, id), isNull(delivery.deletedAt)));
  if (!header) return null;
  const lines = await db
    .select({ itemId: deliveryLine.itemId, quantity: deliveryLine.quantity, lineTotal: deliveryLine.lineTotal })
    .from(deliveryLine)
    .where(eq(deliveryLine.deliveryId, id));
  return { ...header, lines };
}

export async function updateDelivery(db: Db, id: string, input: DeliveryInput, who: { actor: string; now: Date; reason: string }) {
  const reason = parse(reasonSchema, who.reason);
  const before = await deliverySnapshot(db, id);
  if (!before) throw new UserError("That delivery no longer exists.");
  const { header, lines } = await parseDelivery(db, input, await businessToday(db, who.now));
  await unique(
    db.transaction(async (tx) => {
      await tx.update(delivery).set(header).where(eq(delivery.id, id));
      await tx.delete(deliveryLine).where(eq(deliveryLine.deliveryId, id));
      await tx.insert(deliveryLine).values(lines.map((line) => ({ ...line, deliveryId: id })));
      await tx.insert(inventoryAudit).values({
        entity: "delivery",
        entityId: id,
        action: "edit",
        before,
        after: { ...header, lines },
        reason,
        actor: who.actor,
        at: who.now,
      });
    }),
    duplicateInvoice,
  );
}

export async function deleteDelivery(db: Db, id: string, who: { actor: string; now: Date; reason: string }) {
  const reason = parse(reasonSchema, who.reason);
  const before = await deliverySnapshot(db, id);
  if (!before) throw new UserError("That delivery no longer exists.");
  await db.transaction(async (tx) => {
    await tx.update(delivery).set({ deletedAt: who.now }).where(eq(delivery.id, id));
    await tx
      .insert(inventoryAudit)
      .values({ entity: "delivery", entityId: id, action: "delete", before, reason, actor: who.actor, at: who.now });
  });
}

export type DeliverySummary = {
  id: string;
  receivedOn: LocalDate;
  supplierName: string;
  invoiceNumber: string | null;
  total: number | null;
  lineCount: number;
  recordedBy: string;
};

export async function listDeliveries(db: Db, limit = 100): Promise<DeliverySummary[]> {
  const rows = await db
    .select({
      id: delivery.id,
      receivedOn: delivery.receivedOn,
      supplierName: supplier.name,
      invoiceNumber: delivery.invoiceNumber,
      total: sql<number | null>`sum(${deliveryLine.lineTotal})`.mapWith((v) => (v === null ? null : Number(v))),
      lineCount: sql<number>`count(${deliveryLine.id})`.mapWith(Number),
      recordedBy: delivery.recordedBy,
    })
    .from(delivery)
    .innerJoin(supplier, eq(supplier.id, delivery.supplierId))
    .leftJoin(deliveryLine, eq(deliveryLine.deliveryId, delivery.id))
    .where(isNull(delivery.deletedAt))
    .groupBy(delivery.id, supplier.name)
    .orderBy(desc(delivery.receivedOn), desc(delivery.recordedAt))
    .limit(limit);
  return rows;
}

export type DeliveryLineView = {
  itemId: string;
  name: string;
  unit: string;
  quantity: number;
  lineTotal: number | null;
  invoiceCode: string | null;
  invoiceDescription: string | null;
};

export type DeliveryView = typeof delivery.$inferSelect & { supplierName: string; total: number | null; lines: DeliveryLineView[] };

export async function getDelivery(db: Db, id: string): Promise<DeliveryView | null> {
  if (!isId(id)) return null;
  const [header] = await db
    .select({ delivery, supplierName: supplier.name })
    .from(delivery)
    .innerJoin(supplier, eq(supplier.id, delivery.supplierId))
    .where(and(eq(delivery.id, id), isNull(delivery.deletedAt)));
  if (!header) return null;
  const lines = await db
    .select({
      itemId: deliveryLine.itemId,
      name: inventoryItem.name,
      unit: inventoryItem.unit,
      quantity: deliveryLine.quantity,
      lineTotal: deliveryLine.lineTotal,
      invoiceCode: deliveryLine.invoiceCode,
      invoiceDescription: deliveryLine.invoiceDescription,
    })
    .from(deliveryLine)
    .innerJoin(inventoryItem, eq(inventoryItem.id, deliveryLine.itemId))
    .where(eq(deliveryLine.deliveryId, id))
    .orderBy(asc(deliveryLine.id));
  const priced = lines.filter((l) => l.lineTotal !== null);
  return {
    ...header.delivery,
    supplierName: header.supplierName,
    total: priced.length ? round2(priced.reduce((sum, l) => sum + l.lineTotal!, 0)) : null,
    lines,
  };
}

// Stock

export type StockRow = Item & {
  onHand: number | null;
  lastCountedAt: Date | null;
  low: boolean;
  /** Per count unit: the latest priced delivery, else the item's default cost. */
  unitCost: number | null;
  value: number | null;
};

async function liveDeliveryLines(db: Db) {
  return db
    .select({
      itemId: deliveryLine.itemId,
      quantity: deliveryLine.quantity,
      lineTotal: deliveryLine.lineTotal,
      receivedOn: delivery.receivedOn,
      onShelfForCount: delivery.onShelfForCount,
    })
    .from(deliveryLine)
    .innerJoin(delivery, eq(delivery.id, deliveryLine.deliveryId))
    .where(isNull(delivery.deletedAt))
    .orderBy(asc(delivery.receivedOn), asc(delivery.recordedAt));
}

export async function stockRows(db: Db): Promise<StockRow[]> {
  const [items, counts, lines, { timeZone }] = await Promise.all([listItems(db), lastCounts(db), liveDeliveryLines(db), getBusiness(db)]);
  const received = new Map<string, number>();
  const latestCost = new Map<string, number>();
  for (const line of lines) {
    const cost = unitCost(line.lineTotal, line.quantity);
    if (cost !== null) latestCost.set(line.itemId, cost);
    const last = counts.get(line.itemId);
    if (last && deliveryCounts(line.receivedOn, line.onShelfForCount, localDateOf(last.at, timeZone))) {
      received.set(line.itemId, (received.get(line.itemId) ?? 0) + line.quantity);
    }
  }
  return items.map((item) => {
    const last = counts.get(item.id);
    const quantity = onHand(last?.quantity ?? null, received.get(item.id));
    const cost = latestCost.get(item.id) ?? item.defaultUnitCost;
    return {
      ...item,
      onHand: quantity,
      lastCountedAt: last?.at ?? null,
      low: isLow(quantity, item.reorderAt),
      unitCost: cost,
      value: stockValue(quantity, cost),
    };
  });
}

export type ReorderGroup = {
  supplierId: string | null;
  supplierName: string;
  contact: string;
  lines: { itemId: string; name: string; unit: string; supplierCode: string | null; onHand: number | null; amount: number }[];
};

export async function reorderList(db: Db): Promise<ReorderGroup[]> {
  const [rows, suppliers] = await Promise.all([stockRows(db), listSuppliers(db, { includeInactive: true })]);
  const groups = new Map<string | null, ReorderGroup>();
  for (const row of rows.filter((r) => r.low)) {
    const found = suppliers.find((s) => s.id === row.supplierId);
    const group = groups.get(row.supplierId) ?? {
      supplierId: row.supplierId,
      supplierName: found?.name ?? "No supplier",
      contact: found?.contact ?? "",
      lines: [],
    };
    group.lines.push({
      itemId: row.id,
      name: row.name,
      unit: row.unit,
      supplierCode: row.supplierCode,
      onHand: row.onHand,
      amount: reorderAmount(row.onHand, row.orderUpTo),
    });
    groups.set(row.supplierId, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.supplierId === null ? 1 : b.supplierId === null ? -1 : a.supplierName.localeCompare(b.supplierName),
  );
}

export type InventorySummary = {
  itemCount: number;
  lowCount: number;
  countDue: boolean;
  openCount: { id: string; counted: number; total: number } | null;
};

export async function inventorySummary(db: Db, now: Date): Promise<InventorySummary> {
  const [business, rows, [lastFinished], [open]] = await Promise.all([
    getBusiness(db),
    stockRows(db),
    db
      .select({ at: inventoryCount.finishedAt })
      .from(inventoryCount)
      .where(eq(inventoryCount.status, "finished"))
      .orderBy(desc(inventoryCount.finishedAt))
      .limit(1),
    db
      .select({
        id: inventoryCount.id,
        counted: sql<number>`count(${inventoryCountLine.quantity})`.mapWith(Number),
        total: sql<number>`count(${inventoryCountLine.itemId})`.mapWith(Number),
      })
      .from(inventoryCount)
      .leftJoin(inventoryCountLine, eq(inventoryCountLine.countId, inventoryCount.id))
      .where(eq(inventoryCount.status, "open"))
      .groupBy(inventoryCount.id),
  ]);
  return {
    itemCount: rows.length,
    lowCount: rows.filter((r) => r.low).length,
    countDue:
      rows.length > 0 &&
      countDue({ now, weekday: business.countWeekday, timeZone: business.timeZone, lastFinishedAt: lastFinished?.at ?? null }),
    openCount: open ?? null,
  };
}
