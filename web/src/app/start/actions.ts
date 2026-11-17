"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { UserError } from "@/lib/server/errors";
import { createOwnBusiness, redeemInvite } from "@/lib/server/invites";
import { chooseBusiness, getSignedIn } from "@/lib/server/session";

export type StartState = { error?: string; at?: number } | null;

export async function startBusinessAction(_: StartState, form: FormData): Promise<StartState> {
  const signedIn = await getSignedIn();
  if (!signedIn?.email) redirect("/");
  const token = String(form.get("invite") ?? "");
  const input = {
    email: signedIn.email,
    displayName: signedIn.firstName || signedIn.email.split("@")[0],
    businessName: String(form.get("name") ?? ""),
    timeZone: String(form.get("timeZone") ?? ""),
    now: new Date(),
  };
  let businessId: number;
  try {
    const db = await getDb();
    businessId = token ? await redeemInvite(db, { ...input, token }) : await createOwnBusiness(db, input);
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, at: Date.now() };
    throw error;
  }
  await chooseBusiness(businessId);
  redirect("/manage");
}
