"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { checkoutUrl, portalUrl } from "@/lib/server/billing";
import { UserError } from "@/lib/server/errors";
import { isInApp } from "@/lib/server/in-app";
import { siteOrigin } from "@/lib/server/origin";
import { requireManagerAccount } from "@/lib/server/session";
import type { FormState } from "../manager-form";

/** Builds a Stripe link and sends the manager there. Only on the website, and only with the manager's own login. */
async function toStripe(build: (db: Awaited<ReturnType<typeof getDb>>, businessId: number, email: string, origin: string) => Promise<string>) {
  let url: string;
  try {
    if (await isInApp()) throw new UserError("Plans are managed on the website.");
    const manager = await requireManagerAccount();
    url = await build(await getDb(), manager.businessId, manager.actor, await siteOrigin());
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, at: Date.now() };
    console.error("Couldn't open Stripe", error);
    return { error: "Couldn't reach the payment page. Try again in a minute.", at: Date.now() };
  }
  redirect(url);
}

export async function subscribeAction(): Promise<FormState> {
  return toStripe(checkoutUrl);
}

export async function manageBillingAction(): Promise<FormState> {
  return toStripe((db, businessId, _email, origin) => portalUrl(db, businessId, origin));
}
