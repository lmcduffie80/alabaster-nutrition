import "server-only";
import { headers } from "next/headers";

/** The iPhone app's web view adds this to its user agent (`ios/Alabaster/WebShell.swift`). */
export function isAppUserAgent(userAgent: string | null) {
  return /\bAlabasterApp\//.test(userAgent ?? "");
}

/** In the iPhone app, pages show no prices and no way to buy: plans are managed on the website. */
export async function isInApp() {
  return isAppUserAgent((await headers()).get("user-agent"));
}
