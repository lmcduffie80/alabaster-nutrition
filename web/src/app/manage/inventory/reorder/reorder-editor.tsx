"use client";

import { Copy, Printer } from "lucide-react";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { formatQuantity, plural } from "@/lib/domain/inventory";
import type { ReorderGroup } from "@/lib/server/inventory";

export function reorderText(groups: ReorderGroup[], amounts: Record<string, number>) {
  return groups
    .map((group) => {
      const lines = group.lines
        .filter((line) => (amounts[line.itemId] ?? line.amount) > 0)
        .map((line) => {
          const amount = amounts[line.itemId] ?? line.amount;
          return `- ${line.name}${line.supplierCode ? ` (${line.supplierCode})` : ""}: ${amount} ${plural(line.unit, amount)}`;
        });
      return lines.length ? [`${group.supplierName}:`, ...lines].join("\n") : null;
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Amounts can be adjusted here for this order; they aren't saved. */
export function ReorderEditor({ groups }: { groups: ReorderGroup[] }) {
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(reorderText(groups, amounts));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-ink/60">Suggested amounts bring each item back up to its “order up to” level.</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void copy()}>
            <Copy className="size-4" /> {copied ? "Copied" : "Copy as text"}
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
        </div>
      </div>
      <h2 className="mb-3 hidden font-serif text-2xl font-semibold print:block">Reorder list</h2>

      {groups.map((group) => (
        <section key={group.supplierId ?? "none"} className="mb-5 break-inside-avoid">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-semibold">{group.supplierName}</h3>
            {group.contact && <span className="text-xs text-ink/60">{group.contact}</span>}
          </div>
          <Card className="divide-y divide-ink/5 p-0">
            {group.lines.map((line) => (
              <div key={line.itemId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span>
                  <span className="font-medium">{line.name}</span>
                  {line.supplierCode && <span className="ml-2 font-mono text-xs text-ink/50">{line.supplierCode}</span>}
                  <span className="block text-xs text-ink/50">On hand: {formatQuantity(line.onHand, line.unit)}</span>
                </span>
                <label className="flex items-center gap-2">
                  <span className="sr-only">Order amount for {line.name}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={amounts[line.itemId] ?? line.amount}
                    onChange={(e) => setAmounts({ ...amounts, [line.itemId]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                    className="w-20 rounded-lg border border-ink/15 px-2 py-1 text-right tabular-nums print:border-0"
                  />
                  <span className="w-24 text-xs text-ink/60">{plural(line.unit, amounts[line.itemId] ?? line.amount)}</span>
                </label>
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
