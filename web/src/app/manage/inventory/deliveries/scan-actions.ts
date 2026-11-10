"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { localDateOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { UserError } from "@/lib/server/errors";
import { addItem, addSupplier, listItems, type ItemInput } from "@/lib/server/inventory";
import { readInvoice } from "@/lib/server/invoice-reader";
import {
  addPhotos,
  forgetExpiredPhotos,
  matchInvoice,
  MAX_SCAN_PAGES,
  recordScan,
  scansInLastDay,
  SCANS_PER_DAY,
  type ScanPrefill,
} from "@/lib/server/invoice-scan";
import { storePhoto } from "@/lib/server/photo-store";
import { requireManager } from "@/lib/server/session";
import type { PickableItem, PickableSupplier } from "./delivery-form";

export type ScanResult =
  | { kind: "read"; prefill: ScanPrefill; photoIds: string[] }
  | { kind: "unreadable"; photoIds: string[] }
  | { kind: "error"; message: string };

const MAX_PHOTO_BYTES = 1_500_000;

/** Stores the pages, reads them with OpenAI, and matches what was read against suppliers and items. */
export async function scanInvoiceAction(form: FormData): Promise<ScanResult> {
  const manager = await requireManager();
  const db = await getDb();
  const now = new Date();

  const files = form.getAll("photo").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { kind: "error", message: "Choose a photo of the invoice." };
  if (files.length > MAX_SCAN_PAGES) return { kind: "error", message: `Scan up to ${MAX_SCAN_PAGES} pages at a time.` };
  if (files.some((f) => f.type !== "image/jpeg" || f.size > MAX_PHOTO_BYTES)) {
    return { kind: "error", message: "One of the photos couldn't be used. Try taking it again." };
  }
  if ((await scansInLastDay(db, now)) >= SCANS_PER_DAY) {
    return { kind: "error", message: `That's ${SCANS_PER_DAY} scans in the last day. Enter this one by hand, or try again tomorrow.` };
  }

  const pages = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  await forgetExpiredPhotos(db, now);
  let photoIds: string[];
  try {
    photoIds = await addPhotos(db, await Promise.all(pages.map(storePhoto)), { actor: manager.actor, now });
  } catch (error) {
    console.error("Invoice photo upload failed", error);
    return { kind: "error", message: "Couldn't upload the photos. Check the connection and try again." };
  }

  try {
    const reading = await readInvoice(pages);
    await recordScan(db, { actor: manager.actor, at: now, ok: true });
    const today = localDateOf(now, (await getBusiness(db)).timeZone);
    return { kind: "read", prefill: await matchInvoice(db, reading, today), photoIds };
  } catch (error) {
    console.error("Invoice reading failed", error);
    await recordScan(db, { actor: manager.actor, at: now, ok: false });
    return { kind: "unreadable", photoIds };
  }
}

type Quick<T> = { ok: true; value: T } | { ok: false; error: string };

async function quick<T>(work: () => Promise<T>): Promise<Quick<T>> {
  try {
    const value = await work();
    revalidatePath("/manage", "layout");
    return { ok: true, value };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    throw error;
  }
}

/** For a supplier named on an invoice that isn't in the list yet. */
export async function quickAddSupplierAction(name: string): Promise<Quick<PickableSupplier>> {
  await requireManager();
  const db = await getDb();
  return quick(async () => ({ id: await addSupplier(db, { name, contact: "", notes: "" }), name: name.trim() }));
}

/** For an invoice line that isn't an item yet. */
export async function quickAddItemAction(input: ItemInput): Promise<Quick<PickableItem>> {
  await requireManager();
  const db = await getDb();
  return quick(async () => {
    const id = await addItem(db, input);
    const item = (await listItems(db)).find((i) => i.id === id)!;
    return { id, name: item.name, unit: item.unit, supplierId: item.supplierId, packSize: item.packSize };
  });
}
