import "server-only";
import type { Db } from "@/db";
import { listItems, listSpots, listSuppliers } from "@/lib/server/inventory";
import type { PickableItem, PickableSpot, PickableSupplier } from "./delivery-form";

/** Active choices, plus any inactive ones a delivery being edited already uses. */
export async function deliveryPickers(db: Db, keep: { supplierId?: string; itemIds?: string[] } = {}) {
  const [items, suppliers, spots] = await Promise.all([
    listItems(db, { includeInactive: true }),
    listSuppliers(db, { includeInactive: true }),
    listSpots(db),
  ]);
  const pickableItems: PickableItem[] = items
    .filter((i) => i.active || keep.itemIds?.includes(i.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => ({ id: i.id, name: i.name, unit: i.unit, supplierId: i.supplierId, packSize: i.packSize }));
  const pickableSuppliers: PickableSupplier[] = suppliers
    .filter((s) => s.active || s.id === keep.supplierId)
    .map((s) => ({ id: s.id, name: s.name }));
  const pickableSpots: PickableSpot[] = spots.map((s) => ({ id: s.id, name: s.name }));
  return { items: pickableItems, suppliers: pickableSuppliers, spots: pickableSpots };
}
