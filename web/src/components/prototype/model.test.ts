import { describe, expect, it } from "vitest";
import { workedMs, type Clock } from "./model";

const base: Clock = { status: "out", clockedInAt: null, breakStartedAt: null, breakMs: 0, lastShiftMs: null };

describe("workedMs", () => {
  it("is zero when clocked out", () => {
    expect(workedMs(base, 10_000)).toBe(0);
  });

  it("counts time since clock-in minus finished breaks", () => {
    const clock: Clock = { ...base, status: "in", clockedInAt: 0, breakMs: 15 * 60_000 };
    expect(workedMs(clock, 60 * 60_000)).toBe(45 * 60_000);
  });

  it("stops counting during a break", () => {
    const clock: Clock = { ...base, status: "break", clockedInAt: 0, breakStartedAt: 30 * 60_000 };
    expect(workedMs(clock, 50 * 60_000)).toBe(30 * 60_000);
  });
});
