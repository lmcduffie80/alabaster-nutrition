import { Check, Download, FileText, KeyRound, Plus, TriangleAlert, UserPlus, X } from "lucide-react";
import {
  TODAY,
  days,
  employeeColor,
  employeeName,
  employees,
  formatHour,
  formatMinutes,
  formatShiftTime,
  lastPeriod,
  timesheets,
} from "./data";
import type { AppModel } from "./model";
import { Badge, Button, Card, ColorDot, SectionTitle } from "./ui";

export function ManagerToday({ app, onOpenRequests }: { app: AppModel; onOpenRequests: () => void }) {
  const todayShifts = app.shifts.filter((s) => s.day === TODAY && s.status === "published");
  const pending = app.requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle>On the schedule today</SectionTitle>
        <Card className="divide-y divide-ink/5 p-0">
          {todayShifts.map((s) => {
            const clock = s.employeeId ? app.clocks[s.employeeId] : undefined;
            return (
              <div key={s.id} className="flex items-center gap-2 px-4 py-3 text-sm">
                <ColorDot color={employeeColor(s.employeeId)} />
                <div>
                  <p className="font-medium">{employeeName(s.employeeId)}</p>
                  <p className="text-xs text-ink/60">{formatShiftTime(s)}</p>
                </div>
                <span className="ml-auto">
                  {clock?.status === "in" && <Badge tone="porcelain">Clocked in</Badge>}
                  {clock?.status === "break" && <Badge tone="gilt">On break</Badge>}
                  {(!clock || clock.status === "out") && <Badge>Starts {formatHour(s.start)}</Badge>}
                </span>
              </div>
            );
          })}
        </Card>
      </div>

      <div>
        <SectionTitle>Needs attention</SectionTitle>
        <div className="space-y-2">
          <Card className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-gilt" />
            <div className="text-sm">
              <p className="font-semibold">Missing clock-out</p>
              <p className="text-ink/70">Maya clocked in Sat 8:01 AM and never clocked out.</p>
            </div>
          </Card>
          {pending > 0 && (
            <button type="button" onClick={onOpenRequests} className="block w-full text-left">
              <Card className="flex items-center justify-between hover:border-porcelain/40">
                <span className="text-sm font-semibold">
                  {pending} pending {pending === 1 ? "request" : "requests"}
                </span>
                <span className="text-sm text-porcelain">Review →</span>
              </Card>
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

export function ManagerSchedule({ app }: { app: AppModel }) {
  const drafts = app.shifts.filter((s) => s.status === "draft").length;
  const approvedTimeOff = app.requests.filter((r) => r.kind === "timeOff" && r.status === "approved" && r.offDay !== undefined);
  const isOff = (employeeId: string, day: number) =>
    approvedTimeOff.some((r) => r.employeeId === employeeId && r.offDay === day);
  const conflicts = approvedTimeOff.filter((r) =>
    app.shifts.some((s) => s.employeeId === r.employeeId && s.day === r.offDay),
  );
  const rows = [...employees.map((e) => e.id), null];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-serif text-xl font-semibold">Week of Nov 9</p>
          <p className="text-xs text-ink/60">
            {drafts > 0 ? `${drafts} draft ${drafts === 1 ? "shift" : "shifts"} not visible to staff` : "Everything is published"}
          </p>
        </div>
        <Button disabled={drafts === 0} onClick={app.publishDrafts}>
          Publish
        </Button>
      </div>

      {conflicts.map((r) => (
        <div key={r.id} className="mb-3 flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800">
          <TriangleAlert className="size-4 shrink-0" />
          {employeeName(r.employeeId)} has approved time off {days[r.offDay!].short} {days[r.offDay!].date} but is
          still scheduled.
        </div>
      ))}

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="min-w-[560px] border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="w-16" />
              {days.map((d) => (
                <th key={d.date} className="pb-1 text-center font-semibold text-ink/60">
                  {d.short}
                  <div className="font-normal">{d.date.replace("Nov ", "")}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((employeeId) => (
              <tr key={employeeId ?? "open"}>
                <th className="pr-1 text-left font-semibold">
                  <span className="flex items-center gap-1.5">
                    <ColorDot color={employeeColor(employeeId)} />
                    {employeeName(employeeId)}
                  </span>
                </th>
                {days.map((d, day) => {
                  const cellShifts = app.shifts.filter((s) => s.employeeId === employeeId && s.day === day);
                  const off = employeeId !== null && isOff(employeeId, day);
                  return (
                    <td key={d.date} className="h-14 w-20 align-top">
                      {cellShifts.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => s.status === "draft" && app.removeShift(s.id)}
                          title={s.status === "draft" ? "Tap to remove draft" : undefined}
                          className={`mb-1 block w-full rounded-lg px-1.5 py-1 text-left leading-tight ${
                            s.status === "draft"
                              ? "border border-dashed border-porcelain/60 bg-white text-porcelain"
                              : "text-white"
                          }`}
                          style={s.status === "draft" ? undefined : { backgroundColor: employeeColor(s.employeeId) }}
                        >
                          <span className="block font-semibold">
                            {formatHour(s.start).replace(":00", "")}–{formatHour(s.end).replace(":00", "")}
                          </span>
                          <span className="opacity-80">{s.status === "draft" ? "Draft" : s.position}</span>
                        </button>
                      ))}
                      {off && <Badge tone="red">Off</Badge>}
                      {cellShifts.length === 0 && !off && employeeId !== null && (
                        <button
                          type="button"
                          onClick={() => app.addDraftShift(employeeId, day)}
                          className="flex h-12 w-full items-center justify-center rounded-lg border border-dashed border-ink/10 text-ink/30 hover:border-porcelain/50 hover:text-porcelain"
                          aria-label={`Add shift for ${employeeName(employeeId)} on ${d.short}`}
                        >
                          <Plus className="size-4" />
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink/50">Tap + to add a draft shift. Tap a draft to remove it. Scroll sideways for Sat.</p>
    </div>
  );
}

function downloadCsv(approvals: Record<string, boolean>) {
  const header = "Employee,Pay period,Worked hours,Adjustments (min),Total hours,Status";
  const lines = timesheets.map((t) => {
    const total = t.minutes + t.adjustmentMinutes;
    return [
      employeeName(t.employeeId),
      lastPeriod.replace("–", "-"),
      (t.minutes / 60).toFixed(2),
      t.adjustmentMinutes,
      (total / 60).toFixed(2),
      approvals[t.employeeId] ? "Approved" : "Not approved",
    ].join(",");
  });
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "alabaster-timesheets-nov-2-8.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ManagerTimesheets({ app }: { app: AppModel }) {
  return (
    <div>
      <p className="font-serif text-xl font-semibold">Pay period {lastPeriod}</p>
      <div className="mb-4 mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => downloadCsv(app.approvals)}>
          <Download className="size-4" /> Export CSV
        </Button>
        <Button variant="secondary" onClick={() => app.notify("PDF export is part of the native app")}>
          <FileText className="size-4" /> Export PDF
        </Button>
      </div>

      <div className="space-y-2">
        {timesheets.map((t) => {
          const approved = app.approvals[t.employeeId];
          return (
            <Card key={t.employeeId}>
              <div className="flex items-center gap-2">
                <ColorDot color={employeeColor(t.employeeId)} />
                <span className="font-semibold">{employeeName(t.employeeId)}</span>
                <span className="ml-auto font-serif text-xl font-semibold tabular-nums">
                  {formatMinutes(t.minutes + t.adjustmentMinutes)}
                </span>
              </div>
              {t.adjustmentMinutes !== 0 && (
                <p className="mt-1 text-xs text-ink/70">
                  Adjusted {formatMinutes(t.adjustmentMinutes)} · “{t.note}”
                </p>
              )}
              {t.flag && (
                <p className="mt-1 flex items-center gap-1 text-xs text-gilt">
                  <TriangleAlert className="size-3.5" /> {t.flag}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between">
                {approved ? <Badge tone="sage">Approved</Badge> : <Badge tone="gilt">Needs approval</Badge>}
                <Button variant={approved ? "quiet" : "primary"} onClick={() => app.toggleApproval(t.employeeId)}>
                  {approved ? "Undo" : "Approve"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function ManagerRequests({ app }: { app: AppModel }) {
  const pending = app.requests.filter((r) => r.status === "pending");
  const decided = app.requests.filter((r) => r.status !== "pending");

  return (
    <div>
      <SectionTitle>Waiting on you</SectionTitle>
      {pending.length === 0 && <p className="text-sm text-ink/60">You’re all caught up.</p>}
      <div className="space-y-2">
        {pending.map((r) => (
          <Card key={r.id}>
            <div className="flex items-center gap-2">
              <ColorDot color={employeeColor(r.employeeId)} />
              <span className="font-semibold">{employeeName(r.employeeId)}</span>
              <span className="text-sm text-ink/60">· {r.title}</span>
            </div>
            <p className="mt-1 text-sm text-ink/80">{r.detail}</p>
            {r.conflict && (
              <p className="mt-2 flex gap-1.5 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                <TriangleAlert className="size-4 shrink-0" /> {r.conflict}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="danger" onClick={() => app.decideRequest(r.id, "denied")}>
                <X className="size-4" /> Deny
              </Button>
              <Button onClick={() => app.decideRequest(r.id, "approved")}>
                <Check className="size-4" /> Approve
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {decided.length > 0 && (
        <>
          <SectionTitle>Decided</SectionTitle>
          <Card className="divide-y divide-ink/5 p-0">
            {decided.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{employeeName(r.employeeId)}</span>
                <span className="truncate text-ink/60">{r.title}</span>
                <span className="ml-auto">
                  {r.status === "approved" ? <Badge tone="sage">Approved</Badge> : <Badge tone="red">Denied</Badge>}
                </span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

export function ManagerSettings({ app }: { app: AppModel }) {
  const rows: [string, string][] = [
    ["Business", "Alabaster Nutrition"],
    ["Timezone", "Eastern (Sylvester, GA)"],
    ["Pay period", "Weekly, starting Monday"],
    ["Address", "101 E Front St, Sylvester, GA"],
    ["Missing clock-out alert", "After 12 hours"],
    ["Kiosk returns to keypad", "After 10 seconds"],
    ["Manager unlock", "Face ID or manager PIN"],
  ];

  return (
    <div>
      <SectionTitle>Business</SectionTitle>
      <Card className="divide-y divide-ink/5 p-0">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-ink/60">{label}</span>
            <span className="text-right font-medium">{value}</span>
          </div>
        ))}
      </Card>

      <SectionTitle
        action={
          <Button variant="quiet" onClick={() => app.notify("Invite link copied — send it by text or email")}>
            <UserPlus className="size-4" /> Invite
          </Button>
        }
      >
        Team
      </SectionTitle>
      <Card className="divide-y divide-ink/5 p-0">
        {employees.map((e) => (
          <div key={e.id} className="flex items-center gap-2 px-4 py-3 text-sm">
            <ColorDot color={e.color} />
            <div>
              <p className="font-medium">{e.name}</p>
              <p className="text-xs text-ink/60">{e.isManager ? "Manager" : "Employee"} · PIN set</p>
            </div>
            <Button variant="quiet" className="ml-auto" onClick={() => app.resetPin(e.id)}>
              <KeyRound className="size-4" /> New PIN
            </Button>
          </div>
        ))}
      </Card>
      <p className="mt-2 text-xs text-ink/50">
        PINs are 4 digits, unique per person, and shown only when set. Simple PINs like 1234 or 0000 aren’t allowed.
      </p>
    </div>
  );
}
