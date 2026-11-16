import "server-only";
import { after } from "next/server";
import { getDb } from "@/db";
import { withBusiness } from "@/db/tenant";
import { escapeHtml, sendEmail, type Email } from "./email";
import { sendPush, type PushMessage } from "./push";
import { forgetTokens } from "./push-devices";
import { noticeBody, noticeTitle, type ScheduleNotice } from "./schedule-notices";

export function scheduleEmail(notice: ScheduleNotice & { email: string }, origin: string): Email {
  const link = `${origin}/schedule`;
  const subject = `${noticeTitle(notice)} · ${notice.businessName}`;
  const body = noticeBody(notice);
  const text = `Hi ${notice.name},\n\n${body}\n\nSee the full schedule: ${link}\n\nTo stop these emails, turn off "Email me schedule changes" on your schedule page.`;
  const items = notice.shifts.length
    ? `<ul style="padding-left:18px">${notice.shifts.map((s) => `<li style="margin:4px 0">${escapeHtml(s)}</li>`).join("")}</ul>`
    : `<p>${escapeHtml(body)}</p>`;
  const html = `<div style="font-family:Georgia,serif;color:#1f2a44;max-width:480px">
<p style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#3e5c9a">${escapeHtml(notice.businessName)}</p>
<h2 style="font-weight:600">${escapeHtml(noticeTitle(notice))}</h2>
<p>Hi ${escapeHtml(notice.name)},</p>
${items}
<p><a href="${link}" style="color:#3e5c9a">See the full schedule</a></p>
<p style="font-size:12px;color:#888">To stop these emails, turn off &ldquo;Email me schedule changes&rdquo; on your schedule page.</p>
</div>`;
  return { to: notice.email, subject, text, html };
}

export function schedulePush(notice: ScheduleNotice): PushMessage {
  const body = notice.shifts.length > 3 ? `${notice.shifts.slice(0, 3).join("\n")}\n+${notice.shifts.length - 3} more` : noticeBody(notice);
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
