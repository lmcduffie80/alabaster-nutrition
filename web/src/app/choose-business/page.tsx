import { SignOutButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, FramedPanel, Wordmark } from "@/components/ui";
import { businessesForEmail } from "@/lib/server/system";
import { getDb } from "@/db";
import { getViewer } from "@/lib/server/session";
import { chooseBusinessAction } from "./actions";

export const metadata: Metadata = { title: "Choose a business" };

export default async function ChooseBusinessPage() {
  const viewer = await getViewer();
  if (viewer?.kind !== "chooseBusiness" && viewer?.kind !== "manager" && viewer?.kind !== "employee") redirect("/");
  const options = viewer.kind === "chooseBusiness" ? viewer.options : await businessesForEmail(await getDb(), viewer.email);
  if (options.length < 2) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <Wordmark size="lg" />
      <FramedPanel className="w-full max-w-sm px-8 py-6">
        <p className="text-center font-serif text-2xl font-semibold">Choose a business</p>
        <p className="mt-2 text-center text-sm text-ink/70">{viewer.email} is on more than one team.</p>
        <form action={chooseBusinessAction} className="mt-5 grid gap-2">
          {options.map((option) => (
            <button
              key={option.businessId}
              name="businessId"
              value={option.businessId}
              className="rounded-xl border border-ink/10 bg-white px-4 py-3 text-left hover:border-porcelain"
            >
              <span className="block font-semibold">{option.businessName}</span>
              <span className="text-xs text-ink/60">{option.role === "manager" ? "Manager" : "Employee"}</span>
            </button>
          ))}
        </form>
        <div className="mt-5 text-center">
          <SignOutButton>
            <Button variant="secondary">Sign out</Button>
          </SignOutButton>
        </div>
      </FramedPanel>
    </main>
  );
}
