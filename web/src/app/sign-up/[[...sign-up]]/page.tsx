import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/ui";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <Wordmark size="lg" />
      <Suspense>
        <SignUp fallbackRedirectUrl="/" signInUrl="/sign-in" />
      </Suspense>
      <p className="max-w-sm text-center text-xs text-ink/50">
        Joining a team? Use the email your manager added for you. Owners: create an account, then set up your
        business.
      </p>
      <p className="text-xs text-ink/50">
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
      </p>
    </main>
  );
}
