import { beforeEach, describe, expect, it } from "vitest";
import { type Db, schema } from "@/db";
import { openLocalDatabase } from "@/db/local";
import { withBusiness } from "@/db/tenant";
import { getBusiness } from "./business";
import { cancelInvite, checkInvite, createInvite, INVITE_DAYS, listInvites, platformOwnerEmails, redeemInvite } from "./invites";
import { businessesForEmail, createBusiness } from "./system";
import { addEmployee, listEmployees } from "./team";

let db: Db;
const now = new Date("2026-11-10T15:00:00Z");
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);
const redeem = (token: string, overrides: Partial<Parameters<typeof redeemInvite>[1]> = {}) =>
  redeemInvite(db, { token, email: "new@shop.com", displayName: "Nia", businessName: "Corner Cafe", timeZone: "America/Chicago", now, ...overrides });

beforeEach(async () => {
  db = await openLocalDatabase();
  await createBusiness(db, { id: 1, name: "Alabaster Nutrition", now });
  await withBusiness(db, 1, (tx) => addEmployee(tx, { displayName: "Ava", email: "ava@example.com" }));
});

describe("invites", () => {
  it("only the listed emails are platform owners", () => {
    const owners = platformOwnerEmails(" Lee@Example.com, ");
    expect(owners.has("lee@example.com")).toBe(true);
    expect(owners.size).toBe(1);
  });

  it("work once, for the invited email, until they expire", async () => {
    const { token } = await createInvite(db, { email: "New@Shop.com ", createdBy: "lee@example.com", now });
    expect(await checkInvite(db, token, "new@shop.com", now)).toEqual({ kind: "ok", email: "new@shop.com" });
    expect((await checkInvite(db, token, "other@shop.com", now)).kind).toBe("wrongEmail");
    expect((await checkInvite(db, "made-up", "new@shop.com", now)).kind).toBe("unknown");
    expect((await checkInvite(db, undefined, "new@shop.com", now)).kind).toBe("unknown");
    expect((await checkInvite(db, token, "new@shop.com", later(INVITE_DAYS))).kind).toBe("expired");
    await expect(redeem(token, { now: later(INVITE_DAYS) })).rejects.toThrow("expired");
    await expect(redeem(token, { email: "other@shop.com" })).rejects.toThrow("different email");
  });

  it("can be cancelled before use", async () => {
    const { id, token } = await createInvite(db, { email: "new@shop.com", createdBy: "lee", now });
    await cancelInvite(db, id, now);
    expect((await checkInvite(db, token, "new@shop.com", now)).kind).toBe("cancelled");
    await expect(redeem(token)).rejects.toThrow("cancelled");
    expect((await listInvites(db, now))[0].status).toBe("cancelled");
  });

  it("refuse a bad email, name, or time zone", async () => {
    await expect(createInvite(db, { email: "not an email", createdBy: "lee", now })).rejects.toThrow("Enter the email");
    const { token } = await createInvite(db, { email: "new@shop.com", createdBy: "lee", now });
    await expect(redeem(token, { businessName: "  " })).rejects.toThrow("business name");
    await expect(redeem(token, { timeZone: "Mars/Olympus" })).rejects.toThrow("time zone");
    expect((await checkInvite(db, token, "new@shop.com", now)).kind).toBe("ok");
  });
});

describe("redeeming an invite", () => {
  it("creates an empty business with them as its only manager", async () => {
    const { token } = await createInvite(db, { email: "new@shop.com", createdBy: "lee", now });
    const businessId = await redeem(token);
    expect(businessId).not.toBe(1);

    const inside = await withBusiness(db, businessId, async (tx) => ({ business: await getBusiness(tx), team: await listEmployees(tx) }));
    expect(inside.business).toMatchObject({ name: "Corner Cafe", timeZone: "America/Chicago" });
    expect(inside.team.map((e) => [e.displayName, e.role])).toEqual([["Nia", "manager"]]);
    expect(await businessesForEmail(db, "new@shop.com")).toMatchObject([{ businessId, role: "manager" }]);

    const [invite] = await listInvites(db, now);
    expect(invite).toMatchObject({ status: "used", businessName: "Corner Cafe" });
  });

  it("can't see Alabaster's data", async () => {
    const { token } = await createInvite(db, { email: "new@shop.com", createdBy: "lee", now });
    const businessId = await redeem(token);
    const seen = await withBusiness(db, businessId, (tx) => tx.select().from(schema.employee));
    expect(seen.map((e) => e.displayName)).toEqual(["Nia"]);
    expect((await withBusiness(db, 1, listEmployees)).map((e) => e.displayName)).toEqual(["Ava"]);
  });

  it("makes only one business even if submitted twice", async () => {
    const { token } = await createInvite(db, { email: "new@shop.com", createdBy: "lee", now });
    const results = await Promise.allSettled([redeem(token), redeem(token)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(redeem(token)).rejects.toThrow("already been used");
    expect(await db.select().from(schema.business)).toHaveLength(2);
  });

  it("works for someone who already works at another business", async () => {
    const { token } = await createInvite(db, { email: "ava@example.com", createdBy: "lee", now });
    const businessId = await redeem(token, { email: "ava@example.com" });
    expect((await businessesForEmail(db, "ava@example.com")).map((m) => [m.businessId, m.role]).sort()).toEqual([
      [1, "employee"],
      [businessId, "manager"],
    ]);
  });
});
