import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, FramedPanel, Wordmark } from "@/components/ui";
import { currentKiosk, getViewer } from "@/lib/server/session";

export default async function Home() {
  const viewer = await getViewer();
  if (viewer?.kind === "manager") redirect("/manage");
  if (viewer?.kind === "employee") redirect("/schedule");
  if (!viewer && (await currentKiosk())) redirect("/kiosk");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <Wordmark size="lg" />
      <FramedPanel className="max-w-sm px-8 py-6 text-center">
        {viewer?.kind === "noAccess" ? (
          <>
            <p className="font-serif text-2xl font-semibold">No access yet</p>
            <p className="mt-2 text-sm text-ink/70">
              {viewer.email ? `${viewer.email} isn't on the team list.` : "Your email isn't verified yet."} Ask the manager
              to add your email, then sign in again.
            </p>
            <div className="mt-4">
              <SignOutButton>
                <Button variant="secondary">Sign out</Button>
              </SignOutButton>
            </div>
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
          </>
        )}
      </FramedPanel>
      <p className="text-xs text-ink/50">Clocking in happens on the store iPad.</p>
    </main>
  );
}
