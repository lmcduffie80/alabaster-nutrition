import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KioskEmployeeView } from "@/lib/server/kiosk-view";
import { Kiosk } from "./kiosk";

const actions = vi.hoisted(() => ({
  enterEmployeePin: vi.fn(),
  punch: vi.fn(),
  unlockManager: vi.fn(),
}));
vi.mock("./actions", () => actions);

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const view: KioskEmployeeView = {
  displayName: "Ava",
  status: "out",
  actions: ["clockIn"],
  workedMs: 0,
  clockedInAt: null,
  serverNow: 0,
  today: "7:00 AM – 1:00 PM · Opener",
  upcoming: [{ id: "s1", day: "Today", time: "7:00 AM – 1:00 PM", position: "Opener" }],
};

async function typePin(pin: string) {
  for (const digit of pin) {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: digit }));
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Kiosk", () => {
  it("clocks an employee in with their PIN and confirms it", async () => {
    actions.enterEmployeePin.mockResolvedValue({ kind: "employee", view });
    actions.punch.mockResolvedValue({ kind: "done", message: "Clocked in at 6:58 AM" });
    render(<Kiosk autoReturnSeconds={10} timeZone="America/New_York" />);

    await typePin("4821");
    expect(actions.enterEmployeePin).toHaveBeenCalledWith("4821");
    expect(screen.getByText("Hi, Ava")).toBeTruthy();
    expect(screen.getByText("Today: 7:00 AM – 1:00 PM · Opener")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Clock In/ }));
    });
    const call = actions.punch.mock.calls[0][0];
    expect(call).toMatchObject({ pin: "4821", kind: "clockIn" });
    expect(call.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByText("Clocked in at 6:58 AM")).toBeTruthy();
  });

  it("says when a PIN is wrong and when the keypad locks", async () => {
    actions.enterEmployeePin.mockResolvedValueOnce({ kind: "wrong" }).mockResolvedValueOnce({ kind: "locked", secondsLeft: 30 });
    render(<Kiosk autoReturnSeconds={10} timeZone="America/New_York" />);

    await typePin("1111");
    expect(screen.getByRole("alert").textContent).toContain("didn’t match");
    await typePin("2222");
    expect((screen.getByRole("button", { name: "5" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("tells the employee nothing was saved when the connection drops", async () => {
    actions.enterEmployeePin.mockResolvedValue({ kind: "employee", view });
    actions.punch.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Kiosk autoReturnSeconds={10} timeZone="America/New_York" />);

    await typePin("4821");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Clock In/ }));
    });
    expect(screen.getByText(/No connection — nothing was saved/)).toBeTruthy();
  });

  it("opens the manager tools only after the manager PIN", async () => {
    actions.unlockManager.mockResolvedValueOnce({ kind: "wrong" }).mockResolvedValueOnce({ kind: "manager" });
    render(<Kiosk autoReturnSeconds={10} timeZone="America/New_York" />);

    fireEvent.click(screen.getByRole("button", { name: /Manager/ }));
    await typePin("4821");
    expect(router.push).not.toHaveBeenCalled();
    await typePin("9036");
    expect(router.push).toHaveBeenCalledWith("/manage");
  });

  it("goes back to the keypad after the idle time", async () => {
    vi.useFakeTimers();
    actions.enterEmployeePin.mockResolvedValue({ kind: "employee", view });
    render(<Kiosk autoReturnSeconds={10} timeZone="America/New_York" />);
    await typePin("4821");
    expect(screen.getByText("Hi, Ava")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Enter your PIN")).toBeTruthy();
    vi.useRealTimers();
  });
});
