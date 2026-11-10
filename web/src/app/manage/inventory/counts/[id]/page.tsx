import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { getDb } from "@/db";
import { formatQuantity } from "@/lib/domain/inventory";
import { formatDay, formatTime, localDateOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { getCount } from "@/lib/server/inventory";
import { requireManager } from "@/lib/server/session";
import { ActionForm, SubmitButton } from "../../../forms";
import { cancelCountAction } from "../../../inventory-actions";

export default async function CountPage({ params }: PageProps<"/manage/inventory/counts/[id]">) {
  await requireManager();
  const { id } = await params;
  const db = await getDb();
  const [count, { timeZone }] = await Promise.all([getCount(db, id), getBusiness(db)]);
  if (!count) notFound();
  const when = (at: Date) => `${formatDay(localDateOf(at, timeZone))} at ${formatTime(at, timeZone)}`;
  const spots = [...new Set(count.lines.map((l) => l.spotName))];

  return (
    <div>
      <Link href="/manage/inventory/counts" className="text-sm text-porcelain hover:underline">
        ← All counts
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-serif text-2xl font-semibold">
            Count {count.status === "finished" ? when(count.finishedAt!) : `started ${when(count.startedAt)}`}
          </p>
          <p className="text-sm text-ink/60">
            Started by {count.startedBy}
            {count.finishedBy && ` · finished by ${count.finishedBy}`} · {count.counted} of {count.total} counted
          </p>
        </div>
        {count.status === "open" && (
          <ActionForm action={cancelCountAction} confirm="Cancel this count? What's been entered so far is discarded.">
            <input type="hidden" name="countId" value={count.id} />
            <SubmitButton variant="danger">Cancel count</SubmitButton>
          </ActionForm>
        )}
        {count.status === "cancelled" && <Badge>Cancelled</Badge>}
      </div>

      {spots.map((spot) => (
        <section key={spot} className="mt-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">{spot}</h2>
          <Card className="divide-y divide-ink/5 p-0">
            {count.lines
              .filter((l) => l.spotName === spot)
              .map((line) => (
                <div key={line.itemId} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="font-medium">{line.name}</span>
                  <span className="text-right">
                    {line.quantity === null ? (
                      <Badge tone={count.status === "finished" ? "red" : "neutral"}>
                        {count.status === "finished" ? "Skipped" : "Not counted yet"}
                      </Badge>
                    ) : (
                      <span className="tabular-nums">{formatQuantity(line.quantity, line.unit)}</span>
                    )}
                    {line.enteredBy && <span className="block text-xs text-ink/50">{line.enteredBy}</span>}
                  </span>
                </div>
              ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
