export const PIN_LENGTH = 4;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 30_000;

export type PinProblem = "format" | "simple";

/** All the same digit, or counting straight up or down (1234, 9876). */
export function isSimplePin(pin: string) {
  const digits = pin.split("").map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  return steps.every((s) => s === 0) || steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

export function pinProblem(pin: string): PinProblem | null {
  if (!/^\d{4}$/.test(pin)) return "format";
  if (isSimplePin(pin)) return "simple";
  return null;
}

export const pinProblemMessage: Record<PinProblem, string> = {
  format: "A PIN is exactly 4 digits.",
  simple: "Choose a PIN that isn't all one digit or a straight run like 1234.",
};

/**
 * After a failed attempt: either count it, or lock the keypad and reset the count.
 */
export function afterFailedAttempt(failedAttempts: number, now: Date) {
  const attempts = failedAttempts + 1;
  if (attempts >= MAX_PIN_ATTEMPTS) {
    return { failedAttempts: 0, lockedUntil: new Date(now.getTime() + PIN_LOCKOUT_MS) };
  }
  return { failedAttempts: attempts, lockedUntil: null };
}
