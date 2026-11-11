"use server";

import { redirect } from "next/navigation";
import { punchKinds, type PunchKind } from "@/lib/domain/punches";
import { instantAt, isLocalDate } from "@/lib/domain/time";
import { getBusiness, updateBusinessSettings } from "@/lib/server/business";
import { UserError } from "@/lib/server/errors";
import { enrollKiosk, revokeKiosk } from "@/lib/server/kiosk";
import { addManagerPunch, editPunchTime, getPunch, removePunch } from "@/lib/server/punches";
import { addShift, deleteShift, publishWeek, setCalledIn, unpublishWeek } from "@/lib/server/schedule";
import { endKioskManagerSession, setKioskCookie, withManager } from "@/lib/server/session";
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
import { managerForm, text, type FormState } from "./manager-form";

export type { FormState };

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
    const lateGrace = Number(text(form, "lateGraceMinutes"));
    if (!Number.isInteger(lateGrace) || lateGrace < 0 || lateGrace > 60) {
      throw new UserError("The late grace period must be between 0 and 60 minutes.");
    }
    const countWeekday = Number(text(form, "countWeekday"));
    if (!Number.isInteger(countWeekday) || countWeekday < 0 || countWeekday > 6) throw new UserError("Choose the count day.");
    await updateBusinessSettings(db, {
      name,
      missingClockOutHours: missing,
      lateGraceMinutes: lateGrace,
      kioskAutoReturnSeconds: autoReturn,
      countWeekday,
    });
    return { success: "Settings saved." };
  });
}

export async function enrollKioskAction(form: FormData) {
  const { token } = await withManager((db) => enrollKiosk(db, text(form, "label")), { account: true });
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

export async function calledInAction(_: FormState, form: FormData) {
  return managerForm(form, async (manager, db) => {
    const calledIn = text(form, "calledIn") === "true";
    await setCalledIn(db, { shiftId: text(form, "shiftId"), calledIn, note: text(form, "note"), by: manager.actor, now: new Date() });
    return { success: calledIn ? "Marked as called in." : "Call-in cleared." };
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
