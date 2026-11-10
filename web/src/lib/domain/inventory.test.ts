import { describe, expect, it } from "vitest";
import {
  countDue,
  deliveryCounts,
  formatMoney,
  formatQuantity,
  isLow,
  onHand,
  parseMoney,
  parseQuantity,
  reorderAmount,
  stockValue,
  unitCost,
  usageFlag,
  usagePeriods,
} from "./inventory";

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

describe("deliveries and costs", () => {
  it("adds deliveries after the count, and same-day ones unless already on the shelf", () => {
    expect(deliveryCounts("2026-11-10", false, "2026-11-09")).toBe(true);
    expect(deliveryCounts("2026-11-08", false, "2026-11-09")).toBe(false);
    expect(deliveryCounts("2026-11-09", false, "2026-11-09")).toBe(true);
    expect(deliveryCounts("2026-11-09", true, "2026-11-09")).toBe(false);
  });

  it("prices one count unit from the line total", () => {
    expect(unitCost(84, 4)).toBe(21);
    expect(unitCost(null, 4)).toBeNull();
    expect(stockValue(2.5, 21)).toBe(52.5);
    expect(stockValue(null, 21)).toBeNull();
    expect(stockValue(3, null)).toBeNull();
  });

  it("reads and shows dollar amounts", () => {
    expect(parseMoney("$1,234.5")).toBe(1234.5);
    expect(parseMoney(" ")).toBeNull();
    expect(() => parseMoney("12.345")).toThrow(/42.50/);
    expect(() => parseMoney("-3")).toThrow();
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(null)).toBe("—");
  });
});

describe("usage", () => {
  const count = (id: string, countedOn: string, quantities: Record<string, number | null>) => ({
    id,
    countedOn,
    quantities: new Map(Object.entries(quantities)),
  });

  it("is start + received in between − end, with same-day deliveries going to the right count", () => {
    const counts = [count("a", "2026-11-01", { tubs: 4, cups: 10 }), count("b", "2026-11-08", { tubs: 3, cups: null })];
    const deliveries = [
      { itemId: "tubs", quantity: 6, receivedOn: "2026-11-01", onShelfForCount: true }, // already in count a
      { itemId: "tubs", quantity: 5, receivedOn: "2026-11-01", onShelfForCount: false }, // after count a
      { itemId: "tubs", quantity: 2, receivedOn: "2026-11-05", onShelfForCount: false },
      { itemId: "tubs", quantity: 7, receivedOn: "2026-11-08", onShelfForCount: true }, // on the shelf for count b
      { itemId: "tubs", quantity: 9, receivedOn: "2026-11-08", onShelfForCount: false }, // after count b
    ];
    const [period] = usagePeriods(counts, deliveries);
    expect(period).toMatchObject({ fromCountId: "a", toCountId: "b", from: "2026-11-01", to: "2026-11-08" });
    expect(period.lines.get("tubs")).toEqual({ start: 4, received: 14, end: 3, used: 15 });
    expect(period.lines.get("cups")).toEqual({ start: 10, received: 0, end: null, used: null });
    expect(usagePeriods(counts.slice(0, 1), deliveries)).toEqual([]);
  });

  it("flags impossible counts, and usage well above the last four periods", () => {
    expect(usageFlag(-1, [])).toBe("mismatch");
    expect(usageFlag(null, [1, 1, 1, 1])).toBeNull();
    expect(usageFlag(9, [4, 4, 4])).toBeNull();
    expect(usageFlag(6, [4, 4, 4, 4])).toBeNull();
    expect(usageFlag(6.5, [4, 4, 4, 4])).toBe("high");
    expect(usageFlag(6.5, [100, 4, 4, 4, 4])).toBe("high");
    // Skipped periods don't count toward the four.
    expect(usageFlag(6.5, [4, null, 4, 4, 4])).toBe("high");
    expect(usageFlag(6.5, [null, 4, 4, 4])).toBeNull();
  });
});
