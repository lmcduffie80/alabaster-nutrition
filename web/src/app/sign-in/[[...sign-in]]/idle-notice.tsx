"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/** After an idle sign-out the browser can still hold the revoked session for a moment; clear it before showing the form. */
export function IdleNotice({ children }: { children: ReactNode }) {
  const idle = useSearchParams().get("reason") === "idle";
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  useEffect(() => {
    if (idle && isLoaded && isSignedIn) void signOut({ redirectUrl: "/sign-in?reason=idle" });
  }, [idle, isLoaded, isSignedIn, signOut]);

  if (!idle) return children;
  if (!isLoaded || isSignedIn) return <p className="text-sm text-ink/60">Signing you out…</p>;
  return (
    <>
      <p role="status" className="max-w-sm rounded-xl bg-white px-4 py-3 text-center text-sm text-ink/80 shadow-sm">
        You were signed out after 20 minutes of inactivity.
      </p>
      {children}
    </>
  );
}
