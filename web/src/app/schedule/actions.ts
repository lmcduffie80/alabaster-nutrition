"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { schema, type Db } from "@/db";
import { addCountSheetItem, saveCountSheet } from "@/lib/server/count-sheet";
import { UserError } from "@/lib/server/errors";
import { startOrContinueCount } from "@/lib/server/inventory";
import { PLAN_INACTIVE_KIOSK, planFor, withMember } from "@/lib/server/session";
import { assignRandomPin } from "@/lib/server/team";

/** The signed-in person's own choice about schedule emails. */
export async function setNotifyEmailAction(form: FormData) {
  const on = form.get("on") === "true";
  await withMember((db, member) =>
    db.update(schema.employee).set({ notifyEmail: on }).where(eq(schema.employee.id, member.employeeId)),
  );
  revalidatePath("/schedule");
}

export type CountState = { error?: string; success?: string; at?: number } | null;

/** Inventory counting from anyone's own phone, like on the store iPad. Needs an active plan. */
async function asMemberCounting(work: (db: Db, employeeId: string) => Promise<CountState | void>): Promise<CountState> {
  try {
    const result = await withMember(async (db, member) => {
      if ((await planFor(member.businessId)).access === "ended") throw new UserError(PLAN_INACTIVE_KIOSK);
      return work(db, member.employeeId);
    });
    revalidatePath("/schedule", "layout");
    revalidatePath("/manage", "layout");
    return { ...(result ?? {}), at: Date.now() };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, at: Date.now() };
    throw error;
  }
}

export async function startMyCountAction(): Promise<CountState> {
  const result = await asMemberCounting(async (db, employeeId) => {
    await startOrContinueCount(db, { employeeId, now: new Date() });
  });
  if (result?.error) return result;
  redirect("/schedule/count");
}

export async function saveMyCountAction(_: CountState, form: FormData): Promise<CountState> {
  const result = await asMemberCounting((db, employeeId) => saveCountSheet(db, form, employeeId));
  if (result?.error || form.get("intent") !== "finish") return result;
  redirect("/schedule/count?finished=1");
}

export async function addMyCountItemAction(_: CountState, form: FormData): Promise<CountState> {
  return asMemberCounting((db, employeeId) => addCountSheetItem(db, form, employeeId));
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
