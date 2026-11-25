import type { Metadata } from "next";
import Link from "next/link";
import { CountSheet } from "@/components/count-sheet";
import { Card, Wordmark } from "@/components/ui";
import { getCount, openCountId } from "@/lib/server/inventory";
import { withMember } from "@/lib/server/session";
import { saveMyCountAction } from "../actions";
import { StartCount } from "../start-count";

export const metadata: Metadata = { title: "Inventory count · Metzey" };

export default async function MyCountPage({ searchParams }: PageProps<"/schedule/count">) {
  const finished = (await searchParams).finished === "1";
  const { viewer, count } = await withMember(async (db, viewer) => {
    const id = await openCountId(db);
    return { viewer, count: id ? await getCount(db, id) : null };
  });
  const spots = count ? [...new Set(count.lines.map((l) => l.spotName))] : [];

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <header className="flex items-center justify-between">
        <Wordmark business={viewer.businessName} />
        <Link href="/schedule" className="text-sm font-medium text-porcelain hover:underline">
          ← My schedule
        </Link>
      </header>

      <h1 className="mt-6 font-serif text-2xl font-semibold">Inventory count</h1>
      {count ? (
        <>
          <p className="text-sm text-ink/60">
            Type what&rsquo;s on the shelf for each item, or leave it blank if you didn&rsquo;t count it. Save as you go;
            others can count at the same time. Started by {count.startedBy}.
          </p>
          <CountSheet
            countId={count.id}
            action={saveMyCountAction}
            spots={spots.map((name) => ({ name, lines: count.lines.filter((l) => l.spotName === name) }))}
          />
        </>
      ) : finished ? (
        <Card className="mt-4 space-y-3">
          <p className="text-sm font-medium text-[#4d6340]">Count finished. Thanks!</p>
          <Link href="/schedule" className="text-sm font-semibold text-porcelain hover:underline">
            Back to my schedule
          </Link>
        </Card>
      ) : (
        <Card className="mt-4 space-y-3">
          <p className="text-sm text-ink/70">No count is open right now. Start one to count what&rsquo;s on the shelves.</p>
          <StartCount due={false} />
        </Card>
      )}
    </main>
  );
}
