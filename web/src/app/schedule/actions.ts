"use server";

import { UserError } from "@/lib/server/errors";
import { withMember } from "@/lib/server/session";
import { assignRandomPin } from "@/lib/server/team";

export type MyPinState = { pin?: string; error?: string; at?: number } | null;

/** Gives the signed-in person a fresh random PIN that only they see. Any earlier PIN stops working. */
export async function getMyPinAction(): Promise<MyPinState> {
  try {
    const pin = await withMember((db, member) => assignRandomPin(db, member.employeeId));
    return { pin, at: Date.now() };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, at: Date.now() };
    throw error;
  }
}
