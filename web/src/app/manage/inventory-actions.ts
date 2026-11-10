"use server";

import {
  addItem,
  addSpot,
  addSupplier,
  cancelCount,
  moveSpot,
  removeSpot,
  renameSpot,
  setItemActive,
  setSupplierActive,
  updateItem,
  updateSupplier,
  deleteDelivery,
  recordDelivery,
  updateDelivery,
  type DeliveryInput,
  type ItemInput,
} from "@/lib/server/inventory";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UserError } from "@/lib/server/errors";
import { attachPhotos, MAX_SCAN_PAGES } from "@/lib/server/invoice-scan";
import { keepPhotos } from "@/lib/server/photo-store";
import { managerForm, text, type FormState } from "./manager-form";

const paths = ["/manage", "/kiosk"];

const linesSchema = z
  .array(
    z.object({
      itemId: z.string(),
      quantity: z.string(),
      lineTotal: z.string(),
      invoiceCode: z.string().optional(),
      invoiceDescription: z.string().optional(),
    }),
  )
  .max(200);

function deliveryInput(form: FormData): DeliveryInput {
  let lines: DeliveryInput["lines"];
  try {
    lines = linesSchema.parse(JSON.parse(text(form, "lines") || "[]"));
  } catch {
    throw new UserError("Add at least one item.");
  }
  return {
    supplierId: text(form, "supplierId"),
    invoiceNumber: text(form, "invoiceNumber"),
    invoiceTotal: text(form, "invoiceTotal"),
    receivedOn: text(form, "receivedOn"),
    onShelfForCount: text(form, "onShelfForCount") === "on",
    lines,
  };
}

function itemInput(form: FormData): ItemInput {
  return {
    name: text(form, "name"),
    type: text(form, "type"),
    unit: text(form, "unit"),
    spotId: text(form, "spotId"),
    supplierId: text(form, "supplierId"),
    supplierCode: text(form, "supplierCode"),
    packSize: text(form, "packSize"),
    reorderAt: text(form, "reorderAt"),
    orderUpTo: text(form, "orderUpTo"),
    defaultUnitCost: text(form, "defaultUnitCost"),
  };
}

function supplierInput(form: FormData) {
  return { name: text(form, "name"), contact: text(form, "contact"), notes: text(form, "notes") };
}

// Storage spots

export async function addSpotAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    await addSpot(db, text(form, "name"));
    return { success: "Spot added." };
  }, { paths });
}

export async function updateSpotAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    const id = text(form, "id");
    const move = text(form, "move");
    if (move === "up" || move === "down") return void (await moveSpot(db, id, move));
    if (text(form, "remove") === "true") {
      await removeSpot(db, id);
      return { success: "Spot removed." };
    }
    await renameSpot(db, id, text(form, "name"));
    return { success: "Saved." };
  }, { paths });
}

// Suppliers

export async function addSupplierAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    await addSupplier(db, supplierInput(form));
    return { success: `${text(form, "name").trim()} added.` };
  }, { paths });
}

export async function updateSupplierAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    const id = text(form, "id");
    const active = text(form, "active");
    if (active === "true" || active === "false") {
      await setSupplierActive(db, id, active === "true");
      return { success: active === "true" ? "Reactivated." : "Deactivated." };
    }
    await updateSupplier(db, id, supplierInput(form));
    return { success: "Saved." };
  }, { paths });
}

// Items

export async function addItemAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    await addItem(db, itemInput(form));
    return { success: `${text(form, "name").trim()} added.` };
  }, { paths });
}

export async function updateItemAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    await updateItem(db, text(form, "id"), itemInput(form));
    return { success: "Saved." };
  }, { paths });
}

export async function setItemActiveAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    const active = text(form, "active") === "true";
    await setItemActive(db, text(form, "id"), active);
    return { success: active ? "Reactivated." : "Deactivated. It won’t be on future counts." };
  }, { paths });
}

// Counts

export async function cancelCountAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    await cancelCount(db, text(form, "countId"), new Date());
    return { success: "Count cancelled. The next count starts fresh." };
  }, { paths });
}

// Deliveries

function photoIds(form: FormData) {
  try {
    const parsed = z.array(z.uuid()).max(MAX_SCAN_PAGES).safeParse(JSON.parse(text(form, "photoIds") || "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function recordDeliveryAction(_: FormState, form: FormData) {
  let id = "";
  let photos: string[] = [];
  const result = await managerForm(form, async (manager, db) => {
    const now = new Date();
    id = await recordDelivery(db, deliveryInput(form), { actor: manager.actor, now });
    photos = await attachPhotos(db, id, photoIds(form), now);
  }, { paths });
  if (result?.error) return result;
  try {
    await keepPhotos(photos);
  } catch (error) {
    console.error("Couldn't keep invoice photos; they'll expire in a day", error);
  }
  redirect(`/manage/inventory/deliveries/${id}`);
}

export async function updateDeliveryAction(_: FormState, form: FormData) {
  return managerForm(form, async (manager, db) => {
    await updateDelivery(db, text(form, "id"), deliveryInput(form), { actor: manager.actor, now: new Date(), reason: text(form, "reason") });
    return { success: "Saved." };
  }, { paths });
}

export async function deleteDeliveryAction(_: FormState, form: FormData) {
  const result = await managerForm(form, async (manager, db) => {
    await deleteDelivery(db, text(form, "id"), { actor: manager.actor, now: new Date(), reason: text(form, "reason") });
  }, { paths });
  if (result?.error) return result;
  redirect("/manage/inventory/deliveries");
}
