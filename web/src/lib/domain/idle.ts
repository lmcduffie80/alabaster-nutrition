export const IDLE_LIMIT_MS = 20 * 60_000;
export const IDLE_WARNING_MS = 60_000;
export const IDLE_COOKIE = "alabaster_active";
export const IDLE_STORAGE_KEY = "alabaster:last-active";

export type IdleStatus = { kind: "active" } | { kind: "warning"; secondsLeft: number } | { kind: "expired" };

export function idleStatus(lastActive: number, now: number): IdleStatus {
  const idle = now - lastActive;
  if (idle >= IDLE_LIMIT_MS) return { kind: "expired" };
  if (idle >= IDLE_LIMIT_MS - IDLE_WARNING_MS) return { kind: "warning", secondsLeft: Math.ceil((IDLE_LIMIT_MS - idle) / 1000) };
  return { kind: "active" };
}

export const ACTIVITY_PATH = "/api/activity";

/** Prefetches and background fetches don't keep a session alive; page changes, form submits and activity pings do. */
export function requestCountsAsUse(method: string, pathname: string, headers: { get(name: string): string | null }) {
  if (pathname === ACTIVITY_PATH) return method === "POST";
  if (headers.get("next-router-prefetch") || headers.get("purpose") === "prefetch") return false;
  if (headers.get("next-action")) return true;
  if (headers.get("rsc")) return true;
  return headers.get("sec-fetch-mode") === "navigate";
}

export type ServerIdleDecision = { kind: "expired" } | { kind: "ok"; cookie: string | null };

/**
 * `cookie` is `<sessionId>.<lastActiveMs>`. Returns the cookie to set (null to leave it) or `expired`.
 * A missing cookie or another session ID is a fresh sign-in, so the timer starts now.
 */
export function serverIdleDecision(cookie: string | undefined, sessionId: string, now: number, countsAsUse: boolean): ServerIdleDecision {
  const fresh = `${sessionId}.${now}`;
  const dot = cookie?.lastIndexOf(".") ?? -1;
  const last = dot > 0 ? Number(cookie!.slice(dot + 1)) : NaN;
  if (!cookie || cookie.slice(0, dot) !== sessionId || !Number.isFinite(last)) return { kind: "ok", cookie: fresh };
  if (now - last >= IDLE_LIMIT_MS) return { kind: "expired" };
  return { kind: "ok", cookie: countsAsUse ? fresh : null };
}
