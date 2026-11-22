import { planAccess, type BillingFields } from "./billing";

const DAY = 86_400_000;
export const TRIAL_ENDING_DAYS = 7;

export type SubscriberRow = BillingFields & {
  id: number;
  name: string;
  createdAt: Date;
  stripeSubscriptionId: string | null;
};

export type SubscriptionMetrics = {
  /** Subscribed and current (Stripe "active" or "trialing"). */
  paying: number;
  /** A renewal failed; still open while Stripe retries the card. */
  pastDue: number;
  trials: number;
  trialsEndingSoon: { id: number; name: string; endsAt: Date }[];
  /** Billing-exempt businesses, like Alabaster and the demo. */
  free: number;
  /** Subscribed once, then cancelled or stopped paying. */
  cancelled: number;
  /** Trial ran out without subscribing. */
  lapsedTrials: number;
  /** Monthly recurring revenue in cents, counting past-due subscriptions that are still open. */
  mrrCents: number;
  /** If every current trial subscribes. */
  trialMrrCents: number;
  /** Of businesses whose trial is over (or that subscribed early), the share that ever subscribed. */
  conversion: number | null;
};

export function subscriptionMetrics(rows: SubscriberRow[], now: Date, priceCents: number): SubscriptionMetrics {
  let paying = 0;
  let pastDue = 0;
  let free = 0;
  let cancelled = 0;
  let lapsedTrials = 0;
  const trials: SubscriberRow[] = [];
  for (const row of rows) {
    const access = planAccess(row, now);
    if (access === "exempt") free++;
    else if (access === "active" && row.planStatus === "past_due") pastDue++;
    else if (access === "active") paying++;
    else if (access === "trial") trials.push(row);
    else if (row.stripeSubscriptionId) cancelled++;
    else lapsedTrials++;
  }
  const subscribedEver = paying + pastDue + cancelled;
  const decided = subscribedEver + lapsedTrials;
  return {
    paying,
    pastDue,
    trials: trials.length,
    trialsEndingSoon: trials
      .filter((t) => t.trialEndsAt && t.trialEndsAt.getTime() - now.getTime() <= TRIAL_ENDING_DAYS * DAY)
      .map((t) => ({ id: t.id, name: t.name, endsAt: t.trialEndsAt! }))
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime()),
    free,
    cancelled,
    lapsedTrials,
    mrrCents: (paying + pastDue) * priceCents,
    trialMrrCents: trials.length * priceCents,
    conversion: decided ? subscribedEver / decided : null,
  };
}

/** Stripe's standard US card pricing, per successful payment: 2.9% + 30¢. */
export function estimatedCardFeeCents(amountCents: number) {
  return amountCents > 0 ? Math.round(amountCents * 0.029) + 30 : 0;
}

export const REVENUE_MONTHS = 6;

const monthKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" });
/** YYYY-MM in Eastern time. */
export const monthOf = (at: Date) => monthKey.format(at).slice(0, 7);

/** The last `count` months, oldest first, as YYYY-MM. */
export function recentMonths(now: Date, count = REVENUE_MONTHS) {
  const [year, month] = monthOf(now).split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
