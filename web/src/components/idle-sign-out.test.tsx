import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_STORAGE_KEY } from "@/lib/domain/idle";
import { IdleSignOut } from "./idle-sign-out";

const clerk = vi.hoisted(() => ({ signOut: vi.fn(async () => {}), sessionId: "sess_1" as string | null }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: clerk.sessionId !== null, sessionId: clerk.sessionId }),
  useClerk: () => ({ signOut: clerk.signOut }),
}));

const minute = 60_000;
const advance = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000_000_000 });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  window.localStorage.clear();
  clerk.signOut.mockClear();
  clerk.sessionId = "sess_1";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("IdleSignOut", () => {
  it("warns at 19 minutes and signs out at 20", async () => {
    render(<IdleSignOut />);
    await advance(19 * minute - 1000);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await advance(1000);
    expect(screen.getByRole("alertdialog").textContent).toContain("signed out in 60 seconds");
    await advance(minute);
    expect(clerk.signOut).toHaveBeenCalledWith({ redirectUrl: "/sign-in?reason=idle" });
  });

  it("starts over when the person uses the page or taps Stay signed in", async () => {
    render(<IdleSignOut />);
    await advance(10 * minute);
    fireEvent.keyDown(window);
    await advance(19 * minute);
    expect(screen.queryByRole("alertdialog")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await advance(19 * minute - 1000);
    expect(clerk.signOut).not.toHaveBeenCalled();
  });

  it("follows activity in other tabs", async () => {
    render(<IdleSignOut />);
    await advance(19 * minute);
    expect(screen.queryByRole("alertdialog")).not.toBeNull();
    window.localStorage.setItem(IDLE_STORAGE_KEY, `sess_1.${Date.now()}`);
    await act(async () => void window.dispatchEvent(new StorageEvent("storage", { key: IDLE_STORAGE_KEY })));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("signs out right away on return after 20 minutes, but not a new sign-in", async () => {
    window.localStorage.setItem(IDLE_STORAGE_KEY, `sess_1.${Date.now() - 25 * minute}`);
    render(<IdleSignOut />);
    expect(clerk.signOut).toHaveBeenCalledTimes(1);

    clerk.signOut.mockClear();
    clerk.sessionId = "sess_2";
    render(<IdleSignOut />);
    await advance(1000);
    expect(clerk.signOut).not.toHaveBeenCalled();
  });

  it("tells the server about use at most once a minute", async () => {
    render(<IdleSignOut />);
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(10_000);
    fireEvent.pointerDown(window);
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(minute);
    fireEvent.pointerDown(window);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith("/api/activity", { method: "POST", keepalive: true });
  });
});
