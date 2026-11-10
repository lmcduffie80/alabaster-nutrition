"use client";

import { ClipboardList, Coffee, Delete, Lock, LogIn, LogOut, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Badge, Button, Card, FramedPanel, Wordmark } from "@/components/ui";
import type { PunchKind } from "@/lib/domain/punches";
import { formatTimer } from "@/lib/domain/time";
import type { KioskEmployeeView } from "@/lib/server/kiosk-view";
import { enterEmployeePin, punch, startCounting, stopCounting, unlockManager, type CountScreenView, type PinResult } from "./actions";
import { CountScreen } from "./count-screen";

const CONFIRM_MS = 3_000;
const COUNTING_IDLE_MS = 5 * 60_000;
const COUNT_EXPIRED_MESSAGE = "Counting timed out. Enter your PIN to keep going — nothing was lost.";
const OFFLINE_MESSAGE = "No connection — nothing was saved. Check the Wi-Fi and try again.";

type PadResult = Exclude<PinResult, { kind: "employee" }> | { kind: "ok" };

type Mode =
  | { kind: "keypad" }
  | { kind: "managerPad" }
  | { kind: "employee"; pin: string; view: KioskEmployeeView; loadedAt: number }
  | { kind: "counting"; view: CountScreenView }
  | { kind: "message"; text: string; tone: "ok" | "error" };

function secondsFromNow(seconds: number) {
  return Date.now() + seconds * 1000;
}

function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
}

/** Ticks once a second on the client; `0` during server render so markup matches on hydration. */
function useNow() {
  return useSyncExternalStore(subscribeClock, () => Math.floor(Date.now() / 1000) * 1000, () => 0);
}

export function Kiosk({ autoReturnSeconds, timeZone }: { autoReturnSeconds: number; timeZone: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "keypad" });
  const [activity, setActivity] = useState(0);

  useEffect(() => {
    const delay =
      mode.kind === "employee" || mode.kind === "managerPad"
        ? autoReturnSeconds * 1000
        : mode.kind === "counting"
          ? COUNTING_IDLE_MS
          : mode.kind === "message"
            ? CONFIRM_MS
            : null;
    if (delay === null) return;
    const counting = mode.kind === "counting";
    const id = setTimeout(() => {
      if (counting) void stopCounting().catch(() => {});
      setMode({ kind: "keypad" });
    }, delay);
    return () => clearTimeout(id);
  }, [mode, activity, autoReturnSeconds]);

  const handleNotKiosk = () => router.refresh();

  async function beginCount(pin: string) {
    try {
      const result = await startCounting(pin);
      if (result.kind === "counting") setMode({ kind: "counting", view: result.view });
      else if (result.kind === "error") setMode({ kind: "message", text: result.message, tone: "error" });
      else if (result.kind === "notKiosk") handleNotKiosk();
      else setMode({ kind: "keypad" });
    } catch {
      setMode({ kind: "message", text: OFFLINE_MESSAGE, tone: "error" });
    }
  }

  function leaveCount() {
    void stopCounting().catch(() => {});
    setMode({ kind: "keypad" });
  }

  return (
    <div className="h-full" onPointerDown={() => setActivity((a) => a + 1)}>
      {mode.kind === "keypad" && (
        <PinPad
          key="employee"
          title="Enter your PIN"
          subtitle="to clock in or out"
          timeZone={timeZone}
          submit={async (pin) => {
            const result = await enterEmployeePin(pin);
            if (result.kind === "employee") setMode({ kind: "employee", pin, view: result.view, loadedAt: Date.now() });
            if (result.kind === "notKiosk") handleNotKiosk();
            return result.kind === "employee" ? { kind: "ok" } : result;
          }}
          footer={
            <Button variant="quiet" onClick={() => setMode({ kind: "managerPad" })}>
              <Lock className="size-4" /> Manager
            </Button>
          }
        />
      )}
      {mode.kind === "managerPad" && (
        <PinPad
          key="manager"
          title="Manager"
          subtitle="Enter the manager PIN"
          timeZone={timeZone}
          submit={async (pin) => {
            const result = await unlockManager(pin);
            if (result.kind === "manager") {
              router.push("/manage");
              return { kind: "ok" };
            }
            if (result.kind === "notKiosk") handleNotKiosk();
            return result.kind === "employee" ? { kind: "ok" } : result;
          }}
          footer={
            <Button variant="quiet" onClick={() => setMode({ kind: "keypad" })}>
              Cancel
            </Button>
          }
        />
      )}
      {mode.kind === "employee" && (
        <EmployeeScreen
          view={mode.view}
          loadedAt={mode.loadedAt}
          autoReturnSeconds={autoReturnSeconds}
          onPunch={async (kind) => {
            try {
              const result = await punch({ pin: mode.pin, kind, requestId: crypto.randomUUID() });
              if (result.kind === "done") setMode({ kind: "message", text: result.message, tone: "ok" });
              else if (result.kind === "error") setMode({ kind: "message", text: result.message, tone: "error" });
              else if (result.kind === "notKiosk") handleNotKiosk();
              else setMode({ kind: "keypad" });
            } catch {
              setMode({ kind: "message", text: OFFLINE_MESSAGE, tone: "error" });
            }
          }}
          onCount={() => beginCount(mode.pin)}
          onDone={() => setMode({ kind: "keypad" })}
        />
      )}
      {mode.kind === "counting" && (
        <CountScreen
          view={mode.view}
          onLeave={leaveCount}
          onFinished={(text) => setMode({ kind: "message", text, tone: "ok" })}
          onExpired={() => setMode({ kind: "message", text: COUNT_EXPIRED_MESSAGE, tone: "error" })}
        />
      )}
      {mode.kind === "message" && (
        <div className="flex h-full flex-col items-center justify-center px-10">
          <FramedPanel className="px-10 py-8 text-center">
            {mode.tone === "error" && <WifiOff className="mx-auto mb-2 size-6 text-red-700" aria-hidden />}
            <p className={`font-serif text-3xl font-semibold ${mode.tone === "error" ? "text-red-800" : ""}`}>{mode.text}</p>
            <p className="mt-2 text-sm text-ink/70">Returning to the keypad…</p>
          </FramedPanel>
        </div>
      )}
    </div>
  );
}

