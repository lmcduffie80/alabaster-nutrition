import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@/db";
import { withBusiness } from "@/db/tenant";
import { UserError } from "./errors";
import { newToken, tokenDigest } from "./secrets";
import { createBusiness } from "./system";
import { ensureOwner, normalizeEmail } from "./team";

/**
 * Platform-level, like `system.ts`: invites belong to no business, so this reads them without `withBusiness`.
 * Only the platform owner's pages and the `/start` redemption call it.
 */

export const INVITE_DAYS = 7;

/** Comma-separated in `PLATFORM_OWNER_EMAILS`: who can create businesses by invite. */
export function platformOwnerEmails(value = process.env.PLATFORM_OWNER_EMAILS ?? ""): Set<string> {
  return new Set(value.split(",").map(normalizeEmail).filter(Boolean));
}

const inviteEmail = z.email("Enter the email the invite is for.").max(200);

export async function createInvite(db: Db, input: { email: string; createdBy: string; now: Date }) {
  const parsed = inviteEmail.safeParse(input.email.trim());
  if (!parsed.success) throw new UserError("Enter the email the invite is for.");
  const token = newToken();
  const [row] = await db
    .insert(schema.businessInvite)
    .values({
      email: normalizeEmail(parsed.data),
      tokenDigest: tokenDigest(token),
      createdBy: input.createdBy,
      createdAt: input.now,
      expiresAt: new Date(input.now.getTime() + INVITE_DAYS * 86_400_000),
    })
    .returning({ id: schema.businessInvite.id });
  return { id: row.id, token };
}

type InviteRow = typeof schema.businessInvite.$inferSelect;
export type InviteStatus = "waiting" | "used" | "expired" | "cancelled";

export function inviteStatus(invite: Pick<InviteRow, "usedAt" | "cancelledAt" | "expiresAt">, now: Date): InviteStatus {
  if (invite.usedAt) return "used";
  if (invite.cancelledAt) return "cancelled";
  if (invite.expiresAt <= now) return "expired";
  return "waiting";
}

export async function listInvites(db: Db, now: Date) {
  const rows = await db
    .select({ invite: schema.businessInvite, businessName: schema.business.name })
    .from(schema.businessInvite)
    .leftJoin(schema.business, eq(schema.business.id, schema.businessInvite.businessId))
    .orderBy(desc(schema.businessInvite.createdAt));
  return rows.map(({ invite, businessName }) => ({
    id: invite.id,
    email: invite.email,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    status: inviteStatus(invite, now),
    businessName,
  }));
}

export async function cancelInvite(db: Db, id: string, now: Date) {
  if (!z.uuid().safeParse(id).success) return;
  await db
    .update(schema.businessInvite)
    .set({ cancelledAt: now })
    .where(and(eq(schema.businessInvite.id, id), isNull(schema.businessInvite.usedAt), isNull(schema.businessInvite.cancelledAt)));
}

export type InviteCheck = { kind: "ok"; email: string } | { kind: InviteProblem };
export type InviteProblem = "unknown" | "expired" | "used" | "cancelled" | "wrongEmail";

/** Whether `email` (already verified by sign-in) can use the link with this secret. */
export async function checkInvite(db: Db, token: string | undefined, email: string, now: Date): Promise<InviteCheck> {
  if (!token) return { kind: "unknown" };
  const [invite] = await db.select().from(schema.businessInvite).where(eq(schema.businessInvite.tokenDigest, tokenDigest(token)));
  if (!invite) return { kind: "unknown" };
  const status = inviteStatus(invite, now);
  if (status !== "waiting") return { kind: status };
  if (invite.email !== normalizeEmail(email)) return { kind: "wrongEmail" };
  return { kind: "ok", email: invite.email };
}

const businessName = z.string().trim().min(1, "Enter the business name.").max(60, "Keep the name under 60 characters.");

function validTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone.includes("/");
  } catch {
    return false;
  }
}

export const inviteProblemMessage: Record<InviteProblem, string> = {
  unknown: "This sign-up link isn't valid. Check that you copied all of it, or ask for a new one.",
  expired: "This sign-up link has expired. Ask for a new one.",
  used: "This sign-up link has already been used. Sign in to reach your business, or ask for a new link.",
  cancelled: "This sign-up link was cancelled. Ask for a new one.",
  wrongEmail: "This sign-up link is for a different email. Sign in with the email it was sent to.",
};

/** Creates the business and its first manager, and uses up the invite, all at once. Returns the new business. */
export async function redeemInvite(
  db: Db,
  input: { token: string; email: string; displayName: string; businessName: string; timeZone: string; now: Date },
): Promise<number> {
  const name = businessName.safeParse(input.businessName);
  if (!name.success) throw new UserError(name.error.issues[0].message);
  if (!validTimeZone(input.timeZone)) throw new UserError("Choose a time zone.");
  const check = await checkInvite(db, input.token, input.email, input.now);
  if (check.kind !== "ok") throw new UserError(inviteProblemMessage[check.kind]);

  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.businessInvite)
      .set({ usedAt: input.now })
      .where(
        and(
          eq(schema.businessInvite.tokenDigest, tokenDigest(input.token)),
          isNull(schema.businessInvite.usedAt),
          isNull(schema.businessInvite.cancelledAt),
          gt(schema.businessInvite.expiresAt, input.now),
        ),
      )
      .returning({ id: schema.businessInvite.id });
    if (!claimed) throw new UserError(inviteProblemMessage.used);
    const businessId = await createBusiness(tx, { name: name.data, timeZone: input.timeZone, now: input.now });
    await tx.update(schema.businessInvite).set({ businessId }).where(eq(schema.businessInvite.id, claimed.id));
    // Last: `withBusiness` drops this transaction to the app role until it ends.
    await withBusiness(tx, businessId, (inside) => ensureOwner(inside, check.email, input.displayName));
    return businessId;
  });
}
