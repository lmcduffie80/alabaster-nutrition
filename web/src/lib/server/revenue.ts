import "server-only";
import { asc } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { estimatedCardFeeCents, monthOf, REVENUE_MONTHS, type SubscriberRow } from "@/lib/domain/revenue";
import { stripe } from "./billing";

/** For the platform owner only, like `platform.ts`. */

export async function subscribers(db: Db): Promise<(SubscriberRow & { stripeCustomerId: string | null })[]> {
  const b = schema.business;
  return db
    .select({
      id: b.id,
      name: b.name,
      createdAt: b.createdAt,
      billingExempt: b.billingExempt,
      trialEndsAt: b.trialEndsAt,
      planStatus: b.planStatus,
      planRenewsAt: b.planRenewsAt,
      stripeCustomerId: b.stripeCustomerId,
      stripeSubscriptionId: b.stripeSubscriptionId,
    })
    .from(b)
    .orderBy(asc(b.createdAt));
}

export type StripeRevenue = {
  priceCents: number;
  /** Active subscriptions set to end when the current period runs out. */
  cancelling: number;
  last30Cents: number;
  last30Payments: number;
  byMonth: Map<string, { cents: number; payments: number }>;
  feesCents: number;
};

/**
 * What Stripe actually collected. The Agrovus Stripe account also bills for other products, so only
 * invoices for Metzey's own customers count. `null` when Stripe can't be reached.
 */
export async function stripeRevenue(customerIds: string[], now: Date): Promise<StripeRevenue | null> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!process.env.STRIPE_SECRET_KEY || !priceId) return null;
  try {
    const api = stripe();
    const since = Math.floor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - REVENUE_MONTHS, 1)).getTime() / 1000);
    const ours = new Set(customerIds);
    const [price, invoices, subscriptions] = await Promise.all([
      api.prices.retrieve(priceId),
      ours.size
        ? api.invoices.list({ status: "paid", created: { gte: since }, limit: 100 }).autoPagingToArray({ limit: 5000 })
        : Promise.resolve([]),
      api.subscriptions.list({ price: priceId, status: "active", limit: 100 }).autoPagingToArray({ limit: 5000 }),
    ]);

    const byMonth = new Map<string, { cents: number; payments: number }>();
    const thirtyDaysAgo = now.getTime() - 30 * 86_400_000;
    let last30Cents = 0;
    let last30Payments = 0;
    let feesCents = 0;
    for (const invoice of invoices) {
      const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customer || !ours.has(customer) || invoice.amount_paid <= 0) continue;
      const paidAt = new Date((invoice.status_transitions.paid_at ?? invoice.created) * 1000);
      const month = byMonth.get(monthOf(paidAt)) ?? { cents: 0, payments: 0 };
      month.cents += invoice.amount_paid;
      month.payments++;
      byMonth.set(monthOf(paidAt), month);
      feesCents += estimatedCardFeeCents(invoice.amount_paid);
      if (paidAt.getTime() >= thirtyDaysAgo) {
        last30Cents += invoice.amount_paid;
        last30Payments++;
      }
    }

    return {
      priceCents: price.unit_amount ?? 0,
      cancelling: subscriptions.filter((s) => s.cancel_at_period_end || s.cancel_at).length,
      last30Cents,
      last30Payments,
      byMonth,
      feesCents,
    };
  } catch (error) {
    console.error("Couldn't load revenue from Stripe", error);
    return null;
  }
}
