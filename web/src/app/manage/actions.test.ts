// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { openLocalDatabase } from "@/db/local";
import { schema } from "@/db";

const state = vi.hoisted(() => ({
  db: null as unknown as Db,
  user: null as null | { email: string; verified?: boolean },
  cookies: new Map<string, string>(),
}));

vi.mock("@/db", async (original) => ({ ...(await original<typeof import("@/db")>()), getDb: async () => state.db }));
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: async () =>
    state.user && {
      firstName: "Lee",
      primaryEmailAddress: {
        emailAddress: state.user.email,
        verification: { status: state.user.verified === false ? "unverified" : "verified" },
      },
    },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => state.cookies.set(name, value),
    delete: (name: string) => state.cookies.delete(name),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { addEmployeeAction, enrollKioskAction, setManagerPinAction } = await import("./actions");
const { unlockManager, enterEmployeePin } = await import("../kiosk/actions");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(async () => {
  process.env.OWNER_EMAIL = "owner@example.com";
  state.db = await openLocalDatabase();
  state.user = null;
  state.cookies.clear();
});

const employees = () => state.db.select().from(schema.employee);

describe("manager actions", () => {
  it("refuse anyone who isn't signed in as the manager", async () => {
    await expect(addEmployeeAction(null, form({ displayName: "Ava", email: "" }))).rejects.toThrow("REDIRECT /");

    state.user = { email: "stranger@example.com" };
    await expect(addEmployeeAction(null, form({ displayName: "Ava", email: "" }))).rejects.toThrow("REDIRECT /");

    state.user = { email: "owner@example.com", verified: false };
    await expect(addEmployeeAction(null, form({ displayName: "Ava", email: "" }))).rejects.toThrow("REDIRECT /");
    expect(await employees()).toHaveLength(0);
  });

  it("refuse employees, even signed in", async () => {
    state.user = { email: "owner@example.com" };
    await addEmployeeAction(null, form({ displayName: "Ava", email: "ava@example.com" }));
    state.user = { email: "ava@example.com" };
    await expect(addEmployeeAction(null, form({ displayName: "Mallory", email: "" }))).rejects.toThrow("REDIRECT /");
    expect((await employees()).map((e) => e.displayName).sort()).toEqual(["Ava", "Lee"]);
  });

  it("let the manager add an employee and show the new PIN once", async () => {
    state.user = { email: "OWNER@example.com" };
    const result = await addEmployeeAction(null, form({ displayName: "Ava", email: "" }));
    expect(result?.error).toBeUndefined();
    expect(result?.pin).toMatch(/^\d{4}$/);
    const [ava] = (await employees()).filter((e) => e.displayName === "Ava");
    expect(ava.pinDigest).not.toBe(result?.pin);
  });

  it("reject malformed ids instead of erroring", async () => {
    state.user = { email: "owner@example.com" };
    const { setActiveAction } = await import("./actions");
    const result = await setActiveAction(null, form({ id: "not-a-uuid", active: "false" }));
    expect(result?.error).toMatch(/no longer exists/);
  });
});

describe("kiosk and manager PIN", () => {
  it("only work on an enrolled device, and the manager PIN can't enroll devices", async () => {
    expect(await enterEmployeePin("4821")).toEqual({ kind: "notKiosk" });

    state.user = { email: "owner@example.com" };
    await setManagerPinAction(null, form({ pin: "9036", confirm: "9036" }));
    await expect(enrollKioskAction(form({ label: "Counter iPad" }))).rejects.toThrow("REDIRECT /kiosk/ready");
    expect(state.cookies.has("alabaster_kiosk")).toBe(true);

    // Signed out at the counter: the manager PIN opens the tools...
    state.user = null;
    expect(await unlockManager("1357")).toEqual({ kind: "wrong" });
    expect(await unlockManager("9036")).toEqual({ kind: "manager" });
    const added = await addEmployeeAction(null, form({ displayName: "Maya", email: "" }));
    expect(added?.pin).toMatch(/^\d{4}$/);

    // ...but not account-only actions.
    await expect(enrollKioskAction(form({ label: "Another" }))).rejects.toThrow("REDIRECT /");
    await expect(setManagerPinAction(null, form({ pin: "2468", confirm: "2468" }))).rejects.toThrow("REDIRECT /");

    // A manager ticket copied to a browser without the kiosk cookie is useless.
    state.cookies.delete("alabaster_kiosk");
    await expect(addEmployeeAction(null, form({ displayName: "Eve", email: "" }))).rejects.toThrow("REDIRECT /");
  });
});
