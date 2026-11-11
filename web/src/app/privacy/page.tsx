import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy Policy · Alabaster" };

const CONTACT = "lee@innovative-cc.com";
const UPDATED = "November 10, 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Wordmark />
      <h1 className="mt-6 font-serif text-3xl font-semibold">Privacy Policy</h1>
      <p className="text-sm text-ink/60">Last updated {UPDATED}</p>

      <Section title="Who we are">
        This policy covers the Alabaster website at app.alabasternutrition.com and the Alabaster iPhone and iPad app,
        which shows the same website. They are run by Donald McDuffie (&ldquo;we&rdquo;). The service gives small
        businesses a time clock, staff schedules, timesheets, and inventory tracking. Each business&rsquo;s information
        is kept separate and is only visible to people on that business&rsquo;s team.
      </Section>

      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Account details:</strong> your name and email address, used to sign you in.
          </li>
          <li>
            <strong>Team details</strong> entered by your manager: names, emails, roles, and a 4-digit clock-in PIN. PINs
            are stored only in scrambled (hashed) form and can&rsquo;t be read back.
          </li>
          <li>
            <strong>Work records:</strong> clock-in and clock-out times, breaks, scheduled shifts, timesheet approvals,
            and a history of any changes managers make to them.
          </li>
          <li>
            <strong>Business records:</strong> business settings, inventory items, storage spots, suppliers, counts,
            deliveries, and photos of delivery invoices.
          </li>
          <li>
            <strong>Store devices:</strong> a name for each store iPad set up as a time clock, and when it was last used.
          </li>
        </ul>
        <p className="mt-2">
          We don&rsquo;t collect your location, contacts, or advertising identifiers, and we don&rsquo;t use analytics or
          advertising trackers. The app asks for the camera only when you choose to photograph an invoice.
        </p>
      </Section>

      <Section title="How we use it">
        Only to run the service for your business: signing you in, recording time, showing schedules and timesheets,
        tracking inventory, and reading invoice photos to fill in deliveries. We don&rsquo;t sell personal information or
        use it for advertising.
      </Section>

      <Section title="Who else handles it">
        We use a few providers to run the service, and they only process data on our behalf:
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Clerk</strong> handles sign-in and sends sign-in codes by email.
          </li>
          <li>
            <strong>Vercel</strong> hosts the website and stores invoice photos.
          </li>
          <li>
            <strong>Neon</strong> hosts the database.
          </li>
          <li>
            <strong>OpenAI</strong> reads invoice photos when a manager scans one, to suggest the supplier, items, and
            amounts.
          </li>
        </ul>
      </Section>

      <Section title="Cookies">
        We use only the cookies needed for the service to work: staying signed in, signing you out after 20 minutes
        without activity, remembering which business you chose, and recognizing a store iPad set up as the time clock.
      </Section>

      <Section title="How long we keep it">
        Records are kept while the business uses the service, so timesheets and inventory history stay available.
        Invoice photos that weren&rsquo;t saved with a delivery are removed within a day. A business can ask us to
        delete its data, and you can ask us to delete your account, at the email below.
      </Section>

      <Section title="Your choices">
        You can ask to see, correct, or delete your information. Your manager can also correct or remove your team
        details. Email us and we&rsquo;ll respond within 30 days.
      </Section>

      <Section title="Children">The service is for businesses and their staff, and isn&rsquo;t meant for children under 13.</Section>

      <Section title="Changes">If we change this policy, we&rsquo;ll update the date above.</Section>

      <Section title="Contact">
        <a href={`mailto:${CONTACT}`} className="text-porcelain hover:underline">
          {CONTACT}
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
