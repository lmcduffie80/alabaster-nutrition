"use client";

import { useActionState } from "react";
import { Field, FormMessage, inputClass } from "@/components/ui";
import { SubmitButton } from "@/app/manage/forms";
import { deleteAccountAction } from "./actions";

export function DeleteAccountForm() {
  const [state, formAction] = useActionState(deleteAccountAction, null);
  return (
    <form action={formAction} className="mt-4 space-y-3">
      <Field label="Type DELETE to confirm">
        <input name="confirm" required autoComplete="off" autoCapitalize="characters" className={inputClass} />
      </Field>
      <FormMessage error={state?.error} />
      <SubmitButton variant="danger">Delete my account</SubmitButton>
    </form>
  );
}
