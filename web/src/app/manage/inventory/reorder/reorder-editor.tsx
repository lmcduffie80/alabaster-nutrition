"use client";

import { Copy, Printer } from "lucide-react";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { formatMoney, formatQuantity, plural, round2 } from "@/lib/domain/inventory";
import type { ReorderGroup } from "@/lib/server/inventory";

type Line = ReorderGroup["lines"][number];

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

/** What an order costs, and which ordered lines have no price to count. */
export function orderCost(lines: Line[], amounts: Record<string, number>) {
  let total = 0;
  let unpriced = 0;
  for (const line of lines) {
    const amount = amounts[line.itemId] ?? line.amount;
    if (amount <= 0) continue;
    if (line.unitCost === null) unpriced += 1;
    else total = round2(total + amount * line.unitCost);
  }
  return { total, unpriced };
}

/** Amounts can be adjusted here for this order; they aren't saved. */
export function ReorderEditor({ groups }: { groups: ReorderGroup[] }) {
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);
  const overall = orderCost(groups.flatMap((g) => g.lines), amounts);

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

      <Card className="mb-5 flex items-baseline justify-between py-3">
        <span className="text-sm text-ink/60">Estimated order total</span>
        <span className="text-right">
          <span className="text-xl font-semibold tabular-nums">{formatMoney(overall.total)}</span>
          {overall.unpriced > 0 && (
            <span className="block text-xs text-ink/50">
              Not including {overall.unpriced} item{overall.unpriced === 1 ? "" : "s"} with no price yet
            </span>
          )}
        </span>
      </Card>

      {groups.map((group) => {
        const subtotal = orderCost(group.lines, amounts);
        return (
          <section key={group.supplierId ?? "none"} className="mb-5 break-inside-avoid">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">
                {group.supplierName}
                {group.contact && <span className="ml-2 text-xs font-normal text-ink/60">{group.contact}</span>}
              </h3>
              <span className="text-sm font-semibold tabular-nums">{formatMoney(subtotal.total)}</span>
            </div>
            <Card className="divide-y divide-ink/5 p-0">
              {group.lines.map((line) => {
                const amount = amounts[line.itemId] ?? line.amount;
                return (
                  <div key={line.itemId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{line.name}</span>
                      {line.supplierCode && <span className="ml-2 font-mono text-xs text-ink/50">{line.supplierCode}</span>}
                      <span className="block text-xs text-ink/50">
                        On hand: {formatQuantity(line.onHand, line.unit)}
                        {line.unitCost !== null && ` · ${formatMoney(round2(line.unitCost))} each`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <label className="flex items-center gap-2">
                        <span className="sr-only">Order amount for {line.name}</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={amount}
                          onChange={(e) => setAmounts({ ...amounts, [line.itemId]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                          className="w-20 rounded-lg border border-ink/15 px-2 py-1 text-right tabular-nums print:border-0"
                        />
                        <span className="w-24 text-xs text-ink/60">{plural(line.unit, amount)}</span>
                      </label>
                      <span className="w-20 text-right tabular-nums">
                        {line.unitCost === null ? (
                          <span className="text-xs text-ink/50">No price</span>
                        ) : (
                          formatMoney(round2(amount * line.unitCost))
                        )}
                      </span>
                    </span>
                  </div>
                );
              })}
            </Card>
          </section>
        );
      })}
      {overall.unpriced > 0 && (
        <p className="text-xs text-ink/50 print:hidden">
          Prices come from the latest delivery of each item, or its default cost under Items. Add one to include it in the total.
        </p>
      )}
    </div>
  );
}
