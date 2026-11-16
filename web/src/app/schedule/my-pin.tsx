"use client";

import { useActionState, useState } from "react";
import { Button, Card } from "@/components/ui";
import { getMyPinAction } from "./actions";

export function MyPin({ hasPin, current }: { hasPin: boolean; current: string | null }) {
  const [state, action, pending] = useActionState(getMyPinAction, null);
  const [shown, setShown] = useState(false);
  const pin = state?.pin ?? current;
  const fresh = Boolean(state?.pin);

  return (
    <Card className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/60">Your clock-in PIN</p>
      {pin ? (
        <>
          <div className="mt-2 flex items-center gap-3">
            <p className="font-mono text-4xl font-semibold tracking-[0.4em]">{shown || fresh ? pin : "••••"}</p>
            {!fresh && (
              <button type="button" className="text-sm font-semibold text-porcelain hover:underline" onClick={() => setShown(!shown)}>
                {shown ? "Hide" : "Show"}
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-ink/70">Use this on the store iPad. You can see it here anytime.</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-ink/70">
          {hasPin
            ? "You have a PIN from before PINs could be shown here. Forgot it? Get a new one; your old one stops working."
            : "You need a PIN to clock in on the store iPad."}
        </p>
      )}
      {state?.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
      <form
        action={action}
        className="mt-3"
        onSubmit={(event) => {
          if (hasPin && !confirm("Get a new PIN? Your current one stops working.")) event.preventDefault();
        }}
      >
        <Button type="submit" variant={pin ? "secondary" : "primary"} disabled={pending}>
          {pending ? "One moment…" : hasPin || pin ? "Get a new PIN" : "Get my PIN"}
        </Button>
      </form>
    </Card>
  );
}
