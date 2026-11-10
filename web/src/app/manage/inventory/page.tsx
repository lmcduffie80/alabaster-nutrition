import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { getDb } from "@/db";
import { formatQuantity, itemTypeLabel, itemTypes, type ItemType } from "@/lib/domain/inventory";
import { formatDay, localDateOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { inventorySummary, stockRows } from "@/lib/server/inventory";
import { requireManager } from "@/lib/server/session";

export default async function StockPage({ searchParams }: PageProps<"/manage/inventory">) {
  await requireManager();
  const query = await searchParams;
  const db = await getDb();
  const [rows, summary, { timeZone }] = await Promise.all([stockRows(db), inventorySummary(db, new Date()), getBusiness(db)]);
  const type = itemTypes.find((t) => t === query.type) as ItemType | undefined;
  const lowOnly = query.low === "1";
  const shown = rows.filter((r) => (!type || r.type === type) && (!lowOnly || r.low));
  const spots = [...new Set(shown.map((r) => r.spotName))];

  const filter = (label: string, params: Record<string, string>, active: boolean) => (
    <Link
      href={{ pathname: "/manage/inventory", query: params }}
      className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-porcelain text-white" : "bg-ink/5 text-ink/70 hover:bg-ink/10"}`}
    >
      {label}
    </Link>
  );

  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm">
          No items yet. Start by adding where things are stored and what you count, under{" "}
          <Link href="/manage/inventory/items" className="font-semibold text-porcelain hover:underline">
            Items
          </Link>
          .
        </p>
      </Card>
    );
  }

  return (
    <div>
      {summary.openCount && (
        <Card className="mb-4 text-sm">
          A count is in progress: {summary.openCount.counted} of {summary.openCount.total} counted.{" "}
          <Link href={`/manage/inventory/counts/${summary.openCount.id}`} className="font-semibold text-porcelain hover:underline">
            View
          </Link>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {filter("All", {}, !type && !lowOnly)}
        {itemTypes.map((t) => filter(`${itemTypeLabel[t]}s`, { type: t }, type === t && !lowOnly))}
        {filter(`Running low (${summary.lowCount})`, { low: "1" }, lowOnly)}
      </div>

      {shown.length === 0 && <p className="text-sm text-ink/60">Nothing here.</p>}
      {spots.map((spot) => (
        <section key={spot} className="mb-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">{spot}</h2>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink/50">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">On hand</th>
                  <th className="px-4 py-2 font-medium">Reorder at</th>
                  <th className="px-4 py-2 font-medium">Last counted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {shown
                  .filter((r) => r.spotName === spot)
                  .map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2">
                        <span className="font-medium">{r.name}</span>
                        {r.supplierName && <span className="block text-xs text-ink/50">{r.supplierName}</span>}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {r.onHand === null ? <span className="text-ink/40">Not counted yet</span> : formatQuantity(r.onHand, r.unit)}{" "}
                        {r.low && <Badge tone="red">Low</Badge>}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-ink/70">{formatQuantity(r.reorderAt, r.unit)}</td>
                      <td className="px-4 py-2 text-ink/70">{r.lastCountedAt ? formatDay(localDateOf(r.lastCountedAt, timeZone)) : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </section>
      ))}
    </div>
  );
}
