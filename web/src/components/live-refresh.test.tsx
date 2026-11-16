import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRefresh } from "./live-refresh";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("LiveRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("refreshes on a timer and when the screen comes back, but not mid-typing", () => {
    const { unmount } = render(
      <>
        <LiveRefresh seconds={20} />
        <input aria-label="note" />
      </>,
    );
    vi.advanceTimersByTime(20_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(2);

    (document.querySelector("input") as HTMLInputElement).focus();
    vi.advanceTimersByTime(20_000);
    expect(refresh).toHaveBeenCalledTimes(2);

    unmount();
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
