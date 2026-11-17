import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui";
import { COMPANY, SUPPORT_EMAIL } from "@/lib/company";
import { PAST_DUE_GRACE_DAYS, PLAN_PRICE, TRIAL_DAYS } from "@/lib/domain/billing";

export const metadata: Metadata = { title: "Terms of Service · Metzey" };

const UPDATED = "November 16, 2026";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Wordmark />
      <h1 className="mt-6 font-serif text-3xl font-semibold">Terms of Service</h1>
      <p className="text-sm text-ink/60">Last updated {UPDATED}</p>

      <Section title="Who we are">
        Metzey is provided by {COMPANY} (&ldquo;we&rdquo;). These terms cover the website at app.alabasternutrition.com
        and the Metzey iPhone and iPad app. By creating a business or signing in, you agree to them.
      </Section>

      <Section title="The service">
        Metzey gives a business a store time clock, staff schedules, timesheets, and inventory tracking. The person who
        creates a business is its manager and is responsible for who they add to the team and for the information they
        enter. Timesheets are a record to help with payroll; you&rsquo;re responsible for checking them and for paying
        your staff correctly.
      </Section>

      <Section title="Free trial and price">
        A new business gets a {TRIAL_DAYS}-day free trial, with no card needed. After that, Metzey costs {PLAN_PRICE} per
        business, in US dollars, for the whole team. Staff never pay. Prices don&rsquo;t include any sales tax that
        applies where you are.
      </Section>

      <Section title="Billing">
        Subscriptions are bought on the website, not in the app, and are paid by card through Stripe. Your plan renews
        every month on the day you subscribed, and we charge the card on file at each renewal until you cancel. If a
        payment fails, Stripe retries it, and Metzey keeps working for {PAST_DUE_GRACE_DAYS} days while you update your
        card. Your card details go to Stripe and never reach us. Charges appear as {COMPANY} or Metzey.
      </Section>

      <Section title="Cancelling and refunds">
        Cancel any time from <strong>Billing → Manage billing and invoices</strong> on the website. Your plan keeps
        working until the end of the month you&rsquo;ve paid for, and isn&rsquo;t charged again. We don&rsquo;t give
        refunds for partial months. If you think you were charged by mistake, email us within 30 days and we&rsquo;ll
        make it right.
      </Section>

      <Section title="When a plan ends">
        When the trial or a paid plan ends, nothing is deleted. The time clock and manager tools pause until the business
        subscribes, and staff can still see their schedule. A business can ask us to delete its data at any time.
      </Section>

      <Section title="Fair use">
        Don&rsquo;t use Metzey to break the law, to get into another business&rsquo;s information, or to disrupt the
        service. We may suspend a business that does, after telling the manager why when we can.
      </Section>

      <Section title="Your data">
        Your business&rsquo;s records belong to your business. How we handle them is in the{" "}
        <Link href="/privacy" className="text-porcelain hover:underline">
          privacy policy
        </Link>
        .
      </Section>

      <Section title="No guarantees">
        We work to keep Metzey available and accurate, but the service is provided as it is, without warranties. To the
        extent the law allows, {COMPANY}&rsquo;s total liability for any claim is limited to what your business paid us
        in the three months before it.
      </Section>

      <Section title="Changes">
        If we change these terms or the price, we&rsquo;ll update the date above and email managers at least 30 days
        before a price change takes effect.
      </Section>

      <Section title="Contact">
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-porcelain hover:underline">
          {SUPPORT_EMAIL}
        </a>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      <div className="mt-1 text-sm leading-relaxed text-ink/80">{children}</div>
    </section>
  );
}
