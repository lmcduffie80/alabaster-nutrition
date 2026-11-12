"use client";

import { useState } from "react";
import { Card, Field, inputClass } from "@/components/ui";
import { formatMoney, itemTypeLabel, itemTypes, parseMoney, round2 } from "@/lib/domain/inventory";
import { ActionForm, SubmitButton } from "../../../forms";
import { createItemsFromReceiptAction } from "../../../inventory-actions";
import type { PickableItem, PickableSpot, PickableSupplier } from "../../deliveries/delivery-form";
import { quickAddSupplierAction } from "../../deliveries/scan-actions";
import { MAX_SCAN_PHOTOS, ScanCard } from "../../deliveries/scan-card";

type NewLine = {
  key: number;
  include: boolean;
  invoiceCode: string;
  invoiceDescription: string;
  invoiceQuantity: number | null;
  invoiceUnit: string;
  name: string;
  type: string;
  unit: string;
  spotId: string;
  packSize: string;
  received: string;
  onHand: string;
  /** Once typed, "on hand" stops following "received". */
  onHandTyped: boolean;
  lineTotal: string;
  reorderAt: string;
  orderUpTo: string;
};

type ExistingLine = {
  key: number;
  include: boolean;
  itemId: string;
  quantity: string;
  lineTotal: string;
  invoiceCode: string;
  invoiceDescription: string;
};

type Receipt = {
  supplierId: string;
  unknownSupplier: string | null;
  invoiceNumber: string;
  invoiceTotal: string;
  receivedOn: string;
  duplicate: boolean;
  photoIds: string[];
  created: NewLine[];
  existing: ExistingLine[];
};

let nextKey = 1;

function times(quantity: number | null, packSize: string) {
  const pack = Number(packSize);
  return quantity === null || !Number.isFinite(pack) || pack <= 0 ? "" : String(round2(quantity * pack));
}

