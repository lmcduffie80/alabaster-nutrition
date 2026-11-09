import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

function secret(name: "PIN_PEPPER" | "SESSION_SECRET") {
  const value = process.env[name];
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be set to at least 32 characters.`);
  }
  return `development-only-${name}-not-for-real-use`;
}

/**
 * Keyed so a copy of the database alone can't be used to try all 10,000 PINs.
 * Deterministic so the database can enforce one PIN per active employee.
 */
export function pinDigest(pin: string) {
  return createHmac("sha256", secret("PIN_PEPPER")).update(`pin:${pin}`).digest("hex");
}

export function randomPin() {
  return randomInt(0, 10_000).toString().padStart(4, "0");
}

export function newToken() {
  return randomBytes(32).toString("base64url");
}

export function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function signature(payload: string) {
  return createHmac("sha256", secret("SESSION_SECRET")).update(payload).digest("base64url");
}

export function sign(value: object) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verify<T>(signed: string | undefined): T | null {
  if (!signed) return null;
  const [payload, sig] = signed.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as T;
  } catch {
    return null;
  }
}
