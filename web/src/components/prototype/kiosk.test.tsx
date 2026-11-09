import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Prototype } from "./prototype";

function enterPin(pin: string) {
  for (const digit of pin) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
}

describe("store iPad kiosk", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clocks an employee in with their PIN", () => {
    render(<Prototype />);
    enterPin("3906");
    expect(screen.getByText("Hi, Ava")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /clock in/i }));
    expect(screen.getByText(/^Clocked in at/)).toBeTruthy();
  });

  it("rejects a wrong PIN and locks after five tries", () => {
    render(<Prototype />);
    enterPin("1111");
    expect(screen.getByText(/didn’t match/)).toBeTruthy();

    for (let i = 0; i < 4; i++) enterPin("1111");
    expect(screen.getByText(/Keypad locked/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "5" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("returns to the keypad after 10 seconds of no activity", () => {
    vi.useFakeTimers();
    render(<Prototype />);
    enterPin("7152");
    expect(screen.getByText("Hi, Jordan")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Enter your PIN")).toBeTruthy();
  });

  it("opens manager tools only with the manager PIN", () => {
    render(<Prototype />);
    fireEvent.click(screen.getByRole("button", { name: /manager/i }));
    enterPin("3906");
    expect(screen.getByText(/didn’t match/)).toBeTruthy();

    enterPin("9036");
    expect(screen.getByRole("button", { name: /timesheets/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /lock/i })).toBeTruthy();
  });
});
