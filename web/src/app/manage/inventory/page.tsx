import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatMoney, formatQuantity, itemTypePlural, itemTypes, round2, type ItemType } from "@/lib/domain/inventory";
import { formatDay, localDateOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { inventorySummary, stockRows } from "@/lib/server/inventory";
import { withManager } from "@/lib/server/session";

export default async function StockPage({ searchParams }: PageProps<"/manage/inventory">) {
  return withManager(async (db) => {
    const query = await searchParams;
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
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {[
            { label: "Stock value", rows },
            ...itemTypes.map((t) => ({ label: itemTypePlural[t], rows: rows.filter((r) => r.type === t) })),
          ].map(({ label, rows: group }) => {
            const unpriced = group.filter((r) => r.onHand !== null && r.unitCost === null).length;
            return (
              <Card key={label} className="py-3">
                <p className="text-xs text-ink/50">{label}</p>
                <p className="text-xl font-semibold tabular-nums">{formatMoney(round2(group.reduce((sum, r) => sum + (r.value ?? 0), 0)))}</p>
                {unpriced > 0 && <p className="text-xs text-ink/50">{unpriced} without a price</p>}
              </Card>
            );
          })}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {filter("All", {}, !type && !lowOnly)}
          {itemTypes.map((t) => filter(itemTypePlural[t], { type: t }, type === t && !lowOnly))}
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
                    <th className="px-4 py-2 text-right font-medium">Cost each</th>
                    <th className="px-4 py-2 text-right font-medium">Value</th>
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
                        <td className="px-4 py-2 text-right tabular-nums text-ink/70">
                          {r.unitCost === null ? <span className="text-ink/40">No price</span> : formatMoney(r.unitCost)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.value)}</td>
                        <td className="px-4 py-2 text-ink/70">{r.lastCountedAt
                            ? formatDay(localDateOf(r.lastCountedAt, timeZone))
                            : r.startingOn
                              ? `Started ${formatDay(r.startingOn)}`
                              : "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          </section>
        ))}
      </div>
    );
  });
}
