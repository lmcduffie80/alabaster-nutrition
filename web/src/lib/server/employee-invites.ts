import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { UserError } from "./errors";

export type InviteResult = "sent" | "hasAccount";

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("No host header to build the invite link from.");
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Emails a Clerk invitation whose link opens sign-up with the address already confirmed. Afterwards the person
 * lands on their schedule, where they get their own PIN. People who already have a login just need to sign in.
 */
export async function emailEmployeeInvite(email: string): Promise<InviteResult> {
  const clerk = await clerkClient();
  try {
    const existing = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
    if (existing.totalCount > 0) return "hasAccount";
    await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: `${await siteOrigin()}/sign-up`,
      notify: true,
      // Re-sending replaces a still-pending invite instead of failing.
      ignoreExisting: true,
    });
    return "sent";
  } catch (error) {
    console.error("Couldn't create a Clerk invitation", error);
    throw new UserError("Couldn't send the invite email. Try again in a minute.");
  }
}

export function inviteMessage(name: string, email: string, result: InviteResult) {
  return result === "sent"
    ? `Invite emailed to ${email}. ${name} signs up from the link and gets their PIN on their phone.`
    : `${email} already has a Metzey login. Ask ${name} to sign in on their phone and tap “Get my PIN”.`;
}
