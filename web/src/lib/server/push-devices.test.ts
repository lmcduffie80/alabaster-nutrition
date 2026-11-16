// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { openBusinessDatabase } from "@/test/businesses";
import { UserError } from "./errors";
import { isDeviceToken, sendPush } from "./push";
import { devicesFor, forgetDevice, forgetTokens, registerDevice } from "./push-devices";
import { addEmployee, listEmployees } from "./team";

let db: Db;
let ava: string;
let jordan: string;
const phone = "AB".repeat(32);
const tablet = "cd".repeat(32);

beforeEach(async () => {
  db = await openBusinessDatabase();
  await addEmployee(db, { displayName: "Ava", email: "" });
  await addEmployee(db, { displayName: "Jordan", email: "" });
  const team = await listEmployees(db);
  ava = team.find((e) => e.displayName === "Ava")!.id;
  jordan = team.find((e) => e.displayName === "Jordan")!.id;
});

describe("push devices", () => {
  it("remembers each phone once, lowercased, and moves it to whoever signs in on it", async () => {
    await registerDevice(db, ava, phone);
    await registerDevice(db, ava, phone);
    await registerDevice(db, jordan, tablet);
    expect(await devicesFor(db, [ava, jordan])).toEqual(new Map([[ava, [phone.toLowerCase()]], [jordan, [tablet]]]));

    await registerDevice(db, jordan, phone);
    expect((await devicesFor(db, [ava, jordan])).get(jordan)?.sort()).toEqual([phone.toLowerCase(), tablet]);
    expect((await devicesFor(db, [ava])).get(ava)).toBeUndefined();
  });

  it("rejects anything that isn't an APNs token", async () => {
    await expect(registerDevice(db, ava, "not a token")).rejects.toThrow(UserError);
    await expect(registerDevice(db, ava, 42)).rejects.toThrow(UserError);
    expect(isDeviceToken(phone)).toBe(true);
    expect(isDeviceToken("ab".repeat(20))).toBe(false);
  });

  it("forgets a person's own phone, or tokens Apple rejected", async () => {
    await registerDevice(db, ava, phone);
    await registerDevice(db, jordan, tablet);
    await forgetDevice(db, jordan, phone);
    expect((await devicesFor(db, [ava])).get(ava)).toEqual([phone.toLowerCase()]);
    await forgetDevice(db, ava, phone);
    await forgetTokens(db, [tablet]);
    expect((await devicesFor(db, [ava, jordan])).size).toBe(0);
  });

  it("skips sending when the APNs key isn't configured", async () => {
    delete process.env.APNS_KEY_ID;
    expect(await sendPush([phone], { title: "t", body: "b", path: "/schedule" })).toEqual({ invalid: [] });
  });
});
