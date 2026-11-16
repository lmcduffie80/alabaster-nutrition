// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ emails: [] as { to: string; subject: string; text: string; html: string }[], later: [] as (() => Promise<void>)[] }));
vi.mock("next/server", () => ({ after: (work: () => Promise<void>) => void sent.later.push(work) }));
vi.mock("./email", async (original) => ({
  ...(await original<typeof import("./email")>()),
  sendEmail: async (email: (typeof sent.emails)[number]) => (sent.emails.push(email), true),
}));

const { deliverLater, scheduleEmail } = await import("./notify");

const notice = {
  kind: "changed" as const,
  employeeId: "e1",
  name: "Ava <3",
  email: "ava@example.com",
  businessName: "Alabaster Nutrition",
  week: "Nov 16 – 22",
  shifts: ["Tue, Nov 17 · 9:00 AM – 1:00 PM"],
};

describe("schedule emails", () => {
  beforeEach(() => {
    sent.emails = [];
    sent.later = [];
  });

  it("lists the shifts, links to the schedule, and escapes names", () => {
    const email = scheduleEmail(notice, "https://app.example.com");
    expect(email.subject).toBe("Your schedule changed: Nov 16 – 22 · Alabaster Nutrition");
    expect(email.text).toContain("Tue, Nov 17 · 9:00 AM – 1:00 PM");
    expect(email.text).toContain("https://app.example.com/schedule");
    expect(email.html).toContain("Ava &lt;3");
    expect(scheduleEmail({ ...notice, shifts: [] }, "https://x").text).toContain("no longer scheduled");
  });

  it("sends after the response, skipping people without an email", async () => {
    deliverLater([notice, { ...notice, employeeId: "e2", email: null }], "https://app.example.com");
    expect(sent.emails).toEqual([]);
    await Promise.all(sent.later.map((work) => work()));
    expect(sent.emails.map((e) => e.to)).toEqual(["ava@example.com"]);
  });
});
