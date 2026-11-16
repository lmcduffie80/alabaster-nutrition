import "server-only";
import { after } from "next/server";
import { getDb } from "@/db";
import { withBusiness } from "@/db/tenant";
import { sendEmail } from "./email";
import { sendPush, type PushMessage } from "./push";
import { forgetTokens } from "./push-devices";
import { scheduleEmail } from "./schedule-email";
import { noticeBody, noticeTitle, shiftText, type ScheduleNotice } from "./schedule-notices";

export function schedulePush(notice: ScheduleNotice): PushMessage {
  const lines = notice.shifts.map(shiftText);
  const body = lines.length > 3 ? `${lines.slice(0, 3).join("\n")}\n+${lines.length - 3} more` : noticeBody(notice);
  return { title: `${noticeTitle(notice)} · ${notice.businessName}`, body, path: "/schedule" };
}

/** Sends each notice by email and to the person's phones, after the response so the manager never waits. */
export function deliverLater(notices: ScheduleNotice[], origin: string) {
  if (notices.length === 0) return;
  after(async () => {
    const invalid: string[] = [];
    await Promise.all(
      notices.map(async (notice) => {
        await Promise.all([
          notice.email ? sendEmail(scheduleEmail({ ...notice, email: notice.email }, origin)) : null,
          sendPush(notice.devices, schedulePush(notice)).then((result) => invalid.push(...result.invalid)),
        ]);
      }),
    );
    if (invalid.length) {
      await withBusiness(await getDb(), notices[0].businessId, (db) => forgetTokens(db, invalid)).catch((error) =>
        console.error("Couldn't forget expired push tokens", error),
      );
    }
  });
}
