"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Field, inputClass } from "@/components/ui";
import { formatMoney, itemTypeLabel, itemTypes, parseMoney, round2 } from "@/lib/domain/inventory";
import type { FormState } from "../../actions";
import { ActionForm, SubmitButton } from "../../forms";
import { quickAddItemAction, quickAddSupplierAction } from "./scan-actions";

export type PickableItem = { id: string; name: string; unit: string; supplierId: string | null; packSize: number };
export type PickableSupplier = { id: string; name: string };
export type PickableSpot = { id: string; name: string };

type LineValues = {
  itemId: string;
  quantity: string;
  lineTotal: string;
  invoiceCode?: string;
  invoiceDescription?: string;
  /** From a scan: the invoice's quantity, converted with the chosen item's pack size. */
  invoiceQuantity?: number | null;
};
type Line = LineValues & { key: number };

export type DeliveryFormValues = {
  id?: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceTotal: string;
  receivedOn: string;
  onShelfForCount: boolean;
  lines: LineValues[];
  /** From a scan. */
  unknownSupplier?: string | null;
  duplicate?: boolean;
  photoIds?: string[];
};

let nextKey = 1;
const blankLine = (): Line => ({ key: nextKey++, itemId: "", quantity: "", lineTotal: "" });

function money(value: string) {
  try {
    return parseMoney(value);
  } catch {
    return null;
  }
}

