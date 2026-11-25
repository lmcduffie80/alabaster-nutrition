import "server-only";
import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { getDb, schema, type Db } from "@/db";
import { withBusiness } from "@/db/tenant";
import { formatQuantity, reorderAmount } from "@/lib/domain/inventory";
import { getBusiness } from "./business";
import { escapeHtml, sendEmail, type Email } from "./email";
import { stockRows } from "./inventory";
import { sendPush, type PushMessage } from "./push";
import { devicesFor, forgetTokens } from "./push-devices";

export type LowItem = { name: string; unit: string; onHand: number; order: number; supplierCode: string | null };

export const REORDER_PATH = "/manage/inventory/reorder";

export function lowStockPush(businessName: string, items: LowItem[]): PushMessage {
  const names = items.map((i) => `${i.name} (${formatQuantity(i.onHand, i.unit)})`);
  const body = names.length > 3 ? `${names.slice(0, 3).join("\n")}\n+${names.length - 3} more` : names.join("\n");
  return { title: `${items.length} ${items.length === 1 ? "item" : "items"} to reorder · ${businessName}`, body, path: REORDER_PATH };
}

export function lowStockEmail(input: { to: string; name: string; businessName: string; countedBy: string; items: LowItem[]; origin: string }): Email {
  const link = `${input.origin}${REORDER_PATH}`;
  const subject = `${input.items.length} ${input.items.length === 1 ? "item" : "items"} to reorder · ${input.businessName}`;
  const firstName = input.name.trim().split(/\s+/)[0] || input.name;
  const intro = `${input.countedBy} just finished the inventory count. These are at or below their reorder level:`;
  const text = [
    `Hi ${firstName},`,
    "",
    intro,
    "",
    ...input.items.map(
      (i) => `- ${i.name}${i.supplierCode ? ` (${i.supplierCode})` : ""}: ${formatQuantity(i.onHand, i.unit)} on hand, order ${i.order}`,
    ),
    "",
    `Reorder list: ${link}`,
  ].join("\n");

  const rows = input.items
    .map(
      (i, n) => `<tr>
<td style="padding:10px 0;${n ? "border-top:1px solid #e8e4da;" : ""}font-size:15px;color:#1f2a44">${escapeHtml(i.name)}${
        i.supplierCode ? `<div style="font-size:12px;color:#6b7385">${escapeHtml(i.supplierCode)}</div>` : ""
      }</td>
<td align="right" style="padding:10px 0;${n ? "border-top:1px solid #e8e4da;" : ""}font-size:14px;color:#6b7385;white-space:nowrap">${escapeHtml(formatQuantity(i.onHand, i.unit))}</td>
<td align="right" style="padding:10px 0 10px 12px;${n ? "border-top:1px solid #e8e4da;" : ""}font-size:14px;font-weight:600;color:#3e5c9a;white-space:nowrap">Order ${i.order}</td>
</tr>`,
    )
    .join("");
  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#faf8f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f3">
<tr><td align="center" style="padding:28px 12px;font-family:${sans}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
    <tr><td align="center" style="padding:0 0 18px;font-family:Georgia,serif;font-size:15px;letter-spacing:3px;text-transform:uppercase;color:#3e5c9a">${escapeHtml(input.businessName)}</td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e8e4da;border-radius:18px;padding:28px">
      <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9c7a3c">Running low</p>
      <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:26px;font-weight:600;color:#1f2a44">${escapeHtml(subject.split(" · ")[0])}</h1>
      <p style="margin:14px 0 6px;font-size:15px;line-height:1.5;color:#1f2a44">Hi ${escapeHtml(firstName)},<br>${escapeHtml(intro)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      <p align="center" style="margin:24px 0 0"><a href="${link}" style="display:inline-block;padding:13px 28px;border-radius:12px;background:#3e5c9a;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Open the reorder list</a></p>
    </td></tr>
    <tr><td align="center" style="padding:18px 20px 0;font-size:12px;color:#6b7385">Sent by Metzey to managers of ${escapeHtml(input.businessName)} after each count.</td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
  return { to: input.to, subject, text, html };
}

/**
 * After a count is finished: if anything is at or below its reorder level, tells every active manager by
 * phone and email. The lookup happens now; sending waits until after the response. Never throws, so an
 * alert problem can't undo finishing the count.
 */
export async function alertLowStock(db: Db, input: { employeeId: string; origin: string }) {
  try {
    await db.transaction((tx) => queueLowStockAlert(tx, input));
  } catch (error) {
    console.error("Couldn't prepare the low-stock alert", error);
  }
}

async function queueLowStockAlert(db: Db, input: { employeeId: string; origin: string }) {
  const low: LowItem[] = (await stockRows(db))
    .filter((r) => r.active && r.low && r.onHand !== null)
    .map((r) => ({ name: r.name, unit: r.unit, onHand: r.onHand!, order: reorderAmount(r.onHand, r.orderUpTo), supplierCode: r.supplierCode }))
    .sort((a, b) => a.onHand - b.onHand || a.name.localeCompare(b.name));
  if (low.length === 0) return;
  const business = await getBusiness(db);
  const e = schema.employee;
  const managers = await db
    .select({ id: e.id, name: e.displayName, email: e.email })
    .from(e)
    .where(and(eq(e.role, "manager"), eq(e.active, true)));
  if (managers.length === 0) return;
  const [counter] = await db.select({ name: e.displayName }).from(e).where(eq(e.id, input.employeeId));
  const countedBy = counter?.name ?? "Someone";
  const devices = [...(await devicesFor(db, managers.map((m) => m.id))).values()].flat();
  const push = lowStockPush(business.name, low);

  after(async () => {
    const [{ invalid }] = await Promise.all([
      sendPush(devices, push),
      ...managers
        .filter((m) => m.email)
        .map((m) => sendEmail(lowStockEmail({ to: m.email!, name: m.name, businessName: business.name, countedBy, items: low, origin: input.origin }))),
    ]);
    if (invalid.length) {
      await withBusiness(await getDb(), business.id, (tx) => forgetTokens(tx, invalid)).catch((error) =>
        console.error("Couldn't forget expired push tokens", error),
      );
    }
  });
}
