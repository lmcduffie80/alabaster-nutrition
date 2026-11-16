import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

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

/** Derived from the pepper so viewable PINs need no extra secret; rotating the pepper retires both together. */
function pinSealKey() {
  return Buffer.from(hkdfSync("sha256", secret("PIN_PEPPER"), "", "metzey pin seal v1", 32));
}

/** Encrypts a PIN so the business's managers and the employee can see it again. */
export function sealPin(pin: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pinSealKey(), iv);
  const sealed = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), sealed.toString("base64url")].join(".");
}

/** The PIN, or null if it was sealed with a different key or tampered with. */
export function openPin(sealed: string | null): string | null {
  if (!sealed) return null;
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", pinSealKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
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
