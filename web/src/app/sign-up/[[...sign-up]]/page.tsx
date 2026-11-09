import { SignUp } from "@clerk/nextjs";
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
        Use the email your manager added for you. Other emails can sign up but won&rsquo;t see anything.
      </p>
    </main>
  );
}
