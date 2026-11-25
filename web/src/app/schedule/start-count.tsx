"use client";

import { ClipboardList } from "lucide-react";
import { useActionState } from "react";
import { Badge, Button, FormMessage } from "@/components/ui";
import { startMyCountAction, type CountState } from "./actions";

export function StartCount({ due }: { due: boolean }) {
  const [state, formAction, pending] = useActionState<CountState>(startMyCountAction, null);
  return (
    <form action={formAction}>
      <Button type="submit" variant={due ? "primary" : "secondary"} disabled={pending} className="w-full py-3">
        <ClipboardList className="size-5" />
        Count inventory
        {due && <Badge tone="gilt">Count due</Badge>}
      </Button>
      <FormMessage error={state?.error} />
    </form>
  );
}
