import "server-only";
import { and, count, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { round2 } from "@/lib/domain/inventory";
import { isLocalDate, type LocalDate } from "@/lib/domain/time";
import type { InvoiceReading } from "./invoice-reader";
import { listItems, listSuppliers } from "./inventory";

const { delivery, invoicePhoto, invoiceScan } = schema;

export const MAX_SCAN_PAGES = 5;
export const SCANS_PER_DAY = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ScannedLine = {
  itemId: string;
  quantity: string;
  lineTotal: string;
  invoiceCode?: string;
  invoiceDescription?: string;
  /** As printed; converted with the chosen item's pack size. */
  invoiceQuantity: number | null;
  invoiceUnit?: string;
};

export type ScanPrefill = {
  supplierId: string;
  /** The name on the invoice when it doesn't match a supplier. */
  unknownSupplier: string | null;
  invoiceNumber: string;
  invoiceTotal: string;
  receivedOn: LocalDate;
  duplicate: boolean;
  lines: ScannedLine[];
};

const SUFFIXES = /\b(inc|llc|ltd|co|corp|corporation|company|foods?|distribution|distributors?)\b/g;

function simplify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(SUFFIXES, " ").replace(/\s+/g, "");
}

export function sameSupplier(onInvoice: string, ours: string) {
  const a = simplify(onInvoice);
  const b = simplify(ours);
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));
}

const code = (value: string | null | undefined) => value?.trim().toLowerCase() || null;
const amount = (value: number | null) => (value === null ? "" : String(round2(value)));

/** Turns what the model read into a delivery form: matched supplier, items by code, quantities in count units. */
export async function matchInvoice(db: Db, reading: InvoiceReading, today: LocalDate): Promise<ScanPrefill> {
  const [suppliers, items] = await Promise.all([listSuppliers(db), listItems(db)]);
  const found = reading.supplierName ? suppliers.find((s) => sameSupplier(reading.supplierName!, s.name)) : undefined;
  const supplierId = found?.id ?? "";

  const lines = reading.lines.map((line): ScannedLine => {
    const lineCode = code(line.itemCode);
    const description = line.description.trim().toLowerCase();
    const item =
      (lineCode && items.find((i) => i.supplierId === supplierId && code(i.supplierCode) === lineCode)) ||
      items.find((i) => i.name.toLowerCase() === description);
    return {
      itemId: item?.id ?? "",
      quantity: item && line.quantity !== null ? amount(line.quantity * item.packSize) : "",
      lineTotal: amount(line.lineTotal ?? (line.quantity !== null && line.unitPrice !== null ? line.quantity * line.unitPrice : null)),
      invoiceCode: line.itemCode?.trim() || undefined,
      invoiceDescription: line.description.trim() || undefined,
      invoiceQuantity: line.quantity,
      invoiceUnit: line.invoiceUnit?.trim() || undefined,
    };
  });

  const invoiceNumber = reading.invoiceNumber?.trim() ?? "";
  let duplicate = false;
  if (supplierId && invoiceNumber) {
    const [row] = await db
      .select({ id: delivery.id })
      .from(delivery)
      .where(
        and(
          eq(delivery.supplierId, supplierId),
          isNull(delivery.deletedAt),
          eq(sql`lower(${delivery.invoiceNumber})`, invoiceNumber.toLowerCase()),
        ),
      );
    duplicate = Boolean(row);
  }

  const date = reading.invoiceDate?.trim() ?? "";
  return {
    supplierId,
    unknownSupplier: found ? null : reading.supplierName?.trim() || null,
    invoiceNumber,
    invoiceTotal: amount(reading.invoiceTotal),
    receivedOn: isLocalDate(date) && date <= today ? date : today,
    duplicate,
    lines,
  };
}

export async function scansInLastDay(db: Db, now: Date) {
  const [row] = await db
    .select({ n: count() })
    .from(invoiceScan)
    .where(gt(invoiceScan.at, new Date(now.getTime() - DAY_MS)));
  return row.n;
}

export async function recordScan(db: Db, input: { actor: string; at: Date; ok: boolean }) {
  await db.insert(invoiceScan).values(input);
}

export async function addPhotos(db: Db, pathnames: string[], who: { actor: string; now: Date }) {
  const rows = await db
    .insert(invoicePhoto)
    .values(pathnames.map((pathname, index) => ({ pathname, page: index + 1, uploadedBy: who.actor, uploadedAt: who.now })))
    .returning({ id: invoicePhoto.id });
  return rows.map((r) => r.id);
}

/** Rows whose blobs have expired. */
export async function forgetExpiredPhotos(db: Db, now: Date) {
  await db.delete(invoicePhoto).where(and(isNull(invoicePhoto.deliveryId), lt(invoicePhoto.uploadedAt, new Date(now.getTime() - DAY_MS))));
}

/** Attaches this scan's photos to a saved delivery; returns their pathnames so their expiry can be cleared. */
export async function attachPhotos(db: Db, deliveryId: string, photoIds: string[], now: Date) {
  if (photoIds.length === 0) return [];
  const rows = await db
    .update(invoicePhoto)
    .set({ deliveryId })
    .where(
      and(
        inArray(invoicePhoto.id, photoIds),
        isNull(invoicePhoto.deliveryId),
        gt(invoicePhoto.uploadedAt, new Date(now.getTime() - DAY_MS)),
      ),
    )
    .returning({ pathname: invoicePhoto.pathname });
  return rows.map((r) => r.pathname);
}

export async function getPhoto(db: Db, id: string) {
  const [row] = await db.select().from(invoicePhoto).where(eq(invoicePhoto.id, id));
  return row ?? null;
}

export async function deliveryPhotos(db: Db, deliveryId: string) {
  return db
    .select({ id: invoicePhoto.id, page: invoicePhoto.page })
    .from(invoicePhoto)
    .where(eq(invoicePhoto.deliveryId, deliveryId))
    .orderBy(invoicePhoto.page);
}
