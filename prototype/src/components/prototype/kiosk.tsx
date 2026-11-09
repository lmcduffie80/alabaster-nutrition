import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Coffee,
  Delete,
  FileSpreadsheet,
  Inbox,
  Lock,
  LogIn,
  LogOut,
  ScanFace,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { TODAY, employeeName, formatMinutes, formatShiftDay, formatShiftTime, formatTimer } from "./data";
import { ManagerRequests, ManagerSchedule, ManagerSettings, ManagerTimesheets, ManagerToday } from "./manager-screens";
import { workedMs, type AppModel, type ClockAction } from "./model";
import { Badge, Button, Card, FramedPanel, Wordmark } from "./ui";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;
const EMPLOYEE_IDLE_MS = 10_000;
const CONFIRM_MS = 3_000;
const MANAGER_IDLE_MS = 120_000;

type KioskMode =
  | { kind: "keypad" }
  | { kind: "employee"; employeeId: string }
  | { kind: "confirm"; message: string }
  | { kind: "managerUnlock" }
  | { kind: "manager" };

function lockoutEndsAt() {
  return Date.now() + LOCKOUT_MS;
}

function clockTime(now: number) {
  if (now === 0) return "";
  return new Date(now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

export function Kiosk({ app }: { app: AppModel }) {
  const [mode, setMode] = useState<KioskMode>({ kind: "keypad" });
  const [activity, setActivity] = useState(0);
  const touch = () => setActivity((a) => a + 1);

  useEffect(() => {
    const delay =
      mode.kind === "employee" ? EMPLOYEE_IDLE_MS : mode.kind === "confirm" ? CONFIRM_MS : mode.kind === "manager" ? MANAGER_IDLE_MS : null;
    if (delay === null) return;
    const id = setTimeout(() => setMode({ kind: "keypad" }), delay);
    return () => clearTimeout(id);
  }, [mode, activity]);

  return (
    <div className="h-full" onPointerDown={touch}>
      {mode.kind === "keypad" && (
        <PinScreen
          key="employee-pin"
          app={app}
          title="Enter your PIN"
          subtitle="to clock in or out"
          check={(pin) => app.employeeForPin(pin)}
          onSuccess={(employeeId) => setMode({ kind: "employee", employeeId })}
          footer={
            <Button variant="quiet" onClick={() => setMode({ kind: "managerUnlock" })}>
              <Lock className="size-4" /> Manager
            </Button>
          }
        />
      )}
      {mode.kind === "managerUnlock" && (
        <PinScreen
          key="manager-pin"
          app={app}
          title="Manager"
          subtitle="Enter the manager PIN"
          check={(pin) => (pin === app.managerPin ? "manager" : null)}
          onSuccess={() => setMode({ kind: "manager" })}
          footer={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setMode({ kind: "manager" })}>
                <ScanFace className="size-4" /> Use Face ID
              </Button>
              <Button variant="quiet" onClick={() => setMode({ kind: "keypad" })}>
                Cancel
              </Button>
            </div>
          }
        />
      )}
      {mode.kind === "employee" && (
        <EmployeeClockScreen
          app={app}
          employeeId={mode.employeeId}
          onDone={(message) => setMode(message ? { kind: "confirm", message } : { kind: "keypad" })}
        />
      )}
      {mode.kind === "confirm" && (
        <div className="flex h-full flex-col items-center justify-center px-10">
          <FramedPanel className="px-10 py-8 text-center">
            <p className="font-serif text-3xl font-semibold">{mode.message}</p>
            <p className="mt-2 text-sm text-ink/70">Returning to the keypad…</p>
          </FramedPanel>
        </div>
      )}
      {mode.kind === "manager" && <ManagerArea app={app} onLock={() => setMode({ kind: "keypad" })} />}
    </div>
  );
}

function PinScreen({
  app,
  title,
  subtitle,
  check,
  onSuccess,
  footer,
}: {
  app: AppModel;
  title: string;
  subtitle: string;
  check: (pin: string) => string | null;
  onSuccess: (id: string) => void;
  footer: ReactNode;
}) {
  const [digits, setDigits] = useState("");
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lockedFor = Math.max(0, Math.ceil((lockedUntil - app.now) / 1000));
  const locked = lockedFor > 0;

  function press(key: string) {
    if (locked) return;
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
    setDigits("");
    const id = check(next);
    if (id) {
      setFailures(0);
      onSuccess(id);
      return;
    }
    const attempts = failures + 1;
    if (attempts >= MAX_ATTEMPTS) {
      setFailures(0);
      setLockedUntil(lockoutEndsAt());
      setError("Too many tries. Keypad locked.");
    } else {
      setFailures(attempts);
      setError("That PIN didn’t match. Try again.");
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-between px-10 py-10">
      <div className="text-center">
        <Wordmark size="lg" />
        <p className="mt-3 font-mono text-lg text-ink/60">{clockTime(app.now)}</p>
      </div>

      <div className="flex flex-col items-center">
        <p className="font-serif text-3xl font-semibold">{title}</p>
        <p className="text-sm text-ink/60">{subtitle}</p>
        <div className="my-6 flex gap-4">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`size-4 rounded-full border-2 border-porcelain ${i < digits.length ? "bg-porcelain" : ""}`}
            />
          ))}
        </div>
        <p className="mb-4 h-5 text-sm font-medium text-red-700">
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
                disabled={locked}
                onClick={() => press(key)}
                aria-label={key === "del" ? "Delete" : key}
                className={`flex size-20 items-center justify-center rounded-full text-3xl font-medium transition-colors disabled:opacity-30 ${
                  key === "del" ? "text-ink/60 hover:bg-ink/5" : "bg-white shadow-sm ring-1 ring-ink/10 hover:bg-porcelain-light"
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

function EmployeeClockScreen({
  app,
  employeeId,
  onDone,
}: {
  app: AppModel;
  employeeId: string;
  onDone: (message?: string) => void;
}) {
  const clock = app.clocks[employeeId];
  const name = employeeName(employeeId);
  const upcoming = app.shifts.filter((s) => s.employeeId === employeeId && s.status === "published");
  const today = upcoming.find((s) => s.day === TODAY);

  function act(action: ClockAction) {
    const time = clockTime(Date.now());
    app.clock(employeeId, action);
    const verb = {
      clockIn: "Clocked in",
      clockOut: "Clocked out",
      breakStart: "Break started",
      breakEnd: "Back from break",
    }[action];
    onDone(`${verb} at ${time}`);
  }

  return (
    <div className="flex h-full flex-col px-10 py-10">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-serif text-4xl font-semibold">Hi, {name}</p>
          <p className="mt-1 text-ink/60">
            {today ? `Today: ${formatShiftTime(today)} · ${today.position}` : "You’re not on the schedule today."}
          </p>
        </div>
        <Button variant="quiet" onClick={() => onDone()}>
          Not you?
        </Button>
      </div>

      <FramedPanel className="mt-8 px-8 py-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wider text-ink/60">Status</span>
          {clock.status === "in" && <Badge tone="porcelain">Clocked in</Badge>}
          {clock.status === "break" && <Badge tone="gilt">On break</Badge>}
          {clock.status === "out" && <Badge>Clocked out</Badge>}
        </div>
        <p className="mt-3 text-center font-mono text-5xl font-semibold tabular-nums">
          {formatTimer(workedMs(clock, app.now))}
        </p>
        {clock.status === "out" && clock.lastShiftMs !== null && (
          <p className="mt-1 text-center text-sm text-ink/60">
            Last shift: {formatMinutes(Math.round(clock.lastShiftMs / 60000))}
          </p>
        )}

        <div className="mt-6">
          {clock.status === "out" && (
            <Button className="w-full py-5 text-xl" onClick={() => act("clockIn")}>
              <LogIn className="size-6" /> Clock In
            </Button>
          )}
          {clock.status === "in" && (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" className="py-5 text-lg" onClick={() => act("breakStart")}>
                <Coffee className="size-5" /> Start Break
              </Button>
              <Button className="py-5 text-lg" onClick={() => act("clockOut")}>
                <LogOut className="size-5" /> Clock Out
              </Button>
            </div>
          )}
          {clock.status === "break" && (
            <Button className="w-full py-5 text-xl" onClick={() => act("breakEnd")}>
              <Coffee className="size-6" /> End Break
            </Button>
          )}
        </div>
      </FramedPanel>

      <p className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-ink/50">Your shifts this week</p>
      <Card className="divide-y divide-ink/5 p-0">
        {upcoming.length === 0 && <p className="px-4 py-3 text-sm text-ink/50">No published shifts this week.</p>}
        {upcoming.map((s) => (
          <div key={s.id} className="flex justify-between px-4 py-3 text-sm">
            <span className="font-medium">{s.day === TODAY ? "Today" : formatShiftDay(s)}</span>
            <span className="text-ink/70">
              {formatShiftTime(s)} · {s.position}
            </span>
          </div>
        ))}
      </Card>
      <p className="mt-auto text-center text-xs text-ink/40">Returns to the keypad after 10 seconds</p>
    </div>
  );
}

const managerTabs: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "today", label: "Today", icon: Sun },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "timesheets", label: "Timesheets", icon: FileSpreadsheet },
  { id: "requests", label: "Requests", icon: Inbox },
  { id: "settings", label: "Settings", icon: Settings },
];

function ManagerArea({ app, onLock }: { app: AppModel; onLock: () => void }) {
  const [tab, setTab] = useState("today");
  const pending = app.requests.filter((r) => r.status === "pending").length;

  return (
    <div className="flex h-full">
      <nav className="flex w-40 shrink-0 flex-col gap-1 border-r border-ink/10 bg-white/70 p-3 pt-8">
        <div className="mb-4">
          <Wordmark />
        </div>
        {managerTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium ${
                tab === t.id ? "bg-porcelain-light text-porcelain" : "text-ink/70 hover:bg-ink/5"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
              {t.id === "requests" && pending > 0 && (
                <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[10px] text-white">{pending}</span>
              )}
            </button>
          );
        })}
        <Button variant="secondary" className="mt-auto" onClick={onLock}>
          <Lock className="size-4" /> Lock
        </Button>
      </nav>
      <div className="flex-1 overflow-y-auto px-5 py-8">
        <h2 className="mb-4 font-serif text-3xl font-semibold">{managerTabs.find((t) => t.id === tab)?.label}</h2>
        {tab === "today" && <ManagerToday app={app} onOpenRequests={() => setTab("requests")} />}
        {tab === "schedule" && <ManagerSchedule app={app} />}
        {tab === "timesheets" && <ManagerTimesheets app={app} />}
        {tab === "requests" && <ManagerRequests app={app} />}
        {tab === "settings" && <ManagerSettings app={app} />}
      </div>
    </div>
  );
}
