import { describe, expect, it } from "vitest";
import { changedEmployees, snapshotOf } from "./schedule-notices";

const at = (hour: number) => new Date(Date.UTC(2026, 10, 16, hour));
const shift = (employeeId: string, start: number, extra: { position?: string; calledIn?: boolean } = {}) => ({
  employeeId,
  startsAt: at(start),
  endsAt: at(start + 4),
  position: extra.position ?? "",
  calledInAt: extra.calledIn ? at(start - 1) : null,
});

describe("schedule change detection", () => {
  const before = snapshotOf([shift("ava", 9), shift("ava", 14), shift("lee", 9)]);

  it("ignores order and unchanged people", () => {
    expect(changedEmployees(before, snapshotOf([shift("lee", 9), shift("ava", 14), shift("ava", 9)]))).toEqual([]);
  });

  it("finds added, edited, called-in, removed and moved shifts", () => {
    expect(changedEmployees(before, snapshotOf([...[shift("ava", 9), shift("ava", 14), shift("lee", 9)], shift("sam", 9)]))).toEqual(["sam"]);
    expect(changedEmployees(before, snapshotOf([shift("ava", 9), shift("ava", 15), shift("lee", 9)]))).toEqual(["ava"]);
    expect(changedEmployees(before, snapshotOf([shift("ava", 9), shift("ava", 14), shift("lee", 9, { position: "Register" })]))).toEqual(["lee"]);
    expect(changedEmployees(before, snapshotOf([shift("ava", 9), shift("ava", 14), shift("lee", 9, { calledIn: true })]))).toEqual(["lee"]);
    expect(changedEmployees(before, snapshotOf([shift("ava", 9), shift("ava", 14)]))).toEqual(["lee"]);
    expect(changedEmployees(before, snapshotOf([shift("ava", 9), shift("ava", 14), shift("sam", 9)])).sort()).toEqual(["lee", "sam"]);
  });

  it("treats no earlier notice as everyone scheduled being new", () => {
    expect(changedEmployees(null, before).sort()).toEqual(["ava", "lee"]);
  });
});
