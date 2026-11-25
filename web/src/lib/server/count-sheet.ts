import "server-only";
import type { Db } from "@/db";
import { addItemToCount, enterCountLines, finishCount } from "./inventory";
import { alertLowStock } from "./low-stock";
import { siteOrigin } from "./origin";

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export async function addCountSheetItem(db: Db, form: FormData, employeeId: string) {
  const { name, added } = await addItemToCount(db, {
    countId: field(form, "countId"),
    code: field(form, "code"),
    name: field(form, "name"),
    unit: field(form, "unit"),
    quantity: field(form, "quantity"),
    employeeId,
    now: new Date(),
  });
  return { success: added ? `${name} added as a new item and counted.` : `${name} added to this count.` };
}

/**
 * Saves the count sheet, and finishes the count when its "Save and finish" button sent it.
 * Fields come as `q:<itemId>` (what was typed) and `p:<itemId>` (what the page showed).
 */
export async function saveCountSheet(db: Db, form: FormData, employeeId: string) {
  const countId = field(form, "countId");
  const lines = [...form.keys()]
    .filter((key) => key.startsWith("q:"))
    .map((key) => {
      const itemId = key.slice(2);
      return { itemId, quantity: field(form, key), previous: field(form, `p:${itemId}`) };
    });
  const now = new Date();
  const saved = await enterCountLines(db, { countId, lines, employeeId, now });
  if (field(form, "intent") !== "finish") {
    return { success: saved ? `Saved ${saved} item${saved === 1 ? "" : "s"}.` : "Nothing new to save." };
  }
  const { skipped } = await finishCount(db, { countId, employeeId, now });
  await alertLowStock(db, { employeeId, origin: await siteOrigin() });
  return { success: skipped ? `Count finished. ${skipped} item${skipped === 1 ? " was" : "s were"} skipped.` : "Count finished." };
}
