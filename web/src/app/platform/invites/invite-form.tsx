"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormMessage, inputClass } from "@/components/ui";
import { SubmitButton } from "@/app/manage/forms";
import { createInviteAction } from "./actions";

export function InviteForm() {
  const [state, formAction] = useActionState(createInviteAction, null);
  const [copied, setCopied] = useState<number | null>(null);
  const link = state?.token ? `${window.location.origin}/start?invite=${state.token}` : null;

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Field label="Their email">
            <input name="email" type="email" required maxLength={200} autoComplete="off" className={inputClass} />
          </Field>
        </div>
        <SubmitButton>Create sign-up link</SubmitButton>
      </form>
      <FormMessage error={state?.error} />
      {link && (
        <div className="mt-3 rounded-lg bg-porcelain-light px-3 py-2 text-sm">
          <p>
            Link for <strong>{state?.email}</strong>. Send it to them yourself; it works once, for that email, for 7 days.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-xs">{link}</code>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(state?.at ?? 0);
              }}
            >
              {copied === state?.at ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-ink/60">This link won&rsquo;t be shown again.</p>
        </div>
      )}
    </div>
  );
}
