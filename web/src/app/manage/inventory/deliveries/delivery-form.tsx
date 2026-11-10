"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/domain/inventory";
import type { FormState } from "../../actions";
import { ActionForm, SubmitButton } from "../../forms";

export type PickableItem = { id: string; name: string; unit: string; supplierId: string | null };
export type PickableSupplier = { id: string; name: string };

type Line = { key: number; itemId: string; quantity: string; lineTotal: string; invoiceCode?: string; invoiceDescription?: string };

export type DeliveryFormValues = {
  id?: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceTotal: string;
  receivedOn: string;
  onShelfForCount: boolean;
  lines: Omit<Line, "key">[];
};

let nextKey = 1;
const blankLine = (): Line => ({ key: nextKey++, itemId: "", quantity: "", lineTotal: "" });

function sumOf(lines: Line[]) {
  let total = 0;
  for (const line of lines) {
    try {
      total += parseMoney(line.lineTotal) ?? 0;
    } catch {}
  }
  return Math.round(total * 100) / 100;
}

export function DeliveryForm({
  action,
  items,
  suppliers,
  initial,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  items: PickableItem[];
  suppliers: PickableSupplier[];
  initial: DeliveryFormValues;
  submitLabel: string;
}) {
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [receivedOn, setReceivedOn] = useState(initial.receivedOn);
  const [invoiceNumber, setInvoiceNumber] = useState(initial.invoiceNumber);
  const [invoiceTotal, setInvoiceTotal] = useState(initial.invoiceTotal);
  const [onShelf, setOnShelf] = useState(initial.onShelfForCount);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    initial.lines.length ? initial.lines.map((line) => ({ ...line, key: nextKey++ })) : [blankLine()],
  );
  const editing = Boolean(initial.id);
  const theirs = items.filter((i) => i.supplierId === supplierId);
  const others = items.filter((i) => i.supplierId !== supplierId);
  const unitOf = (itemId: string) => items.find((i) => i.id === itemId)?.unit;

  const update = (key: number, change: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const total = sumOf(lines);
  let expected: number | null = null;
  try {
    expected = parseMoney(invoiceTotal);
  } catch {}
  const mismatch = expected !== null && Math.abs(expected - total) > 0.01;

  return (
    <ActionForm action={action} className="space-y-4">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="lines" value={JSON.stringify(lines, (name, value) => (name === "key" ? undefined : value))} />

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
        </div>
        <Field label="Received">
          <input type="date" name="receivedOn" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} required className={inputClass} />
        </Field>
        <Field label="Invoice #" hint="Optional.">
          <input name="invoiceNumber" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={40} className={inputClass} />
        </Field>
      </div>

      <div>
        <div className="mb-1 hidden grid-cols-[1fr_8rem_7rem_2rem] gap-2 text-xs font-medium text-ink/60 sm:grid">
          <span>Item</span>
          <span>Quantity received</span>
          <span>Line total</span>
        </div>
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-ink/10 p-2 sm:grid-cols-[1fr_8rem_7rem_2rem] sm:border-0 sm:p-0">
              <div className="col-span-2 sm:col-span-1">
                <select
                  aria-label="Item"
                  value={line.itemId}
                  onChange={(e) => update(line.key, { itemId: e.target.value })}
                  className={inputClass}
                >
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
                {line.invoiceDescription && <p className="mt-0.5 text-xs text-ink/50">Invoice: {line.invoiceDescription}</p>}
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
                <span className="w-12 truncate text-xs text-ink/50">{unitOf(line.itemId) ?? ""}</span>
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
                <span className="sr-only">Remove line</span>
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <Button variant="quiet" onClick={() => setLines([...lines, blankLine()])}>
            <Plus className="size-4" /> Add a line
          </Button>
          <span className="text-sm">
            Total: <strong className="tabular-nums">{formatMoney(total)}</strong>
          </span>
        </div>
        <p className="mt-1 text-xs text-ink/50">
          Quantities are in the unit you count (if a case holds 20 sleeves, 2 cases is 40). Leave the line total blank if you don&rsquo;t
          have a price.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Invoice total" hint="Optional. Lets you check the lines add up.">
          <input
            name="invoiceTotal"
            value={invoiceTotal}
            onChange={(e) => setInvoiceTotal(e.target.value)}
            inputMode="decimal"
            placeholder="$"
            className={inputClass}
          />
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
