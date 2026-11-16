"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

function typing() {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
}

/**
 * Re-fetches the page's server data while it's on screen, and right away when it comes back (including the
 * iPhone app returning to the foreground), so schedule changes show up without a reload. Skips a beat while
 * someone is typing so a half-filled form isn't disturbed.
 */
export function LiveRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !typing()) router.refresh();
    };
    const timer = window.setInterval(refresh, seconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router, seconds]);

  return null;
}
