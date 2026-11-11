import { clerkClient } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { ACTIVE_DAYS, businessUsage, usageTotals } from "@/lib/server/platform";
import { requirePlatformOwner } from "@/lib/server/session";
import { PlatformHeader } from "./platform-header";

export const metadata: Metadata = { title: "Dashboard · Platform" };

async function signInAccounts(): Promise<number | null> {
  try {
    return await (await clerkClient()).users.getCount();
  } catch (error) {
    console.error("Couldn't count Clerk users", error);
    return null;
  }
}

export default async function PlatformDashboard() {
  const { db } = await requirePlatformOwner("/platform");
  const now = new Date();
  const [usage, accounts] = await Promise.all([businessUsage(db, now), signInAccounts()]);
  const totals = usageTotals(usage);
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <PlatformHeader current="/platform" />

      <h1 className="mt-6 font-serif text-3xl font-semibold">Dashboard</h1>
      <p className="text-sm text-ink/60">Who&rsquo;s using Metzey. &ldquo;Active&rdquo; means someone clocked in or out in the last {ACTIVE_DAYS} days.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Businesses" value={totals.businesses} detail={`${totals.activeBusinesses} active`} />
        <Stat label="Team members" value={totals.team} detail={`${totals.withEmail} with phone sign-in`} />
        <Stat label="Sign-in accounts" value={accounts ?? "—"} detail="Everyone who's made a login" />
        <Stat label={`Punches, ${ACTIVE_DAYS} days`} value={totals.recentPunches} detail="Clock-ins, outs and breaks" />
      </div>

      <SectionTitle>Businesses</SectionTitle>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wider text-ink/50">
              <th className="px-4 py-2">Business</th>
              <th className="px-2 py-2 text-right">Team</th>
              <th className="px-2 py-2 text-right">Managers</th>
              <th className="px-2 py-2 text-right">Kiosks</th>
              <th className="px-2 py-2 text-right">Punches, {ACTIVE_DAYS}d</th>
              <th className="px-4 py-2">Last punch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {usage.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2">
                  <span className="font-medium">{b.name}</span>{" "}
                  {b.recentPunches > 0 ? <Badge tone="sage">Active</Badge> : <Badge>Quiet</Badge>}
                  <span className="block text-xs text-ink/50">Joined {day.format(b.createdAt)}</span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {b.team}
                  <span className="block text-xs text-ink/50">{b.withEmail} sign-in</span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{b.managers}</td>
                <td className="px-2 py-2 text-right tabular-nums">{b.kiosks}</td>
                <td className="px-2 py-2 text-right tabular-nums">{b.recentPunches}</td>
                <td className="px-4 py-2 text-ink/70">{b.lastPunchAt ? day.format(b.lastPunchAt) : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-ink/50">
        App Store installs and downloads are in App Store Connect under Analytics.
      </p>
    </main>
  );
}

function Stat({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">{label}</p>
      <p className="mt-1 font-serif text-3xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-ink/60">{detail}</p>
    </Card>
  );
}
