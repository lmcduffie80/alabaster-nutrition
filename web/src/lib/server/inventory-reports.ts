import "server-only";
import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { toCsv } from "@/lib/domain/csv";
import {
  itemTypeLabel,
  itemTypes,
  round2,
  usageFlag,
  usagePeriods,
  type FinishedCount,
  type ItemType,
} from "@/lib/domain/inventory";
import { addDays, localDateOf, weekStartOf, type LocalDate } from "@/lib/domain/time";
import { getBusiness } from "./business";
import { liveDeliveryLines, listItems, startingStock, stockRows } from "./inventory";

const { inventoryCount, inventoryCountLine, delivery, deliveryLine, supplier } = schema;

// Usage

export type UsageLine = {
  itemId: string;
  name: string;
  type: ItemType;
  unit: string;
  start: number | null;
  received: number;
  end: number | null;
  used: number | null;
  cost: number | null;
  flag: "mismatch" | "high" | null;
};

export type UsageReport = {
  /** Newest first. */
  periods: { toCountId: string; from: LocalDate; to: LocalDate }[];
  period: { toCountId: string; from: LocalDate; to: LocalDate } | null;
  lines: UsageLine[];
  costByType: Record<ItemType, number>;
};

async function finishedCounts(db: Db, timeZone: string): Promise<FinishedCount[]> {
  const rows = await db
    .select({ id: inventoryCount.id, finishedAt: inventoryCount.finishedAt, itemId: inventoryCountLine.itemId, quantity: inventoryCountLine.quantity })
    .from(inventoryCount)
    .innerJoin(inventoryCountLine, eq(inventoryCountLine.countId, inventoryCount.id))
    .where(eq(inventoryCount.status, "finished"))
    .orderBy(asc(inventoryCount.finishedAt));
  const counts = new Map<string, FinishedCount>();
  for (const row of rows) {
    const count = counts.get(row.id) ?? { id: row.id, countedOn: localDateOf(row.finishedAt!, timeZone), quantities: new Map() };
    count.quantities.set(row.itemId, row.quantity);
    counts.set(row.id, count);
  }
  return [...counts.values()];
}

/** One period of usage (the latest, unless `toCountId` picks another), flagged against the item's history. */
export async function usageReport(db: Db, toCountId?: string): Promise<UsageReport> {
  const { timeZone } = await getBusiness(db);
  const [counts, deliveries, items, stock] = await Promise.all([
    finishedCounts(db, timeZone),
    liveDeliveryLines(db),
    listItems(db, { includeInactive: true }),
    stockRows(db),
  ]);
  const starting = new Map(items.flatMap((item) => {
    const stock = startingStock(item);
    return stock ? [[item.id, stock] as const] : [];
  }));
  const periods = usagePeriods(counts, deliveries, starting);
  const costs = new Map(stock.map((r) => [r.id, r.unitCost]));
  const index = toCountId ? periods.findIndex((p) => p.toCountId === toCountId) : periods.length - 1;
  const current = periods[index];
  const costByType = Object.fromEntries(itemTypes.map((t) => [t, 0])) as Record<ItemType, number>;
  const summary = (p: (typeof periods)[number]) => ({ toCountId: p.toCountId, from: p.from, to: p.to });
  if (!current) return { periods: periods.map(summary).reverse(), period: null, lines: [], costByType };

  const lines: UsageLine[] = [];
  for (const item of items) {
    const line = current.lines.get(item.id);
    if (!line) continue;
    const history = periods.slice(0, index).map((p) => p.lines.get(item.id)?.used ?? null);
    const cost = costs.get(item.id) ?? item.defaultUnitCost;
    const lineCost = line.used !== null && cost !== null ? round2(line.used * cost) : null;
    if (lineCost !== null && lineCost > 0) costByType[item.type] = round2(costByType[item.type] + lineCost);
    lines.push({ itemId: item.id, name: item.name, type: item.type, unit: item.unit, ...line, cost: lineCost, flag: usageFlag(line.used, history) });
  }
  return { periods: periods.map(summary).reverse(), period: summary(current), lines, costByType };
}

