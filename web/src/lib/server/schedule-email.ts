import "server-only";
import { formatMinutes } from "@/lib/domain/time";
import { escapeHtml, type Email } from "./email";
import { noticeBody, noticeMinutes, noticeTitle, type NoticeShift, type ScheduleNotice } from "./schedule-notices";

const color = {
  page: "#faf8f3",
  card: "#ffffff",
  ink: "#1f2a44",
  muted: "#6b7385",
  line: "#e8e4da",
  porcelain: "#3e5c9a",
  porcelainLight: "#e3e9f4",
  gilt: "#9c7a3c",
  red: "#b42318",
};
const serif = "Georgia,'Times New Roman',serif";
const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function shiftRow(shift: NoticeShift, last: boolean) {
  const border = last ? "" : `border-bottom:1px solid ${color.line};`;
  const struck = shift.calledIn ? "text-decoration:line-through;color:#9aa0ad;" : "";
  const details = [
    shift.position && `<span style="color:${color.muted}">${escapeHtml(shift.position)}</span>`,
    shift.calledIn && `<span style="color:${color.red};font-weight:600">Called in</span>`,
  ].filter(Boolean);
  return `<tr>
<td width="64" valign="top" style="padding:14px 0;${border}">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="52"><tr><td align="center" style="background:${color.porcelainLight};border-radius:10px;padding:6px 0;font-family:${sans}">
    <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${color.porcelain}">${escapeHtml(shift.weekday)}</div>
    <div style="font-size:13px;font-weight:600;color:${color.ink};margin-top:2px">${escapeHtml(shift.date)}</div>
  </td></tr></table>
</td>
<td valign="middle" style="padding:14px 0 14px 12px;${border}font-family:${sans}">
  <div style="font-size:16px;font-weight:600;color:${color.ink};${struck}">${escapeHtml(shift.time)}</div>
  ${details.length ? `<div style="font-size:13px;margin-top:3px">${details.join(" &middot; ")}</div>` : ""}
</td>
<td valign="middle" align="right" style="padding:14px 0;${border}font-family:${sans};font-size:13px;color:${color.muted};white-space:nowrap">${shift.calledIn ? "" : formatMinutes(shift.minutes)}</td>
</tr>`;
}

/** The schedule email: a branded card listing each shift, the week's hours, and a button to the schedule. */
export function scheduleEmail(notice: ScheduleNotice & { email: string }, origin: string): Email {
  const link = `${origin}/schedule`;
  const title = noticeTitle(notice);
  const subject = `${title} · ${notice.businessName}`;
  const minutes = noticeMinutes(notice);
  const count = notice.shifts.filter((s) => !s.calledIn).length;
  const summary = notice.shifts.length ? `${count} ${count === 1 ? "shift" : "shifts"} · ${formatMinutes(minutes)}` : "";
  const intro =
    notice.kind === "published"
      ? `Here are your shifts for the week of ${notice.week}.`
      : `Your shifts for the week of ${notice.week} were updated. Here's your schedule now.`;
  const optOut = `To stop these emails, turn off "Email me schedule changes" on your schedule page.`;
  const firstName = notice.name.trim().split(/\s+/)[0] || notice.name;

  const text = [
    `Hi ${firstName},`,
    "",
    notice.shifts.length ? `${intro}\n` : "",
    noticeBody(notice),
    summary ? `\nThis week: ${summary}` : "",
    "",
    `See your schedule: ${link}`,
    "",
    optOut,
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");

  const shifts = notice.shifts.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${notice.shifts
        .map((s, i) => shiftRow(s, i === notice.shifts.length - 1))
        .join("")}</table>`
    : `<p style="margin:0;padding:18px;border-radius:12px;background:${color.page};font-family:${sans};font-size:15px;color:${color.ink}">You&rsquo;re no longer scheduled the week of ${escapeHtml(notice.week)}.</p>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${color.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(summary || noticeBody(notice))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${color.page}">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
    <tr><td align="center" style="padding:0 0 18px;font-family:${serif};font-size:15px;letter-spacing:3px;text-transform:uppercase;color:${color.porcelain}">${escapeHtml(notice.businessName)}</td></tr>
    <tr><td style="background:${color.card};border:1px solid ${color.line};border-radius:18px;overflow:hidden">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:6px;background:${color.porcelain};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:28px 28px 8px">
          <p style="margin:0;font-family:${sans};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${color.gilt}">${notice.kind === "published" ? "New schedule" : "Schedule update"}</p>
          <h1 style="margin:8px 0 0;font-family:${serif};font-size:26px;line-height:1.25;font-weight:600;color:${color.ink}">${escapeHtml(title)}</h1>
          <p style="margin:14px 0 0;font-family:${sans};font-size:15px;line-height:1.5;color:${color.ink}">Hi ${escapeHtml(firstName)},<br>${escapeHtml(notice.shifts.length ? intro : "Your schedule changed.")}</p>
        </td></tr>
        ${summary ? `<tr><td style="padding:14px 28px 0"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${color.porcelainLight};font-family:${sans};font-size:13px;font-weight:600;color:${color.porcelain}">${escapeHtml(summary)}</span></td></tr>` : ""}
        <tr><td style="padding:10px 28px 4px">${shifts}</td></tr>
        <tr><td align="center" style="padding:18px 28px 30px">
          <a href="${link}" style="display:inline-block;padding:13px 28px;border-radius:12px;background:${color.porcelain};font-family:${sans};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">View my schedule</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:18px 20px 0;font-family:${sans};font-size:12px;line-height:1.6;color:${color.muted}">
      Sent by Metzey for ${escapeHtml(notice.businessName)}.<br>
      To stop these emails, turn off &ldquo;Email me schedule changes&rdquo; on <a href="${link}" style="color:${color.muted}">your schedule page</a>.
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  return { to: notice.email, subject, text, html };
}
