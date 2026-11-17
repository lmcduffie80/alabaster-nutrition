import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { PLAN_PRICE, TRIAL_DAYS, trialDaysLeft } from "@/lib/domain/billing";
import { formatDay, localDateOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { isInApp } from "@/lib/server/in-app";
import { planFor, withManager } from "@/lib/server/session";
import { COMPANY, SUPPORT_EMAIL } from "@/lib/company";
import { ActionForm, SubmitButton } from "../forms";
import { manageBillingAction, subscribeAction } from "./actions";

export const metadata: Metadata = { title: "Billing · Metzey" };

export default async function BillingPage({ searchParams }: PageProps<"/manage/billing">) {
  const { subscribed } = await searchParams;
  return withManager(
    async (db, manager) => {
      const [{ billing, access }, { timeZone }, inApp] = await Promise.all([planFor(manager.businessId), getBusiness(db), isInApp()]);
      const now = new Date();
      const day = (at: Date) => formatDay(localDateOf(at, timeZone));
      const daysLeft = trialDaysLeft(billing, now);
      const canPay = !inApp && manager.via === "account";
      const pastDue = billing.planStatus === "past_due";

      const status =
        access === "exempt" ? (
          <p>This business is on a free plan. There&rsquo;s nothing to pay.</p>
        ) : access === "active" ? (
          <p>
            <Badge tone={pastDue ? "red" : "sage"}>{pastDue ? "Payment failed" : "Active"}</Badge>{" "}
            {pastDue
              ? "Your last payment didn't go through. Update your card to keep using Metzey."
              : billing.planRenewsAt
                ? `Renews ${day(billing.planRenewsAt)}.`
                : "Your plan is active."}
          </p>
        ) : access === "trial" ? (
          <p>
            <Badge tone="porcelain">Free trial</Badge> {daysLeft} {daysLeft === 1 ? "day" : "days"} left
            {billing.trialEndsAt && `, until ${day(billing.trialEndsAt)}`}.
          </p>
        ) : (
          <p>
            <Badge tone="red">Plan ended</Badge>{" "}
            {billing.planStatus === "canceled" ? "Your plan was cancelled." : `Your ${TRIAL_DAYS}-day trial has ended.`} Your
            team&rsquo;s schedules, timesheets, and inventory are saved. Subscribe to pick up where you left off.
          </p>
        );

      return (
        <div className="max-w-2xl">
          <h1 className="font-serif text-3xl font-semibold">Billing</h1>
          {subscribed && access === "active" && (
            <p className="mt-4 rounded-xl bg-sage-light px-4 py-3 text-sm">Thanks! Your plan is active.</p>
          )}
          {subscribed && access !== "active" && access !== "exempt" && (
            <p className="mt-4 rounded-xl bg-porcelain-light px-4 py-3 text-sm">
              Payment received. It can take a minute to show here. Refresh the page.
            </p>
          )}
          <Card className="mt-6 space-y-4 text-sm text-ink/80">
            {status}
            {access !== "exempt" &&
              (inApp ? (
                <p className="text-ink/60">
                  Manage your Metzey plan at app.alabasternutrition.com on a computer, or in Safari.
                </p>
              ) : manager.via !== "account" ? (
                <p className="text-ink/60">Sign in with the manager&rsquo;s own account to manage billing.</p>
              ) : (
                <>
                  {(access === "trial" || access === "ended") && (
                    <div>
                      <p className="mb-2">
                        <strong>{PLAN_PRICE}</strong> for your whole team: the time clock, schedules, timesheets, and
                        inventory. Cancel any time.
                      </p>
                      <ActionForm action={subscribeAction}>
                        <SubmitButton>
                          {billing.stripeSubscriptionId ? "Subscribe again" : "Subscribe"} for {PLAN_PRICE}
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  )}
                  {billing.stripeCustomerId && (
                    <ActionForm action={manageBillingAction}>
                      <SubmitButton variant="secondary">
                        {pastDue ? "Update payment method" : "Manage billing and invoices"}
                      </SubmitButton>
                    </ActionForm>
                  )}
                </>
              ))}
          </Card>
          {canPay && access !== "exempt" && (
            <p className="mt-4 text-xs text-ink/50">
              Payments are handled by Stripe for {COMPANY}. See the{" "}
              <Link href="/terms" className="underline">
                Terms
              </Link>
              . Questions? <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>
            </p>
          )}
        </div>
      );
    },
    { anyPlan: true },
  );
}
