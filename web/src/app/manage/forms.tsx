"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, FormMessage } from "@/components/ui";
import { lockAction, type FormState } from "./actions";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

/**
 * A form posting to a manager action. Shows the action's message, and a new PIN once
 * (it isn't stored anywhere it can be read back).
 */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  confirm,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state && !state.error) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {children}
      {(state?.error || state?.success || state?.pin) && (
        <div className="mt-2 basis-full space-y-1">
          <FormMessage error={state.error} success={state.success} />
          {state.pin && (
            <p className="rounded-lg bg-porcelain-light px-3 py-2 text-sm">
              New PIN: <strong className="font-mono text-lg tracking-widest">{state.pin}</strong>
              <span className="block text-xs text-ink/60">Write it down for them now. It won&rsquo;t be shown again.</span>
            </p>
          )}
        </div>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  name,
  value,
  className = "",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  name?: string;
  value?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} name={name} value={value} disabled={pending} className={className}>
      {children}
    </Button>
  );
}

export function NavLink({ href, children, exact = false }: { href: string; children: ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact || href === "/manage" ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium ${
        active ? "bg-porcelain-light text-porcelain" : "text-ink/70 hover:bg-ink/5"
      }`}
    >
      {children}
    </Link>
  );
}

const IDLE_LOCK_MS = 2 * 60_000;

/** On the store kiosk, the manager area locks itself after two idle minutes. */
export function KioskLock() {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let timer = setTimeout(() => form.current?.requestSubmit(), IDLE_LOCK_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => form.current?.requestSubmit(), IDLE_LOCK_MS);
    };
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, []);
  return (
    <form ref={form} action={lockAction}>
      <SubmitButton variant="secondary" className="w-full">
        <Lock className="size-4" /> Lock
      </SubmitButton>
    </form>
  );
}
