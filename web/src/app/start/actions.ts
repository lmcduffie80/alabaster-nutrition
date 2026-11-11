"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { UserError } from "@/lib/server/errors";
import { redeemInvite } from "@/lib/server/invites";
import { chooseBusiness, getSignedIn } from "@/lib/server/session";

export type StartState = { error?: string; at?: number } | null;

export async function startBusinessAction(_: StartState, form: FormData): Promise<StartState> {
  const signedIn = await getSignedIn();
  if (!signedIn?.email) redirect("/");
  let businessId: number;
  try {
    businessId = await redeemInvite(await getDb(), {
      token: String(form.get("invite") ?? ""),
      email: signedIn.email,
      displayName: signedIn.firstName || signedIn.email.split("@")[0],
      businessName: String(form.get("name") ?? ""),
      timeZone: String(form.get("timeZone") ?? ""),
      now: new Date(),
    });
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, at: Date.now() };
    throw error;
  }
  await chooseBusiness(businessId);
  redirect("/manage");
}