function clockTime(now: number, timeZone: string) {
  if (now === 0) return "";
  return new Date(now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

function PinPad({
  title,
  subtitle,
  timeZone,
  submit,
  footer,
}: {
  title: string;
  subtitle: string;
  timeZone: string;
  submit: (pin: string) => Promise<PadResult>;
  footer: ReactNode;
}) {
  const now = useNow();
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const lockedFor = now === 0 ? 0 : Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = lockedFor > 0;

  async function press(key: string) {
    if (locked || busy) return;
    setError(null);
    if (key === "del") {
      setDigits(digits.slice(0, -1));
      return;
    }
    const next = digits + key;
    if (next.length < 4) {
      setDigits(next);
      return;
    }
    setDigits(next);
    setBusy(true);
    try {
      const result = await submit(next);
      if (result.kind === "wrong") setError("That PIN didn’t match. Try again.");
      if (result.kind === "locked") {
        setLockedUntil(secondsFromNow(result.secondsLeft));
        setError("Too many tries. Keypad locked.");
      }
    } catch {
      setError(OFFLINE_MESSAGE);
    } finally {
      setDigits("");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-between px-10 py-10">
      <div className="text-center">
        <Wordmark size="lg" />
        <p className="mt-3 h-7 font-mono text-lg text-ink/60">{clockTime(now, timeZone)}</p>
      </div>

      <div className="flex flex-col items-center">
        <p className="font-serif text-3xl font-semibold">{title}</p>
        <p className="text-sm text-ink/60">{subtitle}</p>
        <div className="my-6 flex gap-4" aria-label={`${digits.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`size-4 rounded-full border-2 border-porcelain ${i < digits.length ? "bg-porcelain" : ""} ${busy ? "animate-pulse" : ""}`}
            />
          ))}
        </div>
        <p role="alert" className="mb-4 min-h-5 max-w-xs text-center text-sm font-medium text-red-700">
          {locked ? `Keypad locked. Try again in ${lockedFor}s.` : error}
        </p>
        <div className="grid grid-cols-3 gap-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((key) =>
            key === "" ? (
              <span key="blank" />
            ) : (
              <button
                key={key}
                type="button"
                disabled={locked || busy}
                onClick={() => press(key)}
                aria-label={key === "del" ? "Delete" : key}
                className={`flex size-20 items-center justify-center rounded-full text-3xl font-medium transition-colors disabled:opacity-30 ${
                  key === "del" ? "text-ink/60 hover:bg-ink/5" : "bg-white shadow-sm ring-1 ring-ink/10 hover:bg-porcelain-light active:bg-porcelain-light"
                }`}
              >
                {key === "del" ? <Delete className="size-7" /> : key}
              </button>
            ),
          )}
        </div>
      </div>

      {footer}
    </div>
  );
}

function EmployeeScreen({
  view,
  loadedAt,
  autoReturnSeconds,
  onPunch,
  onCount,
  onDone,
}: {
  view: KioskEmployeeView;
  loadedAt: number;
  autoReturnSeconds: number;
  onPunch: (kind: PunchKind) => Promise<void>;
  onCount: () => Promise<void>;
  onDone: () => void;
}) {
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const elapsed = now === 0 ? 0 : Math.max(0, now - loadedAt);
  const worked = view.status === "in" ? view.workedMs + elapsed : view.workedMs;

  async function act(kind: PunchKind) {
    if (busy) return;
    setBusy(true);
    await onPunch(kind);
  }

  const button = (kind: PunchKind, label: string, icon: ReactNode, variant: "primary" | "secondary", className = "") => (
    <Button key={kind} variant={variant} disabled={busy} className={`py-5 text-lg ${className}`} onClick={() => act(kind)}>
      {icon} {label}
    </Button>
  );

  return (
    <div className="flex h-full flex-col px-10 py-10">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-serif text-4xl font-semibold">Hi, {view.displayName}</p>
          <p className="mt-1 text-ink/60">{view.today ? `Today: ${view.today}` : "You’re not on the schedule today."}</p>
        </div>
        <Button variant="quiet" onClick={onDone}>
          Not you?
        </Button>
      </div>

      <FramedPanel className="mt-8 px-8 py-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wider text-ink/60">Status</span>
          {view.status === "in" && <Badge tone="porcelain">Clocked in since {view.clockedInAt}</Badge>}
          {view.status === "break" && <Badge tone="gilt">On break</Badge>}
          {view.status === "out" && <Badge>Clocked out</Badge>}
        </div>
        <p className="mt-3 text-center font-mono text-5xl font-semibold tabular-nums">{formatTimer(worked)}</p>
        <div className="mt-6">
          {view.status === "out" && button("clockIn", "Clock In", <LogIn className="size-6" />, "primary", "w-full text-xl")}
          {view.status === "in" && (
            <div className="grid grid-cols-2 gap-3">
              {button("breakStart", "Start Break", <Coffee className="size-5" />, "secondary")}
              {button("clockOut", "Clock Out", <LogOut className="size-5" />, "primary")}
            </div>
          )}
          {view.status === "break" && (
            <div className="grid grid-cols-2 gap-3">
              {button("breakEnd", "End Break", <Coffee className="size-5" />, "primary")}
              {button("clockOut", "Clock Out", <LogOut className="size-5" />, "secondary")}
            </div>
          )}
        </div>
      </FramedPanel>

      {view.inventory.canCount && (
        <Button
          variant={view.inventory.countDue ? "primary" : "secondary"}
          disabled={busy}
          className="mt-4 py-4 text-lg"
          onClick={async () => {
            setBusy(true);
            await onCount();
          }}
        >
          <ClipboardList className="size-5" />
          {view.inventory.inProgress ? "Continue inventory count" : "Count inventory"}
          {view.inventory.countDue && <Badge tone="gilt">Count due</Badge>}
        </Button>
      )}

      <p className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-ink/50">Your next 7 days</p>
      <Card className="divide-y divide-ink/5 p-0">
        {view.upcoming.length === 0 && <p className="px-4 py-3 text-sm text-ink/50">No published shifts.</p>}
        {view.upcoming.map((s) => (
          <div key={s.id} className="flex justify-between px-4 py-3 text-sm">
            <span className="font-medium">{s.day}</span>
            <span className="text-ink/70">
              {s.time}
              {s.position && ` · ${s.position}`}
            </span>
          </div>
        ))}
      </Card>
      <p className="mt-auto text-center text-xs text-ink/40">Returns to the keypad after {autoReturnSeconds} seconds</p>
    </div>
  );
}
