"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { punchKinds, type PunchKind } from "@/lib/domain/punches";
import { instantAt, isLocalDate } from "@/lib/domain/time";
import { getBusiness, updateBusinessSettings } from "@/lib/server/business";
import { UserError } from "@/lib/server/errors";
import { enrollKiosk, revokeKiosk } from "@/lib/server/kiosk";
import { addManagerPunch, editPunchTime, getPunch, removePunch } from "@/lib/server/punches";
import { addShift, deleteShift, publishWeek, unpublishWeek } from "@/lib/server/schedule";
import {
  endKioskManagerSession,
  requireManager,
  requireManagerAccount,
  setKioskCookie,
  type Manager,
} from "@/lib/server/session";
import {
  addEmployee,
  assignRandomPin,
  clearEmployeePin,
  getEmployee,
  setEmployeeActive,
  setEmployeePin,
  setManagerPin,
  updateEmployee,
} from "@/lib/server/team";
import { approveTimesheet, reopenTimesheetAt, unapproveTimesheet } from "@/lib/server/timesheets";

export type FormState = { error?: string; success?: string; pin?: string; at?: number } | null;

const uuid = z.uuid();

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new UserError("Enter a time.");
  return Number(match[1]) * 60 + Number(match[2]);
}

function localInstant(form: FormData, timeZone: string) {
  const date = text(form, "date");
  if (!isLocalDate(date)) throw new UserError("Enter a date.");
  return instantAt(date, timeToMinutes(text(form, "time")), timeZone);
}

/** Runs a manager-only change; known problems come back as a message instead of an error page. */
async function managerForm(
  form: FormData,
  work: (manager: Manager, db: Awaited<ReturnType<typeof getDb>>) => Promise<FormState | void>,
  options: { account?: boolean; paths?: string[] } = {},
): Promise<FormState> {
  const manager = options.account ? await requireManagerAccount() : await requireManager();
  const db = await getDb();
  try {
    for (const name of ["id", "employeeId", "punchId"]) {
      const value = form.get(name);
      if (value !== null && value !== undefined && !uuid.safeParse(value).success) {
        throw new UserError("That item no longer exists. Refresh the page.");
      }
    }
    const result = await work(manager, db);
    for (const path of options.paths ?? ["/manage"]) revalidatePath(path, "layout");
    return { ...(result ?? {}), at: Date.now() };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, at: Date.now() };
    throw error;
  }
}

// Team

export async function addEmployeeAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    const id = await addEmployee(db, { displayName: text(form, "displayName"), email: text(form, "email") });
    const pin = await assignRandomPin(db, id);
    return { success: `${text(form, "displayName").trim()} added.`, pin };
  });
}

export async function updateEmployeeAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    await updateEmployee(db, text(form, "id"), { displayName: text(form, "displayName"), email: text(form, "email") });
    return { success: "Saved." };
  });
}

export async function setActiveAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    const active = text(form, "active") === "true";
    await setEmployeeActive(db, text(form, "id"), active);
    if (active) return { success: "Reactivated.", pin: await assignRandomPin(db, text(form, "id")) };
    return { success: "Deactivated. Their PIN no longer works." };
  });
}

export async function setPinAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    const id = text(form, "id");
    if (text(form, "mode") === "random") return { pin: await assignRandomPin(db, id), success: "New PIN set." };
    if (text(form, "mode") === "clear") {
      await clearEmployeePin(db, id);
      return { success: "PIN removed." };
    }
    await setEmployeePin(db, id, text(form, "pin"));
    return { success: "PIN saved." };
  });
}

// Settings

export async function setManagerPinAction(_: FormState, form: FormData) {
  return managerForm(form,
    async (_m, db) => {
      if (text(form, "pin") !== text(form, "confirm")) throw new UserError("The two PINs don't match.");
      await setManagerPin(db, text(form, "pin"));
      return { success: "Manager PIN saved." };
    },
    { account: true },
  );
}

