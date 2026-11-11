"use server";

import { revalidatePath } from "next/cache";
import { UserError } from "@/lib/server/errors";
import { cancelInvite, createInvite } from "@/lib/server/invites";
import { requirePlatformOwner } from "@/lib/server/session";

export type InviteFormState = { error?: string; token?: string; email?: string; at?: number } | null;

export async function createInviteAction(_: InviteFormState, form: FormData): Promise<InviteFormState> {
  const { email, db } = await requirePlatformOwner("/platform/invites");
  const invitee = String(form.get("email") ?? "");
  try {
    const { token } = await createInvite(db, { email: invitee, createdBy: email, now: new Date() });
    revalidatePath("/platform/invites");
    return { token, email: invitee.trim(), at: Date.now() };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, at: Date.now() };
    throw error;
  }
}

export async function cancelInviteAction(form: FormData) {
  const { db } = await requirePlatformOwner("/platform/invites");
  await cancelInvite(db, String(form.get("id") ?? ""), new Date());
  revalidatePath("/platform/invites");
}
