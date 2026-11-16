"use client";

import { useEffect, useRef, useState } from "react";

/** What the Metzey iPhone app reports back through the `metzey-push` event. */
export type PushStatus = { status: "granted" | "denied" | "notDetermined"; token?: string };

type Bridge = { postMessage(message: { type: "pushStatus" | "enablePush" | "openSettings" }): void };

function bridge(): Bridge | null {
  if (!navigator.userAgent.includes("AlabasterApp/")) return null;
  const handlers = (window as { webkit?: { messageHandlers?: { metzey?: Bridge } } }).webkit?.messageHandlers;
  return handlers?.metzey ?? null;
}

/** Only shows inside the iPhone app; saves this phone so schedule notices arrive as notifications. */
export function PhoneNotifications() {
  const [push, setPush] = useState<PushStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef<string | null>(null);

  useEffect(() => {
    const app = bridge();
    if (!app) return;
    const onStatus = (event: Event) => setPush((event as CustomEvent<PushStatus>).detail);
    window.addEventListener("metzey-push", onStatus);
    app.postMessage({ type: "pushStatus" });
    return () => window.removeEventListener("metzey-push", onStatus);
  }, []);

  useEffect(() => {
    const token = push?.status === "granted" ? push.token : undefined;
    if (!token || saved.current === token) return;
    saved.current = token;
    fetch("/api/push/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((response) => setError(response.ok ? null : "Couldn't turn on notifications. Try again later."))
      .catch(() => setError("Couldn't turn on notifications. Try again later."));
  }, [push]);

  if (!push) return null;
  const on = push.status === "granted";
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm">
      <span>
        <span className="font-medium">Notify me on this phone</span>
        <span className="block text-xs text-ink/50">
          {error ?? (on ? "On" : push.status === "denied" ? "Off · turn on in Settings" : "Off") + " · when your shifts change"}
        </span>
      </span>
      {!on && (
        <button
          type="button"
          className="text-sm font-semibold text-porcelain hover:underline"
          onClick={() => bridge()?.postMessage({ type: push.status === "denied" ? "openSettings" : "enablePush" })}
        >
          {push.status === "denied" ? "Settings" : "Turn on"}
        </button>
      )}
    </div>
  );
}
