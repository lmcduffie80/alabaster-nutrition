import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Field, inputClass, SectionTitle } from "@/components/ui";
import { getDb } from "@/db";
import { formatQuantity } from "@/lib/domain/inventory";
import { formatDay, formatTime, localDateOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { countFixes, getCount } from "@/lib/server/inventory";
import { requireManager } from "@/lib/server/session";
import { ActionForm, SubmitButton } from "../../../forms";
import { cancelCountAction, fixCountLineAction } from "../../../inventory-actions";

export default async function CountPage({ params }: PageProps<"/manage/inventory/counts/[id]">) {
  await requireManager();
  const { id } = await params;
  const db = await getDb();
  const [count, fixes, { timeZone }] = await Promise.all([getCount(db, id), countFixes(db, id), getBusiness(db)]);
  if (!count) notFound();
  const when = (at: Date) => `${formatDay(localDateOf(at, timeZone))} at ${formatTime(at, timeZone)}`;
  const spots = [...new Set(count.lines.map((l) => l.spotName))];
  const finished = count.status === "finished";
  const lineOf = new Map(count.lines.map((l) => [l.itemId, l]));
  const shown = (quantity: number | null, unit: string) => (quantity === null ? "not counted" : formatQuantity(quantity, unit));

  return (
    <div>
      <Link href="/manage/inventory/counts" className="text-sm text-porcelain hover:underline">
        ← All counts
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-serif text-2xl font-semibold">
            Count {finished ? when(count.finishedAt!) : `started ${when(count.startedAt)}`}
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
      {finished && <p className="mt-2 text-sm text-ink/60">Spot a wrong number? Use Fix next to the item. Stock and usage update right away.</p>}

      {spots.map((spot) => (
        <section key={spot} className="mt-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">{spot}</h2>
          <Card className="divide-y divide-ink/5 p-0">
            {count.lines
              .filter((l) => l.spotName === spot)
              .map((line) => (
                <div key={line.itemId} className="px-4 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{line.name}</span>
                    <span className="text-right">
                      {line.quantity === null ? (
                        <Badge tone={finished ? "red" : "neutral"}>{finished ? "Skipped" : "Not counted yet"}</Badge>
                      ) : (
                        <span className="tabular-nums">{formatQuantity(line.quantity, line.unit)}</span>
                      )}
                      {line.enteredBy && <span className="block text-xs text-ink/50">{line.enteredBy}</span>}
                    </span>
                  </div>
                  {finished && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-medium text-porcelain">Fix</summary>
                      <ActionForm action={fixCountLineAction} className="mt-2 flex flex-wrap items-end gap-3 pb-2">
                        <input type="hidden" name="countId" value={count.id} />
                        <input type="hidden" name="itemId" value={line.itemId} />
                        <div className="w-32">
                          <Field label={`Quantity (${line.unit})`}>
                            <input
                              name="quantity"
                              inputMode="decimal"
                              defaultValue={line.quantity ?? ""}
                              placeholder="Blank = not counted"
                              className={inputClass}
                            />
                          </Field>
                        </div>
                        <div className="min-w-48 flex-1">
                          <Field label="Reason">
                            <input name="reason" required maxLength={200} placeholder="Miscounted, typo…" className={inputClass} />
                          </Field>
                        </div>
                        <SubmitButton>Save fix</SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                </div>
              ))}
          </Card>
        </section>
      ))}

      {fixes.length > 0 && (
        <section className="mt-6">
          <SectionTitle>Fixes</SectionTitle>
          <Card className="divide-y divide-ink/5 p-0">
            {fixes.map((fix, i) => {
              const line = lineOf.get(fix.itemId);
              const unit = line?.unit ?? "";
              return (
                <div key={i} className="px-4 py-2 text-sm">
                  <p>
                    <span className="font-medium">{line?.name ?? "Removed item"}</span>: {shown(fix.before, unit)} → {shown(fix.after, unit)}
                  </p>
                  <p className="text-xs text-ink/60">
                    {fix.reason} · {fix.actor} · {when(fix.at)}
                  </p>
                </div>
              );
            })}
          </Card>
        </section>
      )}
    </div>
  );
}
