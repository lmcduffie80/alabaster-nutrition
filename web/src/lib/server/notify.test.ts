// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({
  emails: [] as { to: string; subject: string; text: string; html: string }[],
  pushes: [] as { tokens: string[]; title: string; body: string; path: string }[],
  forgotten: [] as { businessId: number; tokens: string[] }[],
  invalid: [] as string[],
  later: [] as (() => Promise<void>)[],
}));
vi.mock("next/server", () => ({ after: (work: () => Promise<void>) => void sent.later.push(work) }));
vi.mock("./email", async (original) => ({
  ...(await original<typeof import("./email")>()),
  sendEmail: async (email: (typeof sent.emails)[number]) => (sent.emails.push(email), true),
}));
vi.mock("./push", () => ({
  sendPush: async (tokens: string[], message: { title: string; body: string; path: string }) => {
    if (tokens.length) sent.pushes.push({ tokens, ...message });
    return { invalid: tokens.filter((t) => sent.invalid.includes(t)) };
  },
}));
vi.mock("@/db", async (original) => ({ ...(await original<typeof import("@/db")>()), getDb: async () => ({}) }));
vi.mock("@/db/tenant", () => ({
  withBusiness: async (_db: unknown, businessId: number, work: (db: { businessId: number }) => Promise<unknown>) => work({ businessId }),
}));
vi.mock("./push-devices", () => ({
  forgetTokens: async (db: { businessId: number }, tokens: string[]) => void sent.forgotten.push({ businessId: db.businessId, tokens }),
}));

const { deliverLater, schedulePush } = await import("./notify");
const { scheduleEmail } = await import("./schedule-email");

const tuesday = { weekday: "Tue", date: "Nov 17", time: "9:00 AM – 1:00 PM", position: "", calledIn: false, minutes: 240 };
const notice = {
  kind: "changed" as const,
  employeeId: "e1",
  name: "Ava<3 Reed",
  email: "ava@example.com",
  devices: [] as string[],
  businessId: 7,
  businessName: "Alabaster Nutrition",
  week: "Nov 16 – 22",
  shifts: [tuesday],
};

describe("schedule notices", () => {
  beforeEach(() => {
    sent.emails = [];
    sent.pushes = [];
    sent.forgotten = [];
    sent.invalid = [];
    sent.later = [];
  });

  it("lists the shifts, links to the schedule, and escapes names", () => {
    const email = scheduleEmail(notice, "https://app.example.com");
    expect(email.subject).toBe("Your schedule changed: Nov 16 – 22 · Alabaster Nutrition");
    expect(email.text).toContain("Tue, Nov 17 · 9:00 AM – 1:00 PM");
    expect(email.text).toContain("https://app.example.com/schedule");
    expect(email.html).toContain("Hi Ava&lt;3,");
    expect(scheduleEmail({ ...notice, shifts: [] }, "https://x").text).toContain("no longer scheduled");
  });

  it("totals the week's hours, leaving out called-in shifts, and shows the button and opt-out", () => {
    const shifts = [tuesday, { ...tuesday, weekday: "Wed", date: "Nov 18", position: "Opener", minutes: 375 }, { ...tuesday, calledIn: true }];
    const email = scheduleEmail({ ...notice, kind: "published", shifts }, "https://app.example.com");
    expect(email.text).toContain("This week: 2 shifts · 10h 15m");
    expect(email.text).toContain("Wed, Nov 18 · 9:00 AM – 1:00 PM · Opener");
    expect(email.html).toContain("2 shifts · 10h 15m");
    expect(email.html).toContain("Called in");
    expect(email.html).toContain('href="https://app.example.com/schedule"');
    expect(email.html).toContain("View my schedule");
    expect(email.html).toContain("Email me schedule changes");
  });

  it("sends after the response, skipping people without an email", async () => {
    deliverLater([notice, { ...notice, employeeId: "e2", email: null }], "https://app.example.com");
    expect(sent.emails).toEqual([]);
    await Promise.all(sent.later.map((work) => work()));
    expect(sent.emails.map((e) => e.to)).toEqual(["ava@example.com"]);
    expect(sent.pushes).toEqual([]);
  });

  it("pushes to each person's phones and forgets the ones Apple rejects", async () => {
    sent.invalid = ["dead"];
    deliverLater(
      [
        { ...notice, email: null, devices: ["a1", "dead"] },
        { ...notice, employeeId: "e2", email: null, devices: ["b1"] },
      ],
      "https://app.example.com",
    );
    await Promise.all(sent.later.map((work) => work()));
    expect(sent.pushes.map((p) => p.tokens)).toEqual([["a1", "dead"], ["b1"]]);
    expect(sent.pushes[0]).toMatchObject({ title: "Your schedule changed: Nov 16 – 22 · Alabaster Nutrition", path: "/schedule" });
    expect(sent.forgotten).toEqual([{ businessId: 7, tokens: ["dead"] }]);
  });

  it("keeps long pushes short", () => {
    const shifts = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((weekday) => ({ ...tuesday, weekday, time: "9", date: "1" }));
    expect(schedulePush({ ...notice, shifts }).body).toBe("Mon, 1 · 9\nTue, 1 · 9\nWed, 1 · 9\n+2 more");
  });
});
