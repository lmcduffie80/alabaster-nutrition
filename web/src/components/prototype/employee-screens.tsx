import { useState } from "react";
import { CalendarPlus, CalendarX, Repeat, Tablet } from "lucide-react";
import {
  CURRENT_EMPLOYEE_ID,
  TODAY,
  days,
  employeeColor,
  employeeName,
  formatShiftDay,
  formatShiftTime,
  type Request,
} from "./data";
import type { AppModel } from "./model";
import { Badge, Button, Card, ColorDot, FramedPanel, SectionTitle } from "./ui";

export function EmployeeToday({ app }: { app: AppModel }) {
  const myShifts = app.shifts.filter((s) => s.employeeId === CURRENT_EMPLOYEE_ID && s.status === "published");
  const [next, ...later] = myShifts;

  return (
    <div className="space-y-4">
      <p className="font-serif text-2xl font-semibold">Good morning, Ava</p>
      {next && (
        <FramedPanel>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/60">Your next shift</p>
          <p className="mt-1 font-serif text-2xl font-semibold">
            {next.day === TODAY ? "Today" : formatShiftDay(next)}
          </p>
          <p className="text-sm text-ink/80">
            {formatShiftTime(next)} · {next.position}
          </p>
        </FramedPanel>
      )}
      <Card className="flex items-center gap-3">
        <Tablet className="size-6 shrink-0 text-porcelain" />
        <p className="text-sm text-ink/80">
          Clock in and out on the store iPad with your 4-digit PIN. Ask your manager if you’ve forgotten it.
        </p>
      </Card>
      {later.length > 0 && (
        <div>
          <SectionTitle>Later this week</SectionTitle>
          <Card className="divide-y divide-ink/5 p-0">
            {later.slice(0, 3).map((s) => (
              <div key={s.id} className="flex justify-between px-4 py-3 text-sm">
                <span className="font-medium">{formatShiftDay(s)}</span>
                <span className="text-ink/70">{formatShiftTime(s)}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

export function EmployeeSchedule({ app }: { app: AppModel }) {
  const [view, setView] = useState<"mine" | "team">("mine");
  const pendingFor = (shiftId: string, kind: Request["kind"]) =>
    app.requests.some(
      (r) => r.shiftId === shiftId && r.kind === kind && r.employeeId === CURRENT_EMPLOYEE_ID && r.status === "pending",
    );
  const visible = app.shifts.filter((s) => s.status !== "draft");
  const mine = visible.filter((s) => s.employeeId === CURRENT_EMPLOYEE_ID);
  const open = visible.filter((s) => s.status === "open");

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-ink/5 p-1 text-sm font-semibold">
        {(["mine", "team"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-lg py-1.5 ${view === v ? "bg-white text-porcelain shadow-sm" : "text-ink/60"}`}
          >
            {v === "mine" ? "My shifts" : "Full team"}
          </button>
        ))}
      </div>

      {view === "mine" ? (
        <>
          <SectionTitle>Week of Nov 9</SectionTitle>
          <div className="space-y-2">
            {mine.map((s) => (
              <Card key={s.id} className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{formatShiftDay(s)}</p>
                  <p className="text-sm text-ink/70">
                    {formatShiftTime(s)} · {s.position}
                  </p>
                </div>
                {pendingFor(s.id, "swap") ? (
                  <Badge tone="gilt">Swap offered</Badge>
                ) : (
                  <Button variant="quiet" onClick={() => app.submitRequest("swap", s)}>
                    <Repeat className="size-4" /> Offer swap
                  </Button>
                )}
              </Card>
            ))}
          </div>

          <SectionTitle>Open shifts</SectionTitle>
          {open.length === 0 ? (
            <p className="text-sm text-ink/60">No open shifts right now.</p>
          ) : (
            <div className="space-y-2">
              {open.map((s) => (
                <Card key={s.id} className="flex items-center justify-between border-dashed border-gilt/50">
                  <div>
                    <p className="font-semibold">{formatShiftDay(s)}</p>
                    <p className="text-sm text-ink/70">
                      {formatShiftTime(s)} · {s.position}
                    </p>
                  </div>
                  {pendingFor(s.id, "openShift") ? (
                    <Badge tone="gilt">Requested</Badge>
                  ) : (
                    <Button onClick={() => app.submitRequest("openShift", s)}>Pick up</Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {days.map((d, i) => {
            const dayShifts = visible.filter((s) => s.day === i);
            return (
              <div key={d.date}>
                <SectionTitle>
                  {d.short} {d.date}
                </SectionTitle>
                <Card className="divide-y divide-ink/5 p-0">
                  {dayShifts.length === 0 && <p className="px-4 py-3 text-sm text-ink/50">Nothing published yet</p>}
                  {dayShifts.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                      <ColorDot color={employeeColor(s.employeeId)} />
                      <span className={`font-medium ${s.employeeId === CURRENT_EMPLOYEE_ID ? "text-porcelain" : ""}`}>
                        {employeeName(s.employeeId)}
                      </span>
                      <span className="ml-auto text-ink/70">{formatShiftTime(s)}</span>
                    </div>
                  ))}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const statusBadge = {
  pending: <Badge tone="gilt">Pending</Badge>,
  approved: <Badge tone="sage">Approved</Badge>,
  denied: <Badge tone="red">Denied</Badge>,
};

export function EmployeeRequests({ app }: { app: AppModel }) {
  const mine = app.requests.filter((r) => r.employeeId === CURRENT_EMPLOYEE_ID);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => app.submitRequest("timeOff")}>
          <CalendarX className="size-4" /> Time off
        </Button>
        <Button variant="secondary" onClick={() => app.submitRequest("availability")}>
          <CalendarPlus className="size-4" /> Availability
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink/50">
        To swap a shift, use “Offer swap” on the Schedule tab.
      </p>

      <SectionTitle>My requests</SectionTitle>
      <div className="space-y-2">
        {mine.map((r) => (
          <Card key={r.id} className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{r.title}</p>
              <p className="text-sm text-ink/70">{r.detail}</p>
            </div>
            {statusBadge[r.status]}
          </Card>
        ))}
      </div>
    </div>
  );
}
