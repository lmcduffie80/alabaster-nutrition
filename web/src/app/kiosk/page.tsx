import type { Metadata } from "next";
import Link from "next/link";
import { FramedPanel, Wordmark } from "@/components/ui";
import { getDb } from "@/db";
import { getBusiness } from "@/lib/server/business";
import { currentKiosk } from "@/lib/server/session";
import { Kiosk } from "./kiosk";

export const metadata: Metadata = { title: "Time Clock · Alabaster Nutrition" };

export default async function KioskPage() {
  const kiosk = await currentKiosk();
  if (!kiosk) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
        <Wordmark size="lg" />
        <FramedPanel className="max-w-md px-8 py-6 text-center">
          <p className="font-serif text-2xl font-semibold">This device isn&rsquo;t the store kiosk</p>
          <p className="mt-2 text-sm text-ink/70">
            Clocking in only works on the store iPad. To set this device up as the kiosk, the manager signs in and
            chooses <strong>Settings → Make this the store kiosk</strong>.
          </p>
          <Link href="/sign-in" className="mt-4 inline-block text-sm font-semibold text-porcelain hover:underline">
            Manager sign-in
          </Link>
        </FramedPanel>
      </main>
    );
  }
  const business = await getBusiness(await getDb());
  return (
    <main className="h-dvh select-none overflow-hidden">
      <Kiosk autoReturnSeconds={business.kioskAutoReturnSeconds} timeZone={business.timeZone} />
    </main>
  );
}
