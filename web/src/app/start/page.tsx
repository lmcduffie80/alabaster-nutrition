import { SignOutButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, FramedPanel, Wordmark } from "@/components/ui";
import { getDb } from "@/db";
import { checkInvite, inviteProblemMessage } from "@/lib/server/invites";
import { getSignedIn } from "@/lib/server/session";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "Set up your business" };

export default async function StartPage({ searchParams }: PageProps<"/start">) {
  const { invite } = await searchParams;
  const token = typeof invite === "string" ? invite : undefined;
  const signedIn = await getSignedIn();
  if (!signedIn) {
    redirect(`/sign-up?redirect_url=${encodeURIComponent(`/start?invite=${token ?? ""}`)}`);
  }

  let body;
  if (!signedIn.email) {
    body = <Problem message="Verify your email first, then open the sign-up link again." />;
  } else {
    const check = await checkInvite(await getDb(), token, signedIn.email, new Date());
    body =
      check.kind === "ok" ? (
        <>
          <p className="font-serif text-2xl font-semibold">Set up your business</p>
          <p className="mb-4 mt-1 text-sm text-ink/70">You&rsquo;ll be its manager. You can change these later in Settings.</p>
          <StartForm invite={token!} />
        </>
      ) : (
        <Problem message={inviteProblemMessage[check.kind]} />
      );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <Wordmark size="lg" />
      <FramedPanel className="w-full max-w-sm px-8 py-6">{body}</FramedPanel>
    </main>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <div className="text-center">
      <p className="font-serif text-2xl font-semibold">Can&rsquo;t use this link</p>
      <p className="mt-2 text-sm text-ink/70">{message}</p>
      <div className="mt-4">
        <SignOutButton redirectUrl="/sign-in">
          <Button variant="secondary">Sign in with another email</Button>
        </SignOutButton>
      </div>
    </div>
  );
}
