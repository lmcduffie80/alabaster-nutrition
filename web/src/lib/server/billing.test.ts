import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "@/db";
import { openLocalDatabase } from "@/db/local";
import { planAccess } from "@/lib/domain/billing";
import { billingOf, handleStripeEvent, renewsAt, verifyStripeEvent } from "./billing";
import { createBusiness } from "./system";

let db: Db;
const now = new Date("2026-11-20T15:00:00Z");
const renewal = Math.floor(new Date("2026-12-20T15:00:00Z").getTime() / 1000);

function subscription(id: string, status: Stripe.Subscription.Status, extra: Partial<Stripe.Subscription> = {}) {
  return {
    id,
    object: "subscription",
    status,
    customer: "cus_bean",
    metadata: { businessId: "2" },
    items: { data: [{ current_period_end: renewal }] },
    ...extra,
  } as unknown as Stripe.Subscription;
}

function event(type: string, object: unknown) {
  return { id: `evt_${type}`, object: "event", type, data: { object } } as unknown as Stripe.Event;
}

beforeEach(async () => {
  db = await openLocalDatabase();
  await createBusiness(db, { id: 1, name: "Alabaster Nutrition", now });
  await createBusiness(db, { id: 2, name: "Bean Bar", now });
  await db.update(schema.business).set({ stripeCustomerId: "cus_bean" }).where(eq(schema.business.id, 2));
});

describe("Stripe webhooks", () => {
  it("activate the business once checkout finishes, using Stripe's current copy", async () => {
    const latest = subscription("sub_1", "active");
    await handleStripeEvent(db, event("checkout.session.completed", { mode: "subscription", subscription: "sub_1" }), async (id) => {
      expect(id).toBe("sub_1");
      return latest;
    });
    const billing = await billingOf(db, 2);
    expect(billing).toMatchObject({ stripeSubscriptionId: "sub_1", planStatus: "active", planRenewsAt: new Date(renewal * 1000) });
    expect(planAccess(billing, now)).toBe("active");
    expect((await billingOf(db, 1)).planStatus).toBeNull();
  });

  it("end the plan when the subscription is cancelled", async () => {
    await handleStripeEvent(db, event("customer.subscription.created", { id: "sub_1" }), async () => subscription("sub_1", "active"));
    await handleStripeEvent(db, event("customer.subscription.deleted", { id: "sub_1" }), async () => subscription("sub_1", "canceled"));
    const billing = await billingOf(db, 2);
    expect(billing.planStatus).toBe("canceled");
    expect(planAccess(billing, new Date("2026-12-10T00:00:00Z"))).toBe("ended");
  });

  it("find the business by customer when metadata is missing", async () => {
    await handleStripeEvent(db, event("customer.subscription.updated", { id: "sub_2" }), async () =>
      subscription("sub_2", "past_due", { metadata: {} }),
    );
    expect((await billingOf(db, 2)).planStatus).toBe("past_due");
  });

  it("don't let an old finished subscription replace a live one", async () => {
    await handleStripeEvent(db, event("customer.subscription.created", { id: "sub_new" }), async () => subscription("sub_new", "active"));
    await handleStripeEvent(db, event("customer.subscription.deleted", { id: "sub_old" }), async () => subscription("sub_old", "canceled"));
    expect(await billingOf(db, 2)).toMatchObject({ stripeSubscriptionId: "sub_new", planStatus: "active" });
  });

  it("ignore one-time checkouts and other events", async () => {
    const never = async () => {
      throw new Error("shouldn't fetch");
    };
    await handleStripeEvent(db, event("checkout.session.completed", { mode: "payment", subscription: null }), never);
    await handleStripeEvent(db, event("invoice.paid", { id: "in_1" }), never);
    expect((await billingOf(db, 2)).planStatus).toBeNull();
  });

  it("use the latest item's billing period as the renewal date", () => {
    const later = renewal + 86_400;
    expect(renewsAt(subscription("s", "active", { items: { data: [{ current_period_end: renewal }, { current_period_end: later }] } } as never))).toEqual(
      new Date(later * 1000),
    );
    expect(renewsAt(subscription("s", "active", { items: { data: [] } } as never))).toBeNull();
  });
});

describe("Stripe signatures", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: {} } });

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_unused";
  });

  it("accept only bodies Stripe signed", () => {
    const header = new Stripe("sk_test_unused").webhooks.generateTestHeaderString({ payload: body, secret });
    expect(verifyStripeEvent(body, header, secret)?.id).toBe("evt_1");
    expect(verifyStripeEvent(body.replace("evt_1", "evt_2"), header, secret)).toBeNull();
    expect(verifyStripeEvent(body, header, "whsec_other")).toBeNull();
    expect(verifyStripeEvent(body, null, secret)).toBeNull();
    expect(verifyStripeEvent(body, header, undefined)).toBeNull();
  });
});
