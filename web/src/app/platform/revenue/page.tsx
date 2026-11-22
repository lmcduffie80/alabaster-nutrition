import type { Metadata } from "next";
import { Card, SectionTitle } from "@/components/ui";
import {
  formatCents,
  monthOf,
  recentMonths,
  REVENUE_MONTHS,
  subscriptionMetrics,
  TRIAL_ENDING_DAYS,
} from "@/lib/domain/revenue";
import { stripeRevenue, subscribers } from "@/lib/server/revenue";
import { requirePlatformOwner } from "@/lib/server/session";
import { PlatformHeader } from "../platform-header";

export const metadata: Metadata = { title: "Revenue · Platform" };

const FALLBACK_PRICE_CENTS = 499;

export default async function PlatformRevenue() {
  const { db } = await requirePlatformOwner("/platform/revenue");
  const now = new Date();
  const rows = await subscribers(db);
  const customerIds = rows.flatMap((r) => (r.stripeCustomerId ? [r.stripeCustomerId] : []));
  const collected = await stripeRevenue(customerIds, now);
  const priceCents = collected?.priceCents || FALLBACK_PRICE_CENTS;
  const m = subscriptionMetrics(rows, now, priceCents);
  const subscribed = m.paying + m.pastDue;

  const months = recentMonths(now);
  const signups = new Map<string, number>();
  for (const r of rows) signups.set(monthOf(r.createdAt), (signups.get(monthOf(r.createdAt)) ?? 0) + 1);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  const sixMonthCents = months.reduce((sum, key) => sum + (collected?.byMonth.get(key)?.cents ?? 0), 0);
  const topCents = Math.max(1, ...months.map((key) => collected?.byMonth.get(key)?.cents ?? 0));

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <PlatformHeader current="/platform/revenue" />

      <h1 className="mt-6 font-serif text-3xl font-semibold">Revenue</h1>
      <p className="text-sm text-ink/60">
        Metzey subscriptions at {formatCents(priceCents)} a month per business. Free businesses aren&rsquo;t counted.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Monthly recurring"
          value={formatCents(m.mrrCents)}
          detail={`${formatCents(m.mrrCents * 12)} a year at this pace`}
        />
        <Stat
          label="Subscribed"
          value={subscribed}
          detail={m.pastDue ? `${m.pastDue} with a failed card` : "All payments current"}
        />
        <Stat
          label="On trial"
          value={m.trials}
          detail={m.trials ? `+${formatCents(m.trialMrrCents)}/mo if all subscribe` : "No trials right now"}
        />
        <Stat
          label="Trial conversion"
          value={m.conversion === null ? "—" : `${Math.round(m.conversion * 100)}%`}
          detail={`${m.lapsedTrials} trials ended unpaid · ${m.cancelled} cancelled`}
        />
      </div>

      <SectionTitle>Collected</SectionTitle>
      {collected ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Last 30 days"
              value={formatCents(collected.last30Cents)}
              detail={`${collected.last30Payments} payment${collected.last30Payments === 1 ? "" : "s"}`}
            />
            <Stat label={`Last ${REVENUE_MONTHS} months`} value={formatCents(sixMonthCents)} detail="Paid invoices" />
            <Stat
              label="After Stripe fees"
              value={formatCents(Math.max(0, sixMonthCents - collected.feesCents))}
              detail={`About ${formatCents(collected.feesCents)} in card fees`}
            />
            <Stat
              label="Cancelling"
              value={collected.cancelling}
              detail={collected.cancelling ? "Will end at the period's close" : "None scheduled to end"}
            />
          </div>
          <Card className="mt-3 overflow-x-auto p-0">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wider text-ink/50">
                  <th className="px-4 py-2">Month</th>
                  <th className="px-2 py-2 text-right">New businesses</th>
                  <th className="px-2 py-2 text-right">Payments</th>
                  <th className="px-2 py-2 text-right">Collected</th>
                  <th className="w-1/3 px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {months.toReversed().map((key) => {
                  const month = collected.byMonth.get(key);
                  const [year, mon] = key.split("-").map(Number);
                  return (
                    <tr key={key}>
                      <td className="px-4 py-2 font-medium">{monthLabel.format(new Date(Date.UTC(year, mon - 1, 1)))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{signups.get(key) ?? 0}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{month?.payments ?? 0}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatCents(month?.cents ?? 0)}</td>
                      <td className="px-4 py-2">
                        <div className="h-2 rounded-full bg-ink/5">
                          <div
                            className="h-2 rounded-full bg-sage"
                            style={{ width: `${((month?.cents ?? 0) / topCents) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-ink/50">
            Only Metzey customers are counted, not other Agrovus products on the same Stripe account. Fees are estimated
            at 2.9% + 30¢ per payment.
          </p>
        </>
      ) : (
        <Card>
          <p className="text-sm text-ink/70">
            Couldn&rsquo;t reach Stripe, so payments aren&rsquo;t shown. The counts above come from Metzey&rsquo;s own
            records.
          </p>
        </Card>
      )}

      <SectionTitle>Trials ending in {TRIAL_ENDING_DAYS} days</SectionTitle>
      <Card>
        {m.trialsEndingSoon.length ? (
          <ul className="divide-y divide-ink/5 text-sm">
            {m.trialsEndingSoon.map((t) => (
              <li key={t.id} className="flex justify-between py-1.5">
                <span className="font-medium">{t.name}</span>
                <span className="text-ink/60">Ends {day.format(t.endsAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink/60">None.</p>
        )}
      </Card>
      <p className="mt-3 text-xs text-ink/50">{m.free} free business{m.free === 1 ? "" : "es"} not billed.</p>
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