export function DeliveryForm({
  action,
  items: initialItems,
  suppliers: initialSuppliers,
  spots,
  initial,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  items: PickableItem[];
  suppliers: PickableSupplier[];
  spots: PickableSpot[];
  initial: DeliveryFormValues;
  submitLabel: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [unknownSupplier, setUnknownSupplier] = useState(initial.unknownSupplier ?? null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [receivedOn, setReceivedOn] = useState(initial.receivedOn);
  const [invoiceNumber, setInvoiceNumber] = useState(initial.invoiceNumber);
  const [invoiceTotal, setInvoiceTotal] = useState(initial.invoiceTotal);
  const [onShelf, setOnShelf] = useState(initial.onShelfForCount);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    initial.lines.length ? initial.lines.map((line) => ({ ...line, key: nextKey++ })) : [blankLine()],
  );
  const [creatingFor, setCreatingFor] = useState<number | null>(null);

  const editing = Boolean(initial.id);
  const theirs = items.filter((i) => i.supplierId === supplierId);
  const others = items.filter((i) => i.supplierId !== supplierId);
  const itemOf = (itemId: string) => items.find((i) => i.id === itemId);

  const update = (key: number, change: Partial<Line>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const choose = (line: Line, item: PickableItem | undefined) =>
    update(line.key, {
      itemId: item?.id ?? "",
      ...(item && line.invoiceQuantity != null ? { quantity: String(round2(line.invoiceQuantity * item.packSize)) } : {}),
    });

  const total = round2(lines.reduce((sum, l) => sum + (money(l.lineTotal) ?? 0), 0));
  const expected = money(invoiceTotal);
  const mismatch = expected !== null && Math.abs(expected - total) > 0.01;
  const unmatched = lines.filter((l) => !l.itemId && l.invoiceDescription).length;

  async function addSupplier(name: string) {
    setSupplierError(null);
    const result = await quickAddSupplierAction(name);
    if (!result.ok) return setSupplierError(result.error);
    setSuppliers((all) => [...all, result.value].sort((a, b) => a.name.localeCompare(b.name)));
    setSupplierId(result.value.id);
    setUnknownSupplier(null);
  }

  return (
    <ActionForm action={action} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="lines" value={JSON.stringify(lines, (name, value) => (name === "key" ? undefined : value))} />
      {initial.photoIds && <input type="hidden" name="photoIds" value={JSON.stringify(initial.photoIds)} />}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label="Supplier">
            <select name="supplierId" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required className={inputClass}>
              <option value="">Choose…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          {unknownSupplier && !supplierId && (
            <p className="mt-1 text-xs text-ink/70">
              The invoice says <strong>{unknownSupplier}</strong>, which isn&rsquo;t in your list.{" "}
              <button type="button" onClick={() => void addSupplier(unknownSupplier)} className="font-semibold text-porcelain hover:underline">
                Add it as a supplier
              </button>
              {supplierError && <span className="block text-red-700">{supplierError}</span>}
            </p>
          )}
        </div>
        <Field label="Received">
          <input type="date" name="receivedOn" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} required className={inputClass} />
        </Field>
        <Field label="Invoice #" hint="Optional.">
          <input name="invoiceNumber" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={40} className={inputClass} />
        </Field>
      </div>
      {initial.duplicate && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">This invoice number from this supplier is already recorded.</p>
      )}

      <div>
        <div className="mb-1 hidden grid-cols-[1fr_8rem_7rem_2rem] gap-2 text-xs font-medium text-ink/60 sm:grid">
          <span>Item</span>
          <span>Quantity received</span>
          <span>Line total</span>
        </div>
        <div className="space-y-2">
          {lines.map((line) => {
            const item = itemOf(line.itemId);
            return (
              <div key={line.key} className="rounded-xl border border-ink/10 p-2 sm:border-0 sm:p-0">
                <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_8rem_7rem_2rem]">
                  <div className="col-span-2 sm:col-span-1">
                    <select aria-label="Item" value={line.itemId} onChange={(e) => choose(line, itemOf(e.target.value))} className={inputClass}>
                      <option value="">Choose an item…</option>
                      {theirs.length > 0 && (
                        <optgroup label="From this supplier">
                          {theirs.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label={theirs.length ? "Other items" : "Items"}>
                        {others.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    {line.invoiceDescription && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink/50">
                        {!line.itemId && <Badge tone="red">Unmatched</Badge>}
                        <span>
                          Invoice: {line.invoiceCode && <span className="font-mono">{line.invoiceCode} </span>}
                          {line.invoiceDescription}
                          {line.invoiceQuantity != null && ` × ${line.invoiceQuantity}`}
                        </span>
                        {!line.itemId && (
                          <button type="button" onClick={() => setCreatingFor(line.key)} className="font-semibold text-porcelain hover:underline">
                            New item
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                  <label className="flex items-center gap-1.5">
                    <input
                      aria-label="Quantity received"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) => update(line.key, { quantity: e.target.value })}
                      placeholder="0"
                      className={`${inputClass} text-right`}
                    />
                    <span className="w-12 truncate text-xs text-ink/50">{item?.unit ?? ""}</span>
                  </label>
                  <input
                    aria-label="Line total"
                    inputMode="decimal"
                    value={line.lineTotal}
                    onChange={(e) => update(line.key, { lineTotal: e.target.value })}
                    placeholder="$"
                    className={`${inputClass} text-right`}
                  />
                  <Button
                    variant="quiet"
                    onClick={() => setLines(lines.length > 1 ? lines.filter((l) => l.key !== line.key) : [blankLine()])}
                    className="px-1"
                  >
                    <X className="size-4" />
                    <span className="sr-only">{line.invoiceDescription ? "Ignore this line" : "Remove line"}</span>
                  </Button>
                </div>
                {creatingFor === line.key && (
                  <NewItem
                    line={line}
                    supplierId={supplierId}
                    spots={spots}
                    onCancel={() => setCreatingFor(null)}
                    onCreated={(created) => {
                      setItems((all) => [...all, created].sort((a, b) => a.name.localeCompare(b.name)));
                      choose(line, created);
                      setCreatingFor(null);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <Button variant="quiet" onClick={() => setLines([...lines, blankLine()])}>
            <Plus className="size-4" /> Add a line
          </Button>
          <span className="text-sm">
            Total: <strong className="tabular-nums">{formatMoney(total)}</strong>
          </span>
        </div>
        {unmatched > 0 && (
          <p className="mt-1 text-sm font-medium text-red-700">
            {unmatched} {unmatched === 1 ? "line isn't" : "lines aren't"} matched to an item. Choose one, add a new item, or tap ✕ to ignore it
            (fees, things you don&rsquo;t track).
          </p>
        )}
        <p className="mt-1 text-xs text-ink/50">
          Quantities are in the unit you count (if a case holds 20 sleeves, 2 cases is 40). Leave the line total blank if you don&rsquo;t
          have a price.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Invoice total" hint="Optional. Lets you check the lines add up.">
          <input name="invoiceTotal" value={invoiceTotal} onChange={(e) => setInvoiceTotal(e.target.value)} inputMode="decimal" placeholder="$" className={inputClass} />
          {mismatch && (
            <p className="mt-1 text-xs font-medium text-red-700">
              The lines add up to {formatMoney(total)}, not {formatMoney(expected)}.
            </p>
          )}
        </Field>
        <label className="flex items-start gap-2 pt-6 text-sm">
          <input type="checkbox" name="onShelfForCount" checked={onShelf} onChange={(e) => setOnShelf(e.target.checked)} className="mt-1" />
          <span>
            Already on the shelf for that day&rsquo;s count
            <span className="block text-xs text-ink/50">Only matters if a count was finished the same day it arrived.</span>
          </span>
        </label>
      </div>

      {editing && (
        <Field label="Reason for the change">
          <input
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={200}
            placeholder="Short one tub, wrong price…"
            className={inputClass}
          />
        </Field>
      )}
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

/** Adds an invoice line's product as a new item, with this supplier's code so the next scan matches it. */
function NewItem({
  line,
  supplierId,
  spots,
  onCreated,
  onCancel,
}: {
  line: Line;
  supplierId: string;
  spots: PickableSpot[];
  onCreated: (item: PickableItem) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    name: line.invoiceDescription?.slice(0, 80) ?? "",
    type: "ingredient",
    unit: "",
    spotId: spots[0]?.id ?? "",
    packSize: "1",
    reorderAt: "",
    orderUpTo: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (name: keyof typeof values) => (e: { target: { value: string } }) => setValues({ ...values, [name]: e.target.value });

  async function save() {
    setSaving(true);
    setError(null);
    const result = await quickAddItemAction({
      ...values,
      supplierId,
      supplierCode: supplierId ? (line.invoiceCode ?? "") : "",
      defaultUnitCost: "",
    });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onCreated(result.value);
  }

  return (
    <div className="mt-2 rounded-xl bg-porcelain-light/50 p-3">
      <p className="mb-2 text-sm font-semibold">New item</p>
      <div className="grid gap-2 sm:grid-cols-6">
        <div className="sm:col-span-3">
          <Field label="Name">
            <input value={values.name} onChange={set("name")} maxLength={80} className={inputClass} />
          </Field>
        </div>
        <Field label="Type">
          <select value={values.type} onChange={set("type")} className={inputClass}>
            {itemTypes.map((t) => (
              <option key={t} value={t}>
                {itemTypeLabel[t]}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Counted in" hint="Like tub, bag, sleeve.">
            <input value={values.unit} onChange={set("unit")} maxLength={40} className={inputClass} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Stored in">
            <select value={values.spotId} onChange={set("spotId")} className={inputClass}>
              {spots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Pack size" hint="Per invoice unit.">
          <input value={values.packSize} onChange={set("packSize")} inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="Reorder at">
          <input value={values.reorderAt} onChange={set("reorderAt")} inputMode="decimal" className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Order up to">
            <input value={values.orderUpTo} onChange={set("orderUpTo")} inputMode="decimal" className={inputClass} />
          </Field>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Adding…" : "Add item"}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
