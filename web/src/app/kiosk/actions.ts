"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { punchKinds, punchVerb } from "@/lib/domain/punches";
import { formatTime } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { UserError } from "@/lib/server/errors";
import { checkKioskPin, type PinCheck } from "@/lib/server/kiosk";
import { kioskEmployeeView, type KioskEmployeeView } from "@/lib/server/kiosk-view";
import { recordKioskPunch } from "@/lib/server/punches";
import { currentKiosk, endKioskManagerSession, startKioskManagerSession } from "@/lib/server/session";

export type PinResult =
  | { kind: "employee"; view: KioskEmployeeView }
  | { kind: "wrong" }
  | { kind: "locked"; secondsLeft: number }
  | { kind: "notKiosk" };

function lockedResult(check: Extract<PinCheck, { kind: "locked" }>, now: Date): PinResult {
  return { kind: "locked", secondsLeft: Math.max(1, Math.ceil((check.lockedUntil.getTime() - now.getTime()) / 1000)) };
}

const pinSchema = z.string().regex(/^\d{4}$/);

export async function enterEmployeePin(pin: string): Promise<PinResult> {
  const kiosk = await currentKiosk();
  if (!kiosk) return { kind: "notKiosk" };
  const db = await getDb();
  const now = new Date();
  const check = await checkKioskPin(db, { kioskId: kiosk.id, pin: pinSchema.safeParse(pin).data ?? "", expect: "employee", now });
  if (check.kind === "locked") return lockedResult(check, now);
  if (check.kind !== "employee") return { kind: "wrong" };
  return { kind: "employee", view: await kioskEmployeeView(db, { id: check.employeeId, displayName: check.displayName }, now) };
}

export type PunchResult = { kind: "done"; message: string } | { kind: "error"; message: string } | PinResult;

const punchSchema = z.object({ pin: pinSchema, kind: z.enum(punchKinds), requestId: z.uuid() });

/** The PIN is sent again so a punch can't be made for someone without it. */
export async function punch(input: { pin: string; kind: string; requestId: string }): Promise<PunchResult> {
  const kiosk = await currentKiosk();
  if (!kiosk) return { kind: "notKiosk" };
  const parsed = punchSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: "Something went wrong. Try again." };
  const db = await getDb();
  const now = new Date();
  const check = await checkKioskPin(db, { kioskId: kiosk.id, pin: parsed.data.pin, expect: "employee", now });
  if (check.kind === "locked") return lockedResult(check, now);
  if (check.kind !== "employee") return { kind: "wrong" };
  try {
    const recorded = await recordKioskPunch(db, {
      employeeId: check.employeeId,
      kind: parsed.data.kind,
      requestId: parsed.data.requestId,
      kioskDeviceId: kiosk.id,
      now,
    });
    const { timeZone } = await getBusiness(db);
    return { kind: "done", message: `${punchVerb[recorded.kind]} at ${formatTime(recorded.at, timeZone)}` };
  } catch (error) {
    if (error instanceof UserError) return { kind: "error", message: error.message };
    throw error;
  }
}

export async function unlockManager(pin: string): Promise<PinResult | { kind: "manager" }> {
  const kiosk = await currentKiosk();
  if (!kiosk) return { kind: "notKiosk" };
  const db = await getDb();
  const now = new Date();
  const check = await checkKioskPin(db, { kioskId: kiosk.id, pin: pinSchema.safeParse(pin).data ?? "", expect: "manager", now });
  if (check.kind === "locked") return lockedResult(check, now);
  if (check.kind !== "manager") return { kind: "wrong" };
  await startKioskManagerSession(kiosk.id, now);
  return { kind: "manager" };
}

export async function lockManager() {
  await endKioskManagerSession();
}
