"use client";

import { useActionState } from "react";
import { Button, Card } from "@/components/ui";
import { getMyPinAction } from "./actions";

export function MyPin({ hasPin }: { hasPin: boolean }) {
  const [state, action, pending] = useActionState(getMyPinAction, null);
  const pin = state?.pin;

  return (
    <Card className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/60">Your clock-in PIN</p>
      {pin ? (
        <>
          <p className="mt-2 font-mono text-4xl font-semibold tracking-[0.4em]">{pin}</p>
          <p className="mt-1 text-sm text-ink/70">
            Use this on the store iPad. Remember it; it won&rsquo;t be shown again.
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-ink/70">
          {hasPin
            ? "You have a PIN. Forgot it? Get a new one; your old one stops working."
            : "You need a PIN to clock in on the store iPad. Only you will see it."}
        </p>
      )}
      {state?.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
      <form
        action={action}
        className="mt-3"
        onSubmit={(event) => {
          if (hasPin && !pin && !confirm("Get a new PIN? Your current one stops working.")) event.preventDefault();
        }}
      >
        <Button type="submit" variant={pin ? "secondary" : "primary"} disabled={pending}>
          {pending ? "One moment…" : pin ? "Show a different one" : hasPin ? "Get a new PIN" : "Get my PIN"}
        </Button>
      </form>
    </Card>
  );
}
