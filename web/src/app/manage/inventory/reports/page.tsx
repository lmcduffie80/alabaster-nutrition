import Link from "next/link";
import { Badge, Card, inputClass } from "@/components/ui";
import { formatMoney, formatQuantity, itemTypePlural, itemTypes, round2 } from "@/lib/domain/inventory";
import { formatDay } from "@/lib/domain/time";
import { stockRows } from "@/lib/server/inventory";
import { spendingReport, usageReport, type SpendingBy } from "@/lib/server/inventory-reports";
import { requireManager, withManager } from "@/lib/server/session";

const views = [
  { id: "usage", label: "Usage" },
  { id: "stock", label: "Stock value" },
  { id: "spending", label: "Spending" },
] as const;

const pill = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-porcelain text-white" : "bg-ink/5 text-ink/70 hover:bg-ink/10"}`;

function Download({ href }: { href: string }) {
  return (
    <a href={href} className="text-sm font-semibold text-porcelain hover:underline">
      Download CSV
    </a>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/manage/inventory/reports">) {
  await requireManager();
  const query = await searchParams;
  const view = views.find((v) => v.id === query.view)?.id ?? "usage";

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {views.map((v) => (
          <Link key={v.id} href={{ pathname: "/manage/inventory/reports", query: { view: v.id } }} className={pill(view === v.id)}>
            {v.label}
          </Link>
        ))}
      </div>
      {view === "usage" && <Usage period={typeof query.period === "string" ? query.period : undefined} />}
      {view === "stock" && <StockValue />}
      {view === "spending" && <Spending by={query.by === "month" ? "month" : "week"} />}
    </div>
  );
}

