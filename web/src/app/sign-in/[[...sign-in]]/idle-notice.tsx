"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const notices: Record<string, string> = {
  idle: "You were signed out after 20 minutes of inactivity.",
  deleted: "Your account was deleted.",
};

/** After an idle sign-out or account deletion the browser can still hold the dead session for a moment; clear it first. */
export function IdleNotice({ children }: { children: ReactNode }) {
  const reason = useSearchParams().get("reason") ?? "";
  const notice = notices[reason];
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  useEffect(() => {
    if (notice && isLoaded && isSignedIn) void signOut({ redirectUrl: `/sign-in?reason=${reason}` });
  }, [notice, reason, isLoaded, isSignedIn, signOut]);

  if (!notice) return children;
  if (!isLoaded || isSignedIn) return <p className="text-sm text-ink/60">Signing you out…</p>;
  return (
    <>
      <p role="status" className="max-w-sm rounded-xl bg-white px-4 py-3 text-center text-sm text-ink/80 shadow-sm">
        {notice}
      </p>
      {children}
    </>
  );
}
