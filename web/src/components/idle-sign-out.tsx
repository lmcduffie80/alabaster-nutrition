"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { ACTIVITY_PATH, IDLE_STORAGE_KEY, idleStatus, type IdleStatus } from "@/lib/domain/idle";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"] as const;
const WRITE_EVERY_MS = 5_000;
const PING_EVERY_MS = 60_000;

/** Shared by every tab, as `<sessionId>.<lastActiveMs>`, so a new sign-in never inherits an old session's time. */
function readLastActive(sessionId: string) {
  const [id, at] = (window.localStorage.getItem(IDLE_STORAGE_KEY) ?? "").split(".");
  const value = Number(at);
  return id === sessionId && Number.isFinite(value) && value > 0 ? value : null;
}

function writeLastActive(sessionId: string, at: number) {
  window.localStorage.setItem(IDLE_STORAGE_KEY, `${sessionId}.${at}`);
}

const sameStatus = (a: IdleStatus, b: IdleStatus) =>
  a.kind === b.kind && (a.kind !== "warning" || (b.kind === "warning" && a.secondsLeft === b.secondsLeft));

/** Signs an account out after 20 minutes without use in any tab, with a one-minute warning. */
export function IdleSignOut() {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const { signOut } = useClerk();
  const [status, setStatus] = useState<IdleStatus>({ kind: "active" });
  const lastWrite = useRef(0);
  const lastPing = useRef(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !sessionId) return;
    let signingOut = false;
    const show = (next: IdleStatus) => setStatus((current) => (sameStatus(current, next) ? current : next));

    const markActive = (force = false) => {
      const now = Date.now();
      if (signingOut || (!force && now - lastWrite.current < WRITE_EVERY_MS)) return;
      const current = readLastActive(sessionId);
      if (current !== null && idleStatus(current, now).kind === "expired") return;
      lastWrite.current = now;
      writeLastActive(sessionId, now);
      show({ kind: "active" });
      if (now - lastPing.current >= PING_EVERY_MS) {
        lastPing.current = now;
        void fetch(ACTIVITY_PATH, { method: "POST", keepalive: true }).catch(() => {});
      }
    };

    const check = () => {
      if (signingOut) return;
      const last = readLastActive(sessionId);
      if (last === null) return markActive(true);
      const next = idleStatus(last, Date.now());
      show(next);
      if (next.kind === "expired") {
        signingOut = true;
        void signOut({ redirectUrl: "/sign-in?reason=idle" });
      }
    };

    const onActivity = () => markActive();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === IDLE_STORAGE_KEY) check();
    };

    check();
    markActive(true);
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(check, 1000);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, [isLoaded, isSignedIn, sessionId, signOut]);

  if (!isSignedIn || !sessionId || status.kind !== "warning") return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" role="presentation">
      <div role="alertdialog" aria-labelledby="idle-title" aria-describedby="idle-body" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p id="idle-title" className="font-serif text-2xl font-semibold">
          Still there?
        </p>
        <p id="idle-body" className="mt-2 text-sm text-ink/70">
          For security, you&rsquo;ll be signed out in <span className="font-semibold tabular-nums">{status.secondsLeft}</span>{" "}
          {status.secondsLeft === 1 ? "second" : "seconds"}.
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => {
            lastWrite.current = Date.now();
            writeLastActive(sessionId, lastWrite.current);
            setStatus({ kind: "active" });
          }}
          className="mt-5 w-full rounded-xl bg-porcelain py-3 text-sm font-semibold text-white hover:bg-porcelain-dark"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