async function Usage({ period }: { period?: string }) {
  const report = await withManager((db) => usageReport(db, period));
  if (!report.period) {
    return (
      <Card>
        <p className="text-sm">Usage shows up after two counts have been finished — it compares one count to the next, counting deliveries in between.</p>
      </Card>
    );
  }
  const range = (p: { from: string; to: string }) => `${formatDay(p.from)} – ${formatDay(p.to)}`;
  const flagged = report.lines.filter((l) => l.flag);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form className="flex items-end gap-2">
          <input type="hidden" name="view" value="usage" />
          <label className="text-xs text-ink/60">
            Between counts
            <select name="period" defaultValue={report.period.toCountId} className={`${inputClass} mt-1 block`}>
              {report.periods.map((p) => (
                <option key={p.toCountId} value={p.toCountId}>
                  {range(p)}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-lg bg-ink/5 px-3 py-2 text-sm font-medium hover:bg-ink/10">Show</button>
        </form>
        <Download href={`/manage/inventory/reports/export?report=usage&period=${report.period.toCountId}`} />
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {itemTypes.map((t) => (
          <Card key={t} className="py-3">
            <p className="text-xs text-ink/50">{itemTypePlural[t]} used</p>
            <p className="text-xl font-semibold tabular-nums">{formatMoney(report.costByType[t])}</p>
          </Card>
        ))}
        <Card className="py-3">
          <p className="text-xs text-ink/50">Flagged</p>
          <p className="text-xl font-semibold tabular-nums">{flagged.length}</p>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink/50">
            <tr className="border-b border-ink/5">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-2 py-2 text-right font-medium">Start</th>
              <th className="px-2 py-2 text-right font-medium">Received</th>
              <th className="px-2 py-2 text-right font-medium">End</th>
              <th className="px-2 py-2 text-right font-medium">Used</th>
              <th className="px-4 py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {report.lines.map((l) => (
              <tr key={l.itemId}>
                <td className="px-4 py-2">
                  <span className="font-medium">{l.name}</span>
                  {l.flag === "high" && (
                    <span className="ml-2">
                      <Badge tone="gilt">Higher than usual</Badge>
                    </span>
                  )}
                  {l.flag === "mismatch" && (
                    <span className="ml-2">
                      <Badge tone="red">Count mismatch</Badge>
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{l.start === null ? "—" : formatQuantity(l.start, l.unit)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.received ? formatQuantity(l.received, l.unit) : "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.end === null ? "—" : formatQuantity(l.end, l.unit)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.used === null ? "Not counted" : formatQuantity(l.used, l.unit)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.cost === null ? "—" : formatMoney(l.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-ink/50">
        Used = start + received − end. &ldquo;Count mismatch&rdquo; means more was counted than could be there — usually a miscount or a
        delivery that wasn&rsquo;t recorded; fix it on the count or the delivery. &ldquo;Higher than usual&rdquo; is more than 1.5× the
        average of the last four periods.
      </p>
    </div>
  );
}

async function StockValue() {
  const rows = await withManager(stockRows);
  const groups = [...new Set(rows.map((r) => r.spotName))].map((spot) => {
    const inSpot = rows.filter((r) => r.spotName === spot);
    return {
      spot,
      byType: itemTypes.map((t) => round2(inSpot.filter((r) => r.type === t).reduce((sum, r) => sum + (r.value ?? 0), 0))),
      total: round2(inSpot.reduce((sum, r) => sum + (r.value ?? 0), 0)),
    };
  });
  const total = round2(groups.reduce((sum, g) => sum + g.total, 0));
  const unpriced = rows.filter((r) => r.onHand !== null && r.unitCost === null);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink/60">What&rsquo;s on the shelves now, at the latest price paid.</p>
        <Download href="/manage/inventory/reports/export?report=stock" />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink/50">
            <tr className="border-b border-ink/5">
              <th className="px-4 py-2 font-medium">Stored in</th>
              {itemTypes.map((t) => (
                <th key={t} className="px-2 py-2 text-right font-medium">
                  {itemTypePlural[t]}
                </th>
              ))}
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {groups.map((g) => (
              <tr key={g.spot}>
                <td className="px-4 py-2 font-medium">{g.spot}</td>
                {g.byType.map((v, i) => (
                  <td key={i} className="px-2 py-2 text-right tabular-nums">
                    {formatMoney(v)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right tabular-nums">{formatMoney(g.total)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-4 py-2">Total</td>
              {itemTypes.map((t, i) => (
                <td key={t} className="px-2 py-2 text-right tabular-nums">
                  {formatMoney(round2(groups.reduce((sum, g) => sum + g.byType[i], 0)))}
                </td>
              ))}
              <td className="px-4 py-2 text-right tabular-nums">{formatMoney(total)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
      {unpriced.length > 0 && (
        <p className="mt-3 text-xs text-ink/50">
          Not included, no price yet: {unpriced.map((r) => r.name).join(", ")}. Add a default cost under Items or record a priced delivery.
        </p>
      )}
    </div>
  );
}

async function Spending({ by }: { by: SpendingBy }) {
  const buckets = await withManager((db) => spendingReport(db, by, new Date()));
  const label = (start: string) =>
    by === "week" ? `Week of ${formatDay(start)}` : new Date(`${start}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["week", "month"] as const).map((b) => (
            <Link key={b} href={{ pathname: "/manage/inventory/reports", query: { view: "spending", by: b } }} className={pill(by === b)}>
              By {b}
            </Link>
          ))}
        </div>
        <Download href={`/manage/inventory/reports/export?report=spending&by=${by}`} />
      </div>
      {buckets.length === 0 && (
        <Card>
          <p className="text-sm">No deliveries in the last 12 {by}s.</p>
        </Card>
      )}
      <div className="space-y-3">
        {buckets.map((b) => (
          <Card key={b.start} className="p-0">
            <div className="flex items-center justify-between border-b border-ink/5 px-4 py-2">
              <span className="font-medium">{label(b.start)}</span>
              <span className="font-semibold tabular-nums">{formatMoney(b.total)}</span>
            </div>
            <div className="divide-y divide-ink/5">
              {b.suppliers.map((s) => (
                <div key={s.name} className="flex justify-between px-4 py-1.5 text-sm">
                  <span>
                    {s.name} <span className="text-xs text-ink/50">· {s.deliveries} {s.deliveries === 1 ? "delivery" : "deliveries"}</span>
                  </span>
                  <span className="tabular-nums">{formatMoney(s.total)}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink/50">Totals add up the line prices on each delivery, by the day it was received.</p>
    </div>
  );
}
