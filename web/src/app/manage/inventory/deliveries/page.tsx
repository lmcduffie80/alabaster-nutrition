import { Plus } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { getDb } from "@/db";
import { formatMoney } from "@/lib/domain/inventory";
import { formatDay } from "@/lib/domain/time";
import { listDeliveries } from "@/lib/server/inventory";
import { requireManager } from "@/lib/server/session";

export default async function DeliveriesPage() {
  await requireManager();
  const deliveries = await listDeliveries(await getDb());

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-ink/60">What arrived, and what it cost. Deliveries add to stock until the next count.</p>
        <Link
          href="/manage/inventory/deliveries/new"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-porcelain px-3 py-2 text-sm font-semibold text-white hover:bg-porcelain-dark"
        >
          <Plus className="size-4" /> Record delivery
        </Link>
      </div>
      <Card className="divide-y divide-ink/5 p-0">
        {deliveries.length === 0 && <p className="px-4 py-3 text-sm text-ink/50">No deliveries yet.</p>}
        {deliveries.map((d) => (
          <Link
            key={d.id}
            href={`/manage/inventory/deliveries/${d.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-ink/[0.02]"
          >
            <span>
              <span className="font-medium">{d.supplierName}</span>
              <span className="block text-xs text-ink/50">
                {formatDay(d.receivedOn)}
                {d.invoiceNumber && ` · Invoice ${d.invoiceNumber}`} · {d.lineCount} {d.lineCount === 1 ? "item" : "items"}
              </span>
            </span>
            <span className="tabular-nums">{d.total === null ? <span className="text-ink/40">No price</span> : formatMoney(d.total)}</span>
          </Link>
        ))}
      </Card>
    </div>
  );
}
