"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getSignedIn } from "@/lib/server/session";
import { forgetEmail, soleManagerMessage, soleManagerOf } from "@/lib/server/system";

export type DeleteAccountState = { error?: string; at?: number } | null;

export async function deleteAccountAction(_: DeleteAccountState, form: FormData): Promise<DeleteAccountState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/account");
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: "Type DELETE to confirm.", at: Date.now() };
  }

  const email = (await getSignedIn())?.email;
  if (email) {
    const db = await getDb();
    const sole = await soleManagerOf(db, email);
    if (sole.length > 0) {
      return { error: soleManagerMessage(sole), at: Date.now() };
    }
    await forgetEmail(db, email);
  }
  await (await clerkClient()).users.deleteUser(userId);
  redirect("/sign-in?reason=deleted");
}
