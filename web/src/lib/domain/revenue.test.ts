import { describe, expect, it } from "vitest";
import { estimatedCardFeeCents, recentMonths, subscriptionMetrics, type SubscriberRow } from "./revenue";

const now = new Date("2026-11-22T15:00:00Z");
const day = 86_400_000;
const at = (days: number) => new Date(now.getTime() + days * day);

let nextId = 1;
function row(fields: Partial<SubscriberRow>): SubscriberRow {
  const id = nextId++;
  return {
    id,
    name: `Business ${id}`,
    createdAt: at(-30),
    billingExempt: false,
    trialEndsAt: null,
    planStatus: null,
    planRenewsAt: null,
    stripeSubscriptionId: null,
    ...fields,
  };
}

describe("subscriptionMetrics", () => {
  it("sorts businesses by plan and prices the recurring revenue", () => {
    const m = subscriptionMetrics(
      [
        row({ billingExempt: true, planStatus: "active" }),
        row({ planStatus: "active", planRenewsAt: at(10), stripeSubscriptionId: "sub_1" }),
        row({ planStatus: "trialing", stripeSubscriptionId: "sub_2" }),
        row({ planStatus: "past_due", planRenewsAt: at(-2), stripeSubscriptionId: "sub_3" }),
        row({ planStatus: "past_due", planRenewsAt: at(-30), stripeSubscriptionId: "sub_4" }),
        row({ planStatus: "canceled", stripeSubscriptionId: "sub_5" }),
        row({ trialEndsAt: at(3), name: "Soon" }),
        row({ trialEndsAt: at(1), name: "Sooner" }),
        row({ trialEndsAt: at(12) }),
        row({ trialEndsAt: at(-1) }),
      ],
      now,
      499,
    );
    expect(m).toMatchObject({ free: 1, paying: 2, pastDue: 1, trials: 3, cancelled: 2, lapsedTrials: 1 });
    expect(m.mrrCents).toBe(3 * 499);
    expect(m.trialMrrCents).toBe(3 * 499);
    expect(m.trialsEndingSoon.map((t) => t.name)).toEqual(["Sooner", "Soon"]);
    expect(m.conversion).toBeCloseTo(5 / 6);
  });

  it("has no conversion rate until a trial is decided", () => {
    const m = subscriptionMetrics([row({ trialEndsAt: at(5) })], now, 499);
    expect(m.conversion).toBeNull();
    expect(m.mrrCents).toBe(0);
  });
});

describe("estimatedCardFeeCents", () => {
  it("charges 2.9% plus 30¢ on real payments only", () => {
    expect(estimatedCardFeeCents(499)).toBe(44);
    expect(estimatedCardFeeCents(0)).toBe(0);
  });
});

describe("recentMonths", () => {
  it("counts back across the year boundary in Eastern time", () => {
    expect(recentMonths(new Date("2026-02-01T03:00:00Z"), 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(recentMonths(now)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
  });
});