export async function updateSettingsAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    const name = text(form, "name").trim();
    const missing = Number(text(form, "missingClockOutHours"));
    const autoReturn = Number(text(form, "kioskAutoReturnSeconds"));
    if (!name) throw new UserError("Enter the business name.");
    if (!Number.isInteger(missing) || missing < 4 || missing > 24) {
      throw new UserError("The missing clock-out warning must be between 4 and 24 hours.");
    }
    if (!Number.isInteger(autoReturn) || autoReturn < 5 || autoReturn > 60) {
      throw new UserError("The kiosk must return to the keypad within 5 to 60 seconds.");
    }
    await updateBusinessSettings(db, { name, missingClockOutHours: missing, kioskAutoReturnSeconds: autoReturn });
    return { success: "Settings saved." };
  });
}

export async function enrollKioskAction(form: FormData) {
  await requireManagerAccount();
  const { token } = await enrollKiosk(await getDb(), text(form, "label"));
  await setKioskCookie(token);
  redirect("/kiosk/ready");
}

export async function revokeKioskAction(_: FormState, form: FormData) {
  return managerForm(form,
    async (_m, db) => {
      await revokeKiosk(db, text(form, "id"));
      return { success: "That device can no longer be used as the kiosk." };
    },
    { account: true },
  );
}

export async function lockAction() {
  await endKioskManagerSession();
  redirect("/kiosk");
}

// Schedule

export async function addShiftAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    await addShift(db, {
      employeeId: text(form, "employeeId"),
      date: text(form, "date"),
      startMinutes: timeToMinutes(text(form, "start")),
      endMinutes: timeToMinutes(text(form, "end")),
      position: text(form, "position"),
    });
    return { success: "Shift added." };
  });
}

export async function deleteShiftAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    await deleteShift(db, text(form, "id"));
  });
}

export async function publishAction(_: FormState, form: FormData) {
  return managerForm(form, async (_m, db) => {
    if (text(form, "publish") === "true") {
      await publishWeek(db, text(form, "weekStart"));
      return { success: "Published. The team can see this week now." };
    }
    await unpublishWeek(db, text(form, "weekStart"));
    return { success: "Unpublished. The team can no longer see this week." };
  });
}

// Timesheets

export async function editPunchAction(_: FormState, form: FormData) {
  return managerForm(form, async (manager, db) => {
    const { timeZone } = await getBusiness(db);
    const row = await getPunch(db, text(form, "punchId"));
    const at = localInstant(form, timeZone);
    const now = new Date();
    await editPunchTime(db, { punchId: row.id, at, reason: text(form, "reason"), changedBy: manager.actor, now });
    await reopenTimesheetAt(db, row.employeeId, row.effectiveAt ?? row.at);
    await reopenTimesheetAt(db, row.employeeId, at);
    return { success: "Punch updated." };
  });
}

export async function removePunchAction(_: FormState, form: FormData) {
  return managerForm(form, async (manager, db) => {
    const row = await getPunch(db, text(form, "punchId"));
    await removePunch(db, { punchId: row.id, reason: text(form, "reason"), changedBy: manager.actor });
    await reopenTimesheetAt(db, row.employeeId, row.effectiveAt ?? row.at);
    return { success: "Punch removed." };
  });
}

export async function addPunchAction(_: FormState, form: FormData) {
  return managerForm(form, async (manager, db) => {
    const { timeZone } = await getBusiness(db);
    const employeeId = text(form, "employeeId");
    if (!(await getEmployee(db, employeeId))) throw new UserError("Choose an employee.");
    const kind = text(form, "kind") as PunchKind;
    if (!punchKinds.includes(kind)) throw new UserError("Choose what kind of punch to add.");
    const at = localInstant(form, timeZone);
    await addManagerPunch(db, { employeeId, kind, at, reason: text(form, "reason"), changedBy: manager.actor, now: new Date() });
    await reopenTimesheetAt(db, employeeId, at);
    return { success: "Punch added." };
  });
}

export async function approveAction(_: FormState, form: FormData) {
  return managerForm(form, async (manager, db) => {
    const employeeId = text(form, "employeeId");
    const periodStart = text(form, "periodStart");
    if (text(form, "approve") === "true") {
      await approveTimesheet(db, { employeeId, periodStart, approvedBy: manager.actor, now: new Date() });
    } else {
      await unapproveTimesheet(db, employeeId, periodStart);
    }
  });
}
