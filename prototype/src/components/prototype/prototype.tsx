"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, Inbox, Sun, type LucideIcon } from "lucide-react";
import { employees } from "./data";
import { EmployeeRequests, EmployeeSchedule, EmployeeToday } from "./employee-screens";
import { Kiosk } from "./kiosk";
import { useAppModel, type AppModel } from "./model";
import { Wordmark } from "./ui";

type View = "kiosk" | "phone";

const phoneTabs: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Today", icon: Sun },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "requests", label: "Requests", icon: Inbox },
];

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-ink/10">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
            value === o.id ? "bg-porcelain text-white" : "text-ink/60 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="absolute inset-x-4 top-14 z-10 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-lg">
      {message}
    </div>
  );
}

function IpadFrame({ app, children }: { app: AppModel; children: ReactNode }) {
  return (
    <div className="h-[880px] w-[640px] shrink-0 rounded-[40px] bg-ink p-4 shadow-2xl">
      <div className="relative h-full overflow-hidden rounded-[26px] bg-alabaster">
        {children}
        <Toast message={app.toast} />
      </div>
    </div>
  );
}

function PhoneApp({ app }: { app: AppModel }) {
  const [tab, setTab] = useState("today");

  return (
    <div className="h-[820px] w-[400px] shrink-0 rounded-[56px] bg-ink p-3 shadow-2xl">
      <div className="relative flex h-full flex-col overflow-hidden rounded-[44px] bg-alabaster">
        <div className="flex items-center justify-between px-8 pb-1 pt-4 text-xs font-semibold">
          <span>8:15</span>
          <span className="h-6 w-24 rounded-full bg-ink" />
          <span>100%</span>
        </div>

        <header className="flex items-end justify-between border-b border-ink/10 px-5 pb-3 pt-2">
          <h2 className="font-serif text-3xl font-semibold">{phoneTabs.find((t) => t.id === tab)?.label}</h2>
          <Wordmark />
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {tab === "today" && <EmployeeToday app={app} />}
          {tab === "schedule" && <EmployeeSchedule app={app} />}
          {tab === "requests" && <EmployeeRequests app={app} />}
        </div>

        <Toast message={app.toast} />

        <nav className="flex border-t border-ink/10 bg-white/90 px-2 pb-6 pt-2">
          {phoneTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-medium ${
                  t.id === tab ? "text-porcelain" : "text-ink/40"
                }`}
              >
                <Icon className="size-6" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function Prototype() {
  const app = useAppModel();
  const [view, setView] = useState<View>("kiosk");

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col items-center gap-10 px-6 py-10 lg:flex-row lg:items-start lg:justify-center">
      <aside className="w-full max-w-sm space-y-6 lg:sticky lg:top-10">
        <div>
          <Wordmark size="lg" />
          <p className="mt-4 text-center font-serif text-xl font-semibold">Scheduling &amp; timekeeping prototype</p>
          <p className="mt-2 text-center text-sm text-ink/60">
            A clickable mockup for reviewing the design before it’s built in Xcode. Nothing is saved, so refresh to
            start over.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Device</p>
          <Segmented
            options={[
              { id: "kiosk", label: "Store iPad" },
              { id: "phone", label: "Ava’s iPhone" },
            ]}
            value={view}
            onChange={setView}
          />
        </div>

        <div className="rounded-2xl bg-white/70 p-4 text-sm ring-1 ring-ink/10">
          <p className="font-semibold">Test PINs</p>
          <p className="text-xs text-ink/50">Shown here for testing only.</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {employees.map((e) => (
              <div key={e.id} className="flex justify-between">
                <dt className="text-ink/70">{e.name}</dt>
                <dd className="font-mono font-semibold">{app.pins[e.id]}</dd>
              </div>
            ))}
            <div className="col-span-2 flex justify-between border-t border-ink/10 pt-1">
              <dt className="text-ink/70">Manager unlock</dt>
              <dd className="font-mono font-semibold">{app.managerPin}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl bg-white/70 p-4 text-sm text-ink/70 ring-1 ring-ink/10">
          <p className="font-semibold text-ink">Things to try</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Enter Ava’s PIN on the iPad and clock in, then unlock Manager to see her on Today.</li>
            <li>Type a wrong PIN five times to see the lockout.</li>
            <li>As manager, give someone a new PIN in Settings.</li>
            <li>On Ava’s iPhone, pick up Friday’s open shift, then approve it as manager.</li>
          </ul>
        </div>
      </aside>

      {view === "kiosk" ? (
        <IpadFrame app={app}>
          <Kiosk app={app} />
        </IpadFrame>
      ) : (
        <PhoneApp app={app} />
      )}
    </main>
  );
}
