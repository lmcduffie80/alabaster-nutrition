export const TRIAL_DAYS = 14;
/** How long a failed renewal keeps working while Stripe retries the card. */
export const PAST_DUE_GRACE_DAYS = 7;
export const PLAN_PRICE = "$4.99/month";

export type PlanAccess = "exempt" | "trial" | "active" | "ended";

export type BillingFields = {
  billingExempt: boolean;
  trialEndsAt: Date | null;
  planStatus: string | null;
  planRenewsAt: Date | null;
};

const DAY = 86_400_000;

export function trialEnd(from: Date) {
  return new Date(from.getTime() + TRIAL_DAYS * DAY);
}

export function planAccess(b: BillingFields, now: Date): PlanAccess {
  if (b.billingExempt) return "exempt";
  if (b.planStatus === "active" || b.planStatus === "trialing") return "active";
  if (b.planStatus === "past_due" && b.planRenewsAt && now.getTime() < b.planRenewsAt.getTime() + PAST_DUE_GRACE_DAYS * DAY) {
    return "active";
  }
  if (b.trialEndsAt && now < b.trialEndsAt) return "trial";
  return "ended";
}

/** Whole days left in the trial, counting a partial day as one. */
export function trialDaysLeft(b: BillingFields, now: Date) {
  if (!b.trialEndsAt) return 0;
  return Math.max(0, Math.ceil((b.trialEndsAt.getTime() - now.getTime()) / DAY));
}
