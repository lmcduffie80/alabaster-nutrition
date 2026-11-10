import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge, Card, Field, inputClass, SectionTitle } from "@/components/ui";
import { getDb } from "@/db";
import { formatQuantity, itemTypeLabel, itemTypes } from "@/lib/domain/inventory";
import { listItems, listSpots, listSuppliers, type Item, type Spot, type Supplier } from "@/lib/server/inventory";
import { requireManager } from "@/lib/server/session";
import { ActionForm, SubmitButton } from "../../forms";
import { addItemAction, addSpotAction, setItemActiveAction, updateItemAction, updateSpotAction } from "../../inventory-actions";

export default async function ItemsPage() {
  await requireManager();
  const db = await getDb();
  const [items, spots, suppliers] = await Promise.all([
    listItems(db, { includeInactive: true }),
    listSpots(db),
    listSuppliers(db, { includeInactive: true }),
  ]);
  const active = items.filter((i) => i.active);
  const former = items.filter((i) => !i.active);

  return (
    <div>
      <SectionTitle>Storage spots</SectionTitle>
      <Card className="space-y-3">
        <p className="text-sm text-ink/70">The count on the iPad walks through these in order, so list them the way you walk the store.</p>
        {spots.length > 0 && (
          <div className="divide-y divide-ink/5 rounded-xl border border-ink/10">
            {spots.map((spot, index) => (
              <SpotRow key={spot.id} spot={spot} first={index === 0} last={index === spots.length - 1} />
            ))}
          </div>
        )}
        <ActionForm action={addSpotAction} resetOnSuccess className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label="New spot">
              <input name="name" required maxLength={40} placeholder="Back room, Fridge, Front counter…" className={inputClass} />
            </Field>
          </div>
          <SubmitButton variant="secondary">Add spot</SubmitButton>
        </ActionForm>
      </Card>

      <SectionTitle>Add an item</SectionTitle>
      <Card>
        {spots.length === 0 ? (
          <p className="text-sm text-ink/60">Add a storage spot first.</p>
        ) : (
          <ActionForm action={addItemAction} resetOnSuccess>
            <ItemFields spots={spots} suppliers={suppliers} />
            <div className="mt-3">
              <SubmitButton>Add item</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Card>

      <SectionTitle>Items ({active.length})</SectionTitle>
      <div className="space-y-2">
        {active.length === 0 && <p className="text-sm text-ink/50">No items yet.</p>}
        {active.map((item) => (
          <ItemCard key={item.id} item={item} spots={spots} suppliers={suppliers} />
        ))}
      </div>

      {former.length > 0 && (
        <>
          <SectionTitle>Former items</SectionTitle>
          <Card className="divide-y divide-ink/5 p-0">
            {former.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-ink/70">{item.name}</span>
                <ActionForm action={setItemActiveAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="active" value="true" />
                  <SubmitButton variant="quiet">Reactivate</SubmitButton>
                </ActionForm>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

function SpotRow({ spot, first, last }: { spot: Spot; first: boolean; last: boolean }) {
  return (
    <ActionForm action={updateSpotAction} className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input type="hidden" name="id" value={spot.id} />
      <input name="name" defaultValue={spot.name} required maxLength={40} aria-label="Spot name" className={`${inputClass} max-w-xs flex-1`} />
      <span className="text-xs text-ink/50">
        {spot.itemCount} {spot.itemCount === 1 ? "item" : "items"}
      </span>
      <span className="ml-auto flex gap-1">
        <SubmitButton variant="quiet" name="move" value="up" className={first ? "invisible" : ""}>
          <ArrowUp className="size-4" />
          <span className="sr-only">Move up</span>
        </SubmitButton>
        <SubmitButton variant="quiet" name="move" value="down" className={last ? "invisible" : ""}>
          <ArrowDown className="size-4" />
          <span className="sr-only">Move down</span>
        </SubmitButton>
        <SubmitButton variant="secondary">Rename</SubmitButton>
        {spot.itemCount === 0 && (
          <SubmitButton variant="quiet" name="remove" value="true">
            Remove
          </SubmitButton>
        )}
      </span>
    </ActionForm>
  );
}

function ItemFields({ item, spots, suppliers }: { item?: Item; spots: Spot[]; suppliers: Supplier[] }) {
  const choosable = suppliers.filter((s) => s.active || s.id === item?.supplierId);
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="sm:col-span-3">
        <Field label="Name">
          <input name="name" defaultValue={item?.name} required maxLength={80} placeholder="Vanilla protein" className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-1">
        <Field label="Type">
          <select name="type" defaultValue={item?.type ?? "ingredient"} className={inputClass}>
            {itemTypes.map((t) => (
              <option key={t} value={t}>
                {itemTypeLabel[t]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Counted in" hint="One unit, like tub, bag, or sleeve of 50 cups.">
          <input name="unit" defaultValue={item?.unit} required maxLength={40} placeholder="tub" className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Stored in">
          <select name="spotId" defaultValue={item?.spotId ?? spots[0]?.id} className={inputClass}>
            {spots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Supplier">
          <select name="supplierId" defaultValue={item?.supplierId ?? ""} className={inputClass}>
            <option value="">No supplier</option>
            {choosable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Supplier item code" hint="From their invoices. Optional.">
          <input name="supplierCode" defaultValue={item?.supplierCode ?? ""} maxLength={40} className={`${inputClass} font-mono`} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Reorder at" hint="Flag it when the count is this low.">
          <input name="reorderAt" defaultValue={item?.reorderAt ?? ""} required inputMode="decimal" className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Order up to" hint="Suggested orders bring it back to this.">
          <input name="orderUpTo" defaultValue={item?.orderUpTo ?? ""} required inputMode="decimal" className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-1">
        <Field label="Pack size" hint="Units per invoice case.">
          <input name="packSize" defaultValue={item?.packSize ?? 1} inputMode="decimal" className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-1">
        <Field label="Cost each" hint="Optional.">
          <input name="defaultUnitCost" defaultValue={item?.defaultUnitCost ?? ""} inputMode="decimal" placeholder="$" className={inputClass} />
        </Field>
      </div>
    </div>
  );
}

function ItemCard({ item, spots, suppliers }: { item: Item; spots: Spot[]; suppliers: Supplier[] }) {
  return (
    <Card className="p-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm">
          <span>
            <span className="font-medium">{item.name}</span>
            <span className="block text-xs text-ink/50">
              {item.spotName}
              {item.supplierName && ` · ${item.supplierName}`}
              {item.supplierCode && ` · ${item.supplierCode}`}
            </span>
          </span>
          <span className="flex items-center gap-2 text-ink/60">
            <Badge tone={item.type === "ingredient" ? "sage" : "neutral"}>{itemTypeLabel[item.type]}</Badge>
            <span className="hidden text-xs sm:inline">
              reorder at {formatQuantity(item.reorderAt, item.unit)}
            </span>
            <span className="text-porcelain group-open:hidden">Edit</span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-ink/5 px-4 py-4">
          <ActionForm action={updateItemAction}>
            <ItemFields item={item} spots={spots} suppliers={suppliers} />
            <div className="mt-3">
              <SubmitButton variant="secondary">Save</SubmitButton>
            </div>
          </ActionForm>
          <ActionForm action={setItemActiveAction} confirm={`Stop tracking ${item.name}? It comes off future counts; past counts keep it.`}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="active" value="false" />
            <SubmitButton variant="danger">Deactivate</SubmitButton>
          </ActionForm>
        </div>
      </details>
    </Card>
  );
}
