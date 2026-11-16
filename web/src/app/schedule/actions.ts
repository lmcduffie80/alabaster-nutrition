"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { schema } from "@/db";
import { UserError } from "@/lib/server/errors";
import { withMember } from "@/lib/server/session";
import { assignRandomPin } from "@/lib/server/team";

/** The signed-in person's own choice about schedule emails. */
export async function setNotifyEmailAction(form: FormData) {
  const on = form.get("on") === "true";
  await withMember((db, member) =>
    db.update(schema.employee).set({ notifyEmail: on }).where(eq(schema.employee.id, member.employeeId)),
  );
  revalidatePath("/schedule");
}

export type MyPinState = { pin?: string; error?: string; at?: number } | null;

/** Gives the signed-in person a fresh random PIN. Any earlier PIN stops working. */
export async function getMyPinAction(): Promise<MyPinState> {
  try {
    const pin = await withMember((db, member) => assignRandomPin(db, member.employeeId));
    return { pin, at: Date.now() };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, at: Date.now() };
    throw error;
  }
}