export function ReceiptItems({
  items,
  suppliers: initialSuppliers,
  spots,
}: {
  items: PickableItem[];
  suppliers: PickableSupplier[];
  spots: PickableSpot[];
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const nameOf = (itemId: string) => items.find((i) => i.id === itemId);

  const change = (update: Partial<Receipt>) => setReceipt((r) => (r ? { ...r, ...update } : r));
  const changeLine = (key: number, update: Partial<NewLine>) =>
    setReceipt((r) => {
      if (!r) return r;
      return {
        ...r,
        created: r.created.map((line) => {
          if (line.key !== key) return line;
          const next = { ...line, ...update };
          if (update.packSize !== undefined) next.received = times(line.invoiceQuantity, update.packSize);
          if (!next.onHandTyped && (update.packSize !== undefined || update.received !== undefined)) next.onHand = next.received;
          return next;
        }),
      };
    });

  async function addSupplier(name: string) {
    setSupplierError(null);
    const result = await quickAddSupplierAction(name);
    if (!result.ok) return setSupplierError(result.error);
    setSuppliers((all) => [...all, result.value].sort((a, b) => a.name.localeCompare(b.name)));
    change({ supplierId: result.value.id, unknownSupplier: null });
  }

  const included = receipt?.created.filter((l) => l.include) ?? [];
  const existing = receipt?.existing.filter((l) => l.include) ?? [];
  const total = round2(
    [...included.map((l) => l.lineTotal), ...existing.map((l) => l.lineTotal)].reduce((sum, value) => {
      try {
        return sum + (parseMoney(value) ?? 0);
      } catch {
        return sum;
      }
    }, 0),
  );

  return (
    <div className="space-y-3">
      <ScanCard
        title="Scan an itemized receipt"
        hint={`Take a photo of each page (up to ${MAX_SCAN_PHOTOS}). Each product becomes a new item with its code and what's on hand.`}
        buttonLabel={receipt ? "Scan another" : "Scan receipt"}
        onScanned={(result) => {
          if (result.kind === "unreadable") {
            return { tone: "error", message: "Couldn't read this receipt. Try a sharper, flatter photo, or add items by hand on the Items page." };
          }
          const { prefill } = result;
          const created: NewLine[] = [];
          const matched: ExistingLine[] = [];
          for (const line of prefill.lines) {
            const base = { key: nextKey++, include: true, invoiceCode: line.invoiceCode ?? "", invoiceDescription: line.invoiceDescription ?? "" };
            if (line.itemId) {
              matched.push({ ...base, itemId: line.itemId, quantity: line.quantity, lineTotal: line.lineTotal });
              continue;
            }
            const received = times(line.invoiceQuantity, "1");
            created.push({
              ...base,
              invoiceQuantity: line.invoiceQuantity,
              invoiceUnit: line.invoiceUnit ?? "",
              name: (line.invoiceDescription ?? "").slice(0, 80),
              type: "ingredient",
              unit: (line.invoiceUnit ?? "").toLowerCase().slice(0, 40),
              spotId: spots[0]?.id ?? "",
              packSize: "1",
              received,
              onHand: received,
              onHandTyped: false,
              lineTotal: line.lineTotal,
              reorderAt: "",
              orderUpTo: "",
            });
          }
          setReceipt({
            supplierId: prefill.supplierId,
            unknownSupplier: prefill.unknownSupplier,
            invoiceNumber: prefill.invoiceNumber,
            invoiceTotal: prefill.invoiceTotal,
            receivedOn: prefill.receivedOn,
            duplicate: prefill.duplicate,
            photoIds: result.photoIds,
            created,
            existing: matched,
          });
          return {
            tone: "info",
            message:
              `Read ${prefill.lines.length} ${prefill.lines.length === 1 ? "line" : "lines"}: ${created.length} new` +
              (matched.length ? `, ${matched.length} already in your items` : "") +
              ". Check each one against the receipt, and untick fees or anything you don't track.",
          };
        }}
      />

      {receipt && (
        <Card>
          <ActionForm action={createItemsFromReceiptAction} className="space-y-4">
            <input type="hidden" name="supplierId" value={receipt.supplierId} />
            <input type="hidden" name="photoIds" value={JSON.stringify(receipt.photoIds)} />
            <input
              type="hidden"
              name="receipt"
              value={JSON.stringify({
                created: included.map((l) => ({
                  item: {
                    name: l.name,
                    type: l.type,
                    unit: l.unit,
                    spotId: l.spotId,
                    packSize: l.packSize,
                    reorderAt: l.reorderAt,
                    orderUpTo: l.orderUpTo,
                    defaultUnitCost: "",
                  },
                  invoiceCode: l.invoiceCode,
                  invoiceDescription: l.invoiceDescription,
                  received: l.received,
                  onHand: l.onHand,
                  lineTotal: l.lineTotal,
                })),
                existing: existing.map((l) => ({
                  itemId: l.itemId,
                  quantity: l.quantity,
                  lineTotal: l.lineTotal,
                  invoiceCode: l.invoiceCode,
                  invoiceDescription: l.invoiceDescription,
                })),
              })}
            />

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <Field label="Supplier or store">
                  <select value={receipt.supplierId} onChange={(e) => change({ supplierId: e.target.value })} required className={inputClass}>
                    <option value="">Choose…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {receipt.unknownSupplier && !receipt.supplierId && (
                  <p className="mt-1 text-xs text-ink/70">
                    The receipt says <strong>{receipt.unknownSupplier}</strong>, which isn&rsquo;t in your list.{" "}
                    <button
                      type="button"
                      onClick={() => void addSupplier(receipt.unknownSupplier!)}
                      className="font-semibold text-porcelain hover:underline"
                    >
                      Add it as a supplier
                    </button>
                    {supplierError && <span className="block text-red-700">{supplierError}</span>}
                  </p>
                )}
              </div>
              <Field label="Date">
                <input
                  type="date"
                  name="receivedOn"
                  value={receipt.receivedOn}
                  onChange={(e) => change({ receivedOn: e.target.value })}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Receipt #" hint="Optional.">
                <input
                  name="invoiceNumber"
                  value={receipt.invoiceNumber}
                  onChange={(e) => change({ invoiceNumber: e.target.value })}
                  maxLength={40}
                  className={inputClass}
                />
              </Field>
            </div>
            {receipt.duplicate && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">This receipt number from this supplier is already recorded.</p>
            )}

            <div className="space-y-3">
              <p className="text-sm font-semibold">New items ({included.length})</p>
              {receipt.created.length === 0 && <p className="text-sm text-ink/50">Everything on this receipt is already an item.</p>}
              {receipt.created.map((line) => (
                <NewItemLine key={line.key} line={line} spots={spots} onChange={(update) => changeLine(line.key, update)} />
              ))}
            </div>

            {receipt.existing.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Already in your items</p>
                <p className="text-xs text-ink/50">These are added to stock as a delivery.</p>
                {receipt.existing.map((line) => {
                  const item = nameOf(line.itemId);
                  return (
                    <label key={line.key} className="flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={line.include}
                        onChange={(e) =>
                          change({ existing: receipt.existing.map((l) => (l.key === line.key ? { ...l, include: e.target.checked } : l)) })
                        }
                      />
                      <span className="flex-1">
                        <span className="font-medium">{item?.name ?? "Item"}</span>
                        <span className="block text-xs text-ink/50">
                          Receipt: {line.invoiceCode && <span className="font-mono">{line.invoiceCode} </span>}
                          {line.invoiceDescription}
                        </span>
                      </span>
                      <span className="tabular-nums text-ink/70">
                        +{line.quantity || "?"} {item?.unit}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/5 pt-3">
              <p className="text-sm">
                Lines total <strong className="tabular-nums">{formatMoney(total)}</strong>
                {receipt.invoiceTotal && <span className="text-ink/60"> · receipt says {formatMoney(Number(receipt.invoiceTotal))}</span>}
                <input type="hidden" name="invoiceTotal" value={receipt.invoiceTotal} />
              </p>
              <SubmitButton disabled={included.length === 0 || !receipt.supplierId}>
                Add {included.length} {included.length === 1 ? "item" : "items"}
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

function NewItemLine({ line, spots, onChange }: { line: NewLine; spots: PickableSpot[]; onChange: (update: Partial<NewLine>) => void }) {
  const set = (name: keyof NewLine) => (e: { target: { value: string } }) => onChange({ [name]: e.target.value });

  return (
    <div className={`rounded-xl border p-3 ${line.include ? "border-ink/10" : "border-dashed border-ink/10 opacity-60"}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          aria-label="Add this item"
          checked={line.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          className="mt-2.5"
        />
        <div className="flex-1">
          <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
            <Field label="Name">
              <input value={line.name} onChange={set("name")} maxLength={80} disabled={!line.include} className={inputClass} />
            </Field>
            <Field label="Item code">
              <input value={line.invoiceCode} onChange={set("invoiceCode")} maxLength={40} disabled={!line.include} className={`${inputClass} font-mono`} />
            </Field>
          </div>
          <p className="mt-1 text-xs text-ink/50">
            Receipt: {line.invoiceDescription}
            {line.invoiceQuantity !== null && ` × ${line.invoiceQuantity}${line.invoiceUnit ? ` ${line.invoiceUnit}` : ""}`}
            {line.lineTotal && ` · ${formatMoney(Number(line.lineTotal))}`}
          </p>

          {line.include && (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="Type">
                  <select value={line.type} onChange={set("type")} className={inputClass}>
                    {itemTypes.map((t) => (
                      <option key={t} value={t}>
                        {itemTypeLabel[t]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Counted in" hint="Like tub, bag, sleeve.">
                  <input value={line.unit} onChange={set("unit")} maxLength={40} className={inputClass} />
                </Field>
                <Field label="Stored in">
                  <select value={line.spotId} onChange={set("spotId")} className={inputClass}>
                    {spots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Pack size" hint="Per receipt unit.">
                  <input value={line.packSize} onChange={set("packSize")} inputMode="decimal" className={inputClass} />
                </Field>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Field label="Received">
                  <input value={line.received} onChange={set("received")} inputMode="decimal" className={inputClass} />
                </Field>
                <Field label="On hand now" hint="Starting stock.">
                  <input
                    value={line.onHand}
                    onChange={(e) => onChange({ onHand: e.target.value, onHandTyped: true })}
                    inputMode="decimal"
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Line total">
                  <input value={line.lineTotal} onChange={set("lineTotal")} inputMode="decimal" placeholder="$" className={inputClass} />
                </Field>
                <Field label="Reorder at" hint="Optional.">
                  <input value={line.reorderAt} onChange={set("reorderAt")} inputMode="decimal" className={inputClass} />
                </Field>
                <Field label="Order up to" hint="Optional.">
                  <input value={line.orderUpTo} onChange={set("orderUpTo")} inputMode="decimal" className={inputClass} />
                </Field>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
