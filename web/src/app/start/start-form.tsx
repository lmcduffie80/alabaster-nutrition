"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, FormMessage, inputClass } from "@/components/ui";
import { SubmitButton } from "@/app/manage/forms";
import { startBusinessAction } from "./actions";

const zones = [
  { id: "America/New_York", label: "Eastern" },
  { id: "America/Chicago", label: "Central" },
  { id: "America/Denver", label: "Mountain" },
  { id: "America/Phoenix", label: "Arizona" },
  { id: "America/Los_Angeles", label: "Pacific" },
  { id: "America/Anchorage", label: "Alaska" },
  { id: "Pacific/Honolulu", label: "Hawaii" },
];

export function StartForm({ invite }: { invite: string }) {
  const [state, formAction] = useActionState(startBusinessAction, null);
  const zoneRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zoneRef.current && zones.some((z) => z.id === local)) zoneRef.current.value = local;
  }, []);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="invite" value={invite} />
      <Field label="Business name">
        <input name="name" required maxLength={60} autoComplete="organization" className={inputClass} />
      </Field>
      <Field label="Time zone" hint="Used for shifts, timesheets, and the weekly count.">
        <select ref={zoneRef} name="timeZone" defaultValue="America/New_York" className={inputClass}>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </select>
      </Field>
      <FormMessage error={state?.error} />
      <div>
        <SubmitButton>Create my business</SubmitButton>
      </div>
    </form>
  );
}
