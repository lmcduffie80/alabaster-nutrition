"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/** The manager's account must not stay signed in on the counter device, so sign out as soon as this page opens. */
export function SignOutToKiosk() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  useEffect(() => {
    if (isLoaded && isSignedIn) void signOut({ redirectUrl: "/kiosk/ready" });
  }, [isLoaded, isSignedIn, signOut]);

  if (!isLoaded || isSignedIn) {
    return <p className="mt-5 text-center text-sm text-ink/60">Signing you out on this device…</p>;
  }
  return (
    <Link
      href="/kiosk"
      className="mt-5 flex w-full justify-center rounded-xl bg-porcelain py-3 text-sm font-semibold text-white hover:bg-porcelain-dark"
    >
      Open the time clock
    </Link>
  );
}
