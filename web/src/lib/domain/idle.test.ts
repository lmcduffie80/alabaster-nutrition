import { describe, expect, it } from "vitest";
import { idleStatus, requestCountsAsUse, serverIdleDecision } from "./idle";

const minute = 60_000;

describe("idleStatus", () => {
  it("warns in the last minute and expires at 20 minutes", () => {
    expect(idleStatus(0, 19 * minute - 1000)).toEqual({ kind: "active" });
    expect(idleStatus(0, 19 * minute)).toEqual({ kind: "warning", secondsLeft: 60 });
    expect(idleStatus(0, 20 * minute - 1500)).toEqual({ kind: "warning", secondsLeft: 2 });
    expect(idleStatus(0, 20 * minute)).toEqual({ kind: "expired" });
  });
});

describe("requestCountsAsUse", () => {
  const use = (method: string, path: string, headers: Record<string, string>) => requestCountsAsUse(method, path, new Headers(headers));

  it("counts page changes, form submits and pings, not prefetches", () => {
    expect(use("GET", "/manage", { "sec-fetch-mode": "navigate" })).toBe(true);
    expect(use("GET", "/manage", { rsc: "1" })).toBe(true);
    expect(use("GET", "/manage", { rsc: "1", "next-router-prefetch": "1" })).toBe(false);
    expect(use("POST", "/manage", { "next-action": "abc" })).toBe(true);
    expect(use("POST", "/api/activity", {})).toBe(true);
    expect(use("GET", "/api/activity", {})).toBe(false);
    expect(use("GET", "/manage/inventory/photos/1", { "sec-fetch-mode": "no-cors" })).toBe(false);
  });
});

describe("serverIdleDecision", () => {
  const now = 100 * minute;

  it("starts the timer for a new or different session", () => {
    expect(serverIdleDecision(undefined, "sess_1", now, false)).toEqual({ kind: "ok", cookie: `sess_1.${now}` });
    expect(serverIdleDecision(`sess_0.${now - 60 * minute}`, "sess_1", now, false)).toEqual({ kind: "ok", cookie: `sess_1.${now}` });
    expect(serverIdleDecision("garbage", "sess_1", now, false)).toEqual({ kind: "ok", cookie: `sess_1.${now}` });
  });

  it("refreshes only on real use, and refuses a session idle 20 minutes", () => {
    const recent = `sess_1.${now - 5 * minute}`;
    expect(serverIdleDecision(recent, "sess_1", now, true)).toEqual({ kind: "ok", cookie: `sess_1.${now}` });
    expect(serverIdleDecision(recent, "sess_1", now, false)).toEqual({ kind: "ok", cookie: null });
    expect(serverIdleDecision(`sess_1.${now - 20 * minute}`, "sess_1", now, true)).toEqual({ kind: "expired" });
  });
});
