import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { getDb } from "@/db";
import { formatDay, formatTime, localDateOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { inventorySummary, listCounts } from "@/lib/server/inventory";
import { requireManager } from "@/lib/server/session";

export default async function CountsPage() {
  await requireManager();
  const db = await getDb();
  const [counts, summary, { timeZone }] = await Promise.all([listCounts(db), inventorySummary(db, new Date()), getBusiness(db)]);
  const when = (at: Date) => `${formatDay(localDateOf(at, timeZone))} ${formatTime(at, timeZone)}`;

  return (
    <div>
      <p className="mb-4 text-sm text-ink/60">
        Employees count on the store iPad: after their PIN, they tap <strong>Count inventory</strong>.
        {summary.countDue && " A count is due now."}
      </p>
      <Card className="divide-y divide-ink/5 p-0">
        {counts.length === 0 && <p className="px-4 py-3 text-sm text-ink/50">No counts yet.</p>}
        {counts.map((count) => (
          <Link key={count.id} href={`/manage/inventory/counts/${count.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink/[0.02]">
            <span>
              <span className="font-medium">{when(count.finishedAt ?? count.startedAt)}</span>
              <span className="block text-xs text-ink/50">
                {count.status === "finished" ? `Finished by ${count.finishedBy}` : `Started by ${count.startedBy}`}
              </span>
            </span>
            <span className="flex items-center gap-2 text-ink/70">
              {count.counted} of {count.total} counted
              {count.status === "open" && <Badge tone="gilt">In progress</Badge>}
              {count.status === "cancelled" && <Badge>Cancelled</Badge>}
              {count.status === "finished" && count.counted < count.total && <Badge tone="red">{count.total - count.counted} skipped</Badge>}
            </span>
          </Link>
        ))}
      </Card>
    </div>
  );
}
