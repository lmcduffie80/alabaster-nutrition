import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import Stripe from "stripe";
import { schema, type Db } from "@/db";
import { planAccess, type BillingFields } from "@/lib/domain/billing";
import { UserError } from "./errors";

/**
 * Platform-level, like `system.ts`: billing columns are written only here, never through `withBusiness`
 * (the tenant role can't update them).
 */

let client: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new UserError("Billing isn't set up yet. Try again later.");
  client ??= new Stripe(key);
  return client;
}

export type BusinessBilling = BillingFields & {
  id: number;
  name: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export async function billingOf(db: Db, businessId: number): Promise<BusinessBilling> {
  const [row] = await db
    .select({
      id: schema.business.id,
      name: schema.business.name,
      billingExempt: schema.business.billingExempt,
      trialEndsAt: schema.business.trialEndsAt,
      planStatus: schema.business.planStatus,
      planRenewsAt: schema.business.planRenewsAt,
      stripeCustomerId: schema.business.stripeCustomerId,
      stripeSubscriptionId: schema.business.stripeSubscriptionId,
    })
    .from(schema.business)
    .where(eq(schema.business.id, businessId));
  if (!row) throw new Error("That business no longer exists.");
  return row;
}

/** The business's Stripe customer, created on first use so every subscription event can be matched to it. */
export async function ensureStripeCustomer(db: Db, business: BusinessBilling, email: string): Promise<string> {
  if (business.stripeCustomerId) return business.stripeCustomerId;
  const customer = await stripe().customers.create(
    { name: business.name, email, metadata: { businessId: String(business.id) } },
    { idempotencyKey: `metzey-business-${business.id}-customer` },
  );
  await db
    .update(schema.business)
    .set({ stripeCustomerId: customer.id })
    .where(and(eq(schema.business.id, business.id), isNull(schema.business.stripeCustomerId)));
  return (await billingOf(db, business.id)).stripeCustomerId ?? customer.id;
}

export async function checkoutUrl(db: Db, businessId: number, email: string, origin: string): Promise<string> {
  const price = process.env.STRIPE_PRICE_ID;
  if (!price) throw new UserError("Billing isn't set up yet. Try again later.");
  const business = await billingOf(db, businessId);
  const access = planAccess(business, new Date());
  if (access === "exempt" || (access === "active" && business.planStatus !== "past_due")) {
    throw new UserError("This business already has an active plan.");
  }
  const customer = await ensureStripeCustomer(db, business, email);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: String(businessId),
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { businessId: String(businessId) } },
    allow_promotion_codes: true,
    success_url: `${origin}/manage/billing?subscribed=1`,
    cancel_url: `${origin}/manage/billing`,
  });
  if (!session.url) throw new Error("Stripe didn't return a checkout link.");
  return session.url;
}

export async function portalUrl(db: Db, businessId: number, origin: string): Promise<string> {
  const { stripeCustomerId } = await billingOf(db, businessId);
  if (!stripeCustomerId) throw new UserError("There's no billing account yet. Subscribe first.");
  const session = await stripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/manage/billing`,
    // Unset: the portal settings marked default in the Stripe dashboard.
    ...(process.env.STRIPE_PORTAL_CONFIGURATION ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION } : {}),
  });
  return session.url;
}

/** The latest renewal among the subscription's items; Stripe keeps the billing period on each item. */
export function renewsAt(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items.data.map((item) => item.current_period_end).filter((n) => typeof n === "number");
  return ends.length ? new Date(Math.max(...ends) * 1000) : null;
}

function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : (value?.id ?? null);
}

/** Saves what Stripe says about one subscription onto the business it belongs to. */
export async function saveSubscription(db: Db, subscription: Stripe.Subscription) {
  const customerId = idOf(subscription.customer);
  const fromMetadata = Number(subscription.metadata?.businessId);
  const [business] = await db
    .select({ id: schema.business.id, subscriptionId: schema.business.stripeSubscriptionId, planStatus: schema.business.planStatus })
    .from(schema.business)
    .where(
      Number.isSafeInteger(fromMetadata) && fromMetadata > 0
        ? eq(schema.business.id, fromMetadata)
        : eq(schema.business.stripeCustomerId, customerId ?? ""),
    );
  if (!business) {
    console.warn(`Stripe subscription ${subscription.id} doesn't match a business.`);
    return;
  }
  const current = business.subscriptionId === subscription.id;
  const live = subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due";
  // An old, finished subscription mustn't overwrite a newer live one.
  if (!current && business.subscriptionId && !live) return;
  await db
    .update(schema.business)
    .set({
      stripeSubscriptionId: subscription.id,
      planStatus: subscription.status,
      planRenewsAt: renewsAt(subscription),
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    })
    .where(eq(schema.business.id, business.id));
}

/** The event, if `signature` proves Stripe sent exactly `body`; otherwise `null`. */
export function verifyStripeEvent(body: string, signature: string | null, secret = process.env.STRIPE_WEBHOOK_SECRET): Stripe.Event | null {
  if (!signature || !secret) return null;
  try {
    return stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return null;
  }
}

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

/**
 * Events can arrive late or out of order, so this re-reads the subscription from Stripe and saves that,
 * rather than trusting the event's copy.
 */
export async function handleStripeEvent(
  db: Db,
  event: Stripe.Event,
  getSubscription: (id: string) => Promise<Stripe.Subscription> = (id) => stripe().subscriptions.retrieve(id),
) {
  let subscriptionId: string | null = null;
  if (event.type === "checkout.session.completed") {
    if (event.data.object.mode !== "subscription") return;
    subscriptionId = idOf(event.data.object.subscription);
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    subscriptionId = event.data.object.id;
  }
  if (!subscriptionId) return;
  await saveSubscription(db, await getSubscription(subscriptionId));
}
