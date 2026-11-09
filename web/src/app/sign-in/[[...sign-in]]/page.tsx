import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { Wordmark } from "@/components/ui";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <Wordmark size="lg" />
      <Suspense>
        <SignIn fallbackRedirectUrl="/" signUpUrl="/sign-up" />
      </Suspense>
      <p className="max-w-sm text-center text-xs text-ink/50">
        First time? Use the email your manager added for you and choose &ldquo;Sign up&rdquo;.
      </p>
    </main>
  );
}
