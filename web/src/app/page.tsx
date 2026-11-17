import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, FramedPanel, Wordmark } from "@/components/ui";
import { PLAN_PRICE, TRIAL_DAYS } from "@/lib/domain/billing";
import { isInApp } from "@/lib/server/in-app";
import { currentKiosk, getManager, getViewer } from "@/lib/server/session";

export default async function Home() {
  const viewer = await getViewer();
  if (viewer?.kind === "manager") redirect("/manage");
  if (viewer?.kind === "employee") redirect("/schedule");
  if (viewer?.kind === "chooseBusiness") redirect("/choose-business");
  if (!viewer && (await getManager())) redirect("/manage");
  if (!viewer && (await currentKiosk())) redirect("/kiosk");
  const price = (await isInApp()) ? null : `Free for ${TRIAL_DAYS} days, then ${PLAN_PRICE} for your whole team.`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <Wordmark size="lg" />
      <FramedPanel className="max-w-sm px-8 py-6 text-center">
        {viewer?.kind === "noAccess" ? (
          <>
            <p className="font-serif text-2xl font-semibold">No access yet</p>
            <p className="mt-2 text-sm text-ink/70">
              {viewer.email ? `${viewer.email} isn't on a team yet.` : "Your email isn't verified yet."} If you work
              somewhere that uses Metzey, ask the manager to add your email, then sign in again.
            </p>
            {viewer.email && <StartLink price={price} />}
            <div className="mt-4">
              <SignOutButton>
                <Button variant="secondary">Sign out</Button>
              </SignOutButton>
            </div>
            <Link href="/account" className="mt-3 inline-block text-xs text-ink/50 hover:underline">
              Delete my account
            </Link>
          </>
        ) : (
          <>
            <p className="font-serif text-2xl font-semibold">Welcome</p>
            <p className="mt-2 text-sm text-ink/70">Sign in with your email to see your schedule.</p>
            <Link
              href="/sign-in"
              className="mt-4 inline-flex rounded-xl bg-porcelain px-4 py-2 text-sm font-semibold text-white hover:bg-porcelain-dark"
            >
              Sign in
            </Link>
            <StartLink price={price} />
          </>
        )}
      </FramedPanel>
      <p className="text-xs text-ink/50">Clocking in happens on the store iPad.</p>
    </main>
  );
}

function StartLink({ price }: { price: string | null }) {
  return (
    <div className="mt-5 border-t border-ink/10 pt-4 text-sm">
      <p className="text-ink/70">Run a shop?</p>
      <Link href="/start" className="font-semibold text-porcelain hover:underline">
        Set up your business
      </Link>
      {price && <p className="mt-1 text-xs text-ink/50">{price}</p>}
    </div>
  );
}
