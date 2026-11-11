"use server";

import { z } from "zod";
import type { Db } from "@/db";
import { parseQuantity } from "@/lib/domain/inventory";
import { punchKinds, punchVerb } from "@/lib/domain/punches";
import { formatTime } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { UserError } from "@/lib/server/errors";
import {
  enterCountLine,
  finishCount,
  getCount,
  startOrContinueCount,
  type CountLineView,
} from "@/lib/server/inventory";
import { checkKioskPin, type PinCheck } from "@/lib/server/kiosk";
import { kioskEmployeeView, type KioskEmployeeView } from "@/lib/server/kiosk-view";
import { recordKioskPunch } from "@/lib/server/punches";
import {
  currentKiosk,
  endCountSession,
  endKioskManagerSession,
  getCountSession,
  startCountSession,
  startKioskManagerSession,
  withKiosk,
} from "@/lib/server/session";

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
  return withKiosk(kiosk, async (db): Promise<PinResult> => {
    const now = new Date();
    const check = await checkKioskPin(db, { kioskId: kiosk.id, pin: pinSchema.safeParse(pin).data ?? "", expect: "employee", now });
    if (check.kind === "locked") return lockedResult(check, now);
    if (check.kind !== "employee") return { kind: "wrong" };
    return { kind: "employee", view: await kioskEmployeeView(db, { id: check.employeeId, displayName: check.displayName }, now) };
  });
}

export type PunchResult = { kind: "done"; message: string } | { kind: "error"; message: string } | PinResult;

const punchSchema = z.object({ pin: pinSchema, kind: z.enum(punchKinds), requestId: z.uuid() });

/** The PIN is sent again so a punch can't be made for someone without it. */
export async function punch(input: { pin: string; kind: string; requestId: string }): Promise<PunchResult> {
  const kiosk = await currentKiosk();
  if (!kiosk) return { kind: "notKiosk" };
  const parsed = punchSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: "Something went wrong. Try again." };
  try {
    return await withKiosk(kiosk, async (db): Promise<PunchResult> => {
      const now = new Date();
      const check = await checkKioskPin(db, { kioskId: kiosk.id, pin: parsed.data.pin, expect: "employee", now });
      if (check.kind === "locked") return lockedResult(check, now);
      if (check.kind !== "employee") return { kind: "wrong" };
      const recorded = await recordKioskPunch(db, {
        employeeId: check.employeeId,
        kind: parsed.data.kind,
        requestId: parsed.data.requestId,
        kioskDeviceId: kiosk.id,
        now,
      });
      const { timeZone } = await getBusiness(db);
      return { kind: "done", message: `${punchVerb[recorded.kind]} at ${formatTime(recorded.at, timeZone)}` };
    });
  } catch (error) {
    if (error instanceof UserError) return { kind: "error", message: error.message };
    throw error;
  }
}

export async function unlockManager(pin: string): Promise<PinResult | { kind: "manager" }> {
  const kiosk = await currentKiosk();
  if (!kiosk) return { kind: "notKiosk" };
  const now = new Date();
  const check = await withKiosk(kiosk, (db) =>
    checkKioskPin(db, { kioskId: kiosk.id, pin: pinSchema.safeParse(pin).data ?? "", expect: "manager", now }),
  );
  if (check.kind === "locked") return lockedResult(check, now);
  if (check.kind !== "manager") return { kind: "wrong" };
  await startKioskManagerSession(kiosk.id, now);
  return { kind: "manager" };
}

export async function lockManager() {
  await endKioskManagerSession();
}

// Inventory count

export type CountScreenView = {
  countId: string;
  lines: Pick<CountLineView, "itemId" | "name" | "unit" | "spotName" | "lastCounted" | "quantity" | "enteredBy">[];
};

export type CountResult =
  | { kind: "counting"; view: CountScreenView }
  | { kind: "saved"; quantity: number | null }
  | { kind: "finished"; skipped: number }
  | { kind: "expired" }
  | { kind: "error"; message: string }
  | PinResult;

async function countScreenView(db: Db, countId: string): Promise<CountScreenView> {
  const count = await getCount(db, countId);
  return {
    countId,
    lines: (count?.lines ?? []).map(({ itemId, name, unit, spotName, lastCounted, quantity, enteredBy }) => ({
      itemId,
      name,
      unit,
      spotName,
      lastCounted,
      quantity,
      enteredBy,
    })),
  };
}

async function asCountResult(work: () => Promise<CountResult>): Promise<CountResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof UserError) return { kind: "error", message: error.message };
    throw error;
  }
}

/** The PIN is checked once; a short count session then covers each entry. */
export async function startCounting(pin: string): Promise<CountResult> {
  const kiosk = await currentKiosk();
  if (!kiosk) return { kind: "notKiosk" };
  const now = new Date();
  const check = await withKiosk(kiosk, (db) =>
    checkKioskPin(db, { kioskId: kiosk.id, pin: pinSchema.safeParse(pin).data ?? "", expect: "employee", now }),
  );
  if (check.kind === "locked") return lockedResult(check, now);
  if (check.kind !== "employee") return { kind: "wrong" };
  return asCountResult(() =>
    withKiosk(kiosk, async (db) => {
      const countId = await startOrContinueCount(db, { employeeId: check.employeeId, now });
      await startCountSession(kiosk.id, check.employeeId, now);
      return { kind: "counting", view: await countScreenView(db, countId) };
    }),
  );
}

const entrySchema = z.object({ countId: z.uuid(), itemId: z.uuid(), quantity: z.string().max(20) });

export async function enterCount(input: { countId: string; itemId: string; quantity: string }): Promise<CountResult> {
  const session = await getCountSession();
  if (!session) return { kind: "expired" };
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: "Something went wrong. Try again." };
  let quantity: number | null;
  try {
    quantity = parseQuantity(parsed.data.quantity);
  } catch (error) {
    return { kind: "error", message: (error as Error).message };
  }
  return asCountResult(async () => {
    const now = new Date();
    await withKiosk(session.kiosk, (db) => enterCountLine(db, { ...parsed.data, quantity, employeeId: session.employeeId, now }));
    await startCountSession(session.kiosk.id, session.employeeId, now);
    return { kind: "saved", quantity };
  });
}

export async function finishCounting(input: { countId: string }): Promise<CountResult> {
  const session = await getCountSession();
  if (!session) return { kind: "expired" };
  if (!z.uuid().safeParse(input.countId).success) return { kind: "error", message: "This count is no longer open." };
  return asCountResult(async () => {
    const { skipped } = await withKiosk(session.kiosk, (db) =>
      finishCount(db, { countId: input.countId, employeeId: session.employeeId, now: new Date() }),
    );
    await endCountSession();
    return { kind: "finished", skipped };
  });
}

export async function stopCounting() {
  await endCountSession();
}
