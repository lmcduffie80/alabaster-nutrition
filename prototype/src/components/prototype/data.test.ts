import { describe, expect, it } from "vitest";
import { formatHour, formatMinutes, formatTimer, initialManagerPin, initialPins, isSimplePin } from "./data";

describe("isSimplePin", () => {
  it.each(["0000", "7777", "1234", "6789", "4321", "9876"])("rejects %s", (pin) => {
    expect(isSimplePin(pin)).toBe(true);
  });

  it.each(["3906", "1357", "2580", "1123"])("allows %s", (pin) => {
    expect(isSimplePin(pin)).toBe(false);
  });

  it("starts with valid, unique PINs", () => {
    const all = [...Object.values(initialPins), initialManagerPin];
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter(isSimplePin)).toEqual([]);
  });
});

describe("formatting", () => {
  it("formats hours on a 12-hour clock", () => {
    expect(formatHour(0)).toBe("12:00 AM");
    expect(formatHour(7)).toBe("7:00 AM");
    expect(formatHour(12)).toBe("12:00 PM");
    expect(formatHour(13.5)).toBe("1:30 PM");
  });

  it("formats minutes as hours and minutes", () => {
    expect(formatMinutes(1761)).toBe("29h 21m");
    expect(formatMinutes(5)).toBe("0h 05m");
    expect(formatMinutes(-15)).toBe("−0h 15m");
  });

  it("formats a running timer", () => {
    expect(formatTimer(0)).toBe("0:00:00");
    expect(formatTimer(3_723_000)).toBe("1:02:03");
  });
});
