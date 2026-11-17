import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui";
import { COMPANY, SUPPORT_EMAIL } from "@/lib/company";

export const metadata: Metadata = { title: "Support · Metzey" };

const CONTACT = SUPPORT_EMAIL;

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Wordmark />
      <h1 className="mt-6 font-serif text-3xl font-semibold">Support</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink/80">
        Metzey gives small businesses a store time clock, staff schedules, timesheets, and inventory tracking. For help,
        email{" "}
        <a href={`mailto:${CONTACT}`} className="text-porcelain hover:underline">
          {CONTACT}
        </a>{" "}
        and we&rsquo;ll reply within two business days.
      </p>

      <Section title="Getting started">
        To set up your business, create an account, then choose{" "}
        <Link href="/start" className="text-porcelain hover:underline">
          Set up your business
        </Link>
        . New businesses start with a free trial. Staff don&rsquo;t sign up on their own: the manager adds them on the
        Team page, and they sign in with that email.
      </Section>

      <Section title="Clocking in">
        Clocking in happens on the store iPad. The manager signs in on it and chooses{" "}
        <strong>Settings → Make this the store kiosk</strong>; after that it shows a PIN keypad for the team.
      </Section>

      <Section title="Your account">
        You can delete your account on the{" "}
        <Link href="/account" className="text-porcelain hover:underline">
          Account
        </Link>{" "}
        page. See the{" "}
        <Link href="/privacy" className="text-porcelain hover:underline">
          privacy policy
        </Link>{" "}
        for what we keep and why.
      </Section>

      <Section title="Plans and billing">
        Managers handle their plan under <strong>Billing</strong> on the website: subscribe, update the card, download
        invoices, or cancel. See the{" "}
        <Link href="/terms" className="text-porcelain hover:underline">
          terms
        </Link>{" "}
        for how billing and refunds work. Metzey is provided by {COMPANY}.
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink/80">{children}</p>
    </section>
  );
}
