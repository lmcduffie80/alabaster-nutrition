import "server-only";
import { after } from "next/server";
import { escapeHtml, sendEmail, type Email } from "./email";
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

/** Sends each notice by email, after the response so the manager never waits. */
export function deliverLater(notices: ScheduleNotice[], origin: string) {
  if (notices.length === 0) return;
  after(async () => {
    await Promise.all(
      notices.map(async (notice) => {
        if (notice.email) await sendEmail(scheduleEmail({ ...notice, email: notice.email }, origin));
      }),
    );
  });
}
