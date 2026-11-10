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
  type ItemInput,
} from "@/lib/server/inventory";
import { managerForm, text, type FormState } from "./manager-form";

const paths = ["/manage", "/kiosk"];

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
