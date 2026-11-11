import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FramedPanel, Wordmark } from "@/components/ui";
import { getDb } from "@/db";
import { getSignedIn } from "@/lib/server/session";
import { soleManagerMessage, soleManagerOf } from "@/lib/server/system";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = { title: "Account · Metzey" };

export default async function AccountPage() {
  const signedIn = await getSignedIn();
  if (!signedIn) redirect("/sign-in?redirect_url=/account");
  const sole = signedIn.email ? await soleManagerOf(await getDb(), signedIn.email) : [];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-10">
      <Wordmark size="lg" />
      <FramedPanel className="w-full max-w-md px-8 py-6">
        <p className="font-serif text-2xl font-semibold">Delete my account</p>
        <p className="mt-2 text-sm text-ink/70">
          This deletes the login for <strong>{signedIn.email ?? "this account"}</strong> and removes that email from every
          team it&rsquo;s on. Businesses keep the work records they need, like past timesheets, under your name. This
          can&rsquo;t be undone.
        </p>
        {sole.length > 0 ? (
          <p role="alert" className="mt-4 text-sm font-medium text-red-700">
            {soleManagerMessage(sole)}
          </p>
        ) : (
          <DeleteAccountForm />
        )}
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-porcelain hover:underline">
          Back
        </Link>
      </FramedPanel>
    </main>
  );
}
