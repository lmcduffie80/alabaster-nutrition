import { describe, expect, it } from "vitest";
import { countDue, formatQuantity, isLow, onHand, parseQuantity, reorderAmount } from "./inventory";

const tz = "America/New_York";
const SUNDAY = 0;

describe("parseQuantity", () => {
  it("accepts whole numbers and up to two decimals", () => {
    expect(parseQuantity("2.5")).toBe(2.5);
    expect(parseQuantity("0")).toBe(0);
    expect(parseQuantity(" 3 ")).toBe(3);
    expect(parseQuantity("1.25")).toBe(1.25);
  });

  it("treats blank as not counted", () => {
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("  ")).toBeNull();
  });

  it("rejects negatives, extra decimals, words, and huge numbers", () => {
    for (const bad of ["-1", "1.234", "abc", "1e3", "100000000"]) {
      expect(() => parseQuantity(bad), bad).toThrow(/number/);
    }
  });
});

describe("countDue", () => {
  // 2026-11-15 is a Sunday.
  const sundayMidnight = new Date("2026-11-15T05:00:00Z");

  it("is due from the start of the count day", () => {
    expect(countDue({ now: sundayMidnight, weekday: SUNDAY, timeZone: tz, lastFinishedAt: new Date("2026-11-14T20:00:00Z") })).toBe(true);
  });

  it("isn't due once that day's count is finished", () => {
    const now = new Date("2026-11-15T20:00:00Z");
    expect(countDue({ now, weekday: SUNDAY, timeZone: tz, lastFinishedAt: new Date("2026-11-15T15:00:00Z") })).toBe(false);
  });

  it("stays due after a missed count day", () => {
    const monday = new Date("2026-11-16T15:00:00Z");
    expect(countDue({ now: monday, weekday: SUNDAY, timeZone: tz, lastFinishedAt: new Date("2026-11-08T15:00:00Z") })).toBe(true);
  });

  it("isn't due during the week after a count", () => {
    const saturday = new Date("2026-11-21T15:00:00Z");
    expect(countDue({ now: saturday, weekday: SUNDAY, timeZone: tz, lastFinishedAt: new Date("2026-11-15T15:00:00Z") })).toBe(false);
  });

  it("is due when nothing has been counted yet", () => {
    expect(countDue({ now: sundayMidnight, weekday: 3, timeZone: tz, lastFinishedAt: null })).toBe(true);
  });

  it("uses the store's day, not UTC", () => {
    // Saturday 11:30 PM in New York is already Sunday in UTC.
    const saturdayNight = new Date("2026-11-15T04:30:00Z");
    expect(countDue({ now: saturdayNight, weekday: SUNDAY, timeZone: tz, lastFinishedAt: new Date("2026-11-08T15:00:00Z") })).toBe(false);
  });
});

describe("stock levels", () => {
  it("is low at or below the reorder level, and unknown until counted", () => {
    expect(isLow(3, 3)).toBe(true);
    expect(isLow(2.5, 3)).toBe(true);
    expect(isLow(3.5, 3)).toBe(false);
    expect(isLow(null, 3)).toBe(false);
  });

  it("suggests whole units up to the order-up-to level", () => {
    expect(reorderAmount(2.5, 10)).toBe(8);
    expect(reorderAmount(10, 10)).toBe(0);
    expect(reorderAmount(12, 10)).toBe(0);
    expect(reorderAmount(null, 6)).toBe(6);
  });

  it("shows amounts with their unit", () => {
    expect(formatQuantity(1, "tub")).toBe("1 tub");
    expect(formatQuantity(2.5, "tub")).toBe("2.5 tubs");
    expect(formatQuantity(3, "sleeve of 50 cups")).toBe("3 sleeves of 50 cups");
    expect(formatQuantity(2, "box")).toBe("2 boxes");
    expect(formatQuantity(null, "tub")).toBe("—");
  });

  it("is the last count plus anything received since", () => {
    expect(onHand(null)).toBeNull();
    expect(onHand(4)).toBe(4);
    expect(onHand(4, 2.5)).toBe(6.5);
  });
});