export function usageCsv(report: UsageReport) {
  return toCsv([
    ["Item", "Type", "Unit", "Start", "Received", "End", "Used", "Cost", "Flag"],
    ...report.lines.map((l) => [
      l.name,
      itemTypeLabel[l.type],
      l.unit,
      l.start,
      l.received,
      l.end,
      l.used ?? "Not counted",
      l.cost,
      l.flag === "high" ? "Higher than usual" : l.flag === "mismatch" ? "Count mismatch" : "",
    ]),
  ]);
}

// Spending

export type SpendingBy = "week" | "month";
export type SpendingBucket = {
  /** Monday of the week, or the first of the month. */
  start: LocalDate;
  total: number;
  suppliers: { name: string; deliveries: number; total: number }[];
};

const BUCKETS = 12;

function bucketOf(date: LocalDate, by: SpendingBy): LocalDate {
  return by === "week" ? weekStartOf(date) : `${date.slice(0, 7)}-01`;
}

/** Delivery totals for the last 12 weeks or months, newest first. */
export async function spendingReport(db: Db, by: SpendingBy, now: Date): Promise<SpendingBucket[]> {
  const today = localDateOf(now, (await getBusiness(db)).timeZone);
  const from = by === "week" ? addDays(weekStartOf(today), -7 * (BUCKETS - 1)) : monthsBack(today, BUCKETS - 1);
  const rows = await db
    .select({
      deliveryId: delivery.id,
      receivedOn: delivery.receivedOn,
      supplierName: supplier.name,
      total: sql<number>`coalesce(sum(${deliveryLine.lineTotal}), 0)`.mapWith(Number),
    })
    .from(delivery)
    .innerJoin(supplier, eq(supplier.id, delivery.supplierId))
    .leftJoin(deliveryLine, eq(deliveryLine.deliveryId, delivery.id))
    .where(and(isNull(delivery.deletedAt), gte(delivery.receivedOn, from)))
    .groupBy(delivery.id, supplier.name)
    .orderBy(desc(delivery.receivedOn));

  const buckets = new Map<LocalDate, SpendingBucket>();
  for (const row of rows) {
    const start = bucketOf(row.receivedOn, by);
    const bucket = buckets.get(start) ?? { start, total: 0, suppliers: [] };
    const entry = bucket.suppliers.find((s) => s.name === row.supplierName);
    if (entry) {
      entry.deliveries += 1;
      entry.total = round2(entry.total + row.total);
    } else {
      bucket.suppliers.push({ name: row.supplierName, deliveries: 1, total: round2(row.total) });
    }
    bucket.total = round2(bucket.total + row.total);
    buckets.set(start, bucket);
  }
  for (const bucket of buckets.values()) bucket.suppliers.sort((a, b) => b.total - a.total);
  return [...buckets.values()].sort((a, b) => b.start.localeCompare(a.start));
}

function monthsBack(date: LocalDate, months: number): LocalDate {
  const [year, month] = date.split("-").map(Number);
  const index = year * 12 + (month - 1) - months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

export function spendingCsv(buckets: SpendingBucket[], by: SpendingBy) {
  return toCsv([
    [by === "week" ? "Week of" : "Month", "Supplier", "Deliveries", "Total"],
    ...buckets.flatMap((b) => b.suppliers.map((s) => [by === "week" ? b.start : b.start.slice(0, 7), s.name, s.deliveries, s.total])),
  ]);
}

// Stock

export async function stockCsv(db: Db) {
  const rows = await stockRows(db);
  return toCsv([
    ["Item", "Type", "Stored in", "Supplier", "On hand", "Unit", "Cost each", "Value", "Running low"],
    ...rows.map((r) => [
      r.name,
      itemTypeLabel[r.type],
      r.spotName,
      r.supplierName ?? "",
      r.onHand ?? "Not counted",
      r.unit,
      r.unitCost === null ? "" : round2(r.unitCost),
      r.value,
      r.low ? "yes" : "",
    ]),
  ]);
}
