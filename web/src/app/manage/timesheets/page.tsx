import { AlertTriangle, ChevronLeft, ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import { Badge, Card, ColorDot, employeeColor, Field, inputClass, SectionTitle } from "@/components/ui";
import { getDb } from "@/db";
import { punchKinds, punchLabel, type EffectivePunch } from "@/lib/domain/punches";
import { formatDay, formatMinutes, formatRange, formatTime, localDateOf, minutesAfterMidnight } from "@/lib/domain/time";
import { punchHistory } from "@/lib/server/punches";
import { requireManager } from "@/lib/server/session";
import { periodTimesheets } from "@/lib/server/timesheets";
import { addPunchAction, approveAction, editPunchAction, removePunchAction } from "../actions";
import { ActionForm, SubmitButton } from "../forms";

function hhmm(at: Date, timeZone: string) {
  const minutes = minutesAfterMidnight(at, timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export default async function TimesheetsPage({ searchParams }: PageProps<"/manage/timesheets">) {
  await requireManager();
  const db = await getDb();
  const requested = (await searchParams).period;
  const now = new Date();
  const sheet = await periodTimesheets(db, now, typeof requested === "string" ? requested : undefined);
  const { period, timeZone } = sheet;
  const history = await punchHistory(db, sheet.rows.flatMap((r) => r.punches.map((p) => p.id)));
  const historyFor = (id: string) => history.filter((h) => h.punchId === id);
  const totalMs = sheet.rows.reduce((sum, r) => sum + r.row.workedMs, 0);

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Timesheets</h1>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <Link href={`?period=${sheet.previousStart}`} className="rounded-lg p-1 hover:bg-ink/5" aria-label="Previous pay period">
              <ChevronLeft className="size-4" />
            </Link>
            <span className="font-medium">{formatRange(period)}</span>
            <Link href={`?period=${sheet.nextStart}`} className="rounded-lg p-1 hover:bg-ink/5" aria-label="Next pay period">
              <ChevronRight className="size-4" />
            </Link>
            {sheet.isCurrent ? <Badge tone="porcelain">Current period</Badge> : <Link href="?" className="text-xs text-porcelain hover:underline">Current period</Link>}
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`/manage/timesheets/export?period=${period.start}&type=totals`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-porcelain px-3 py-2 text-sm font-semibold text-white hover:bg-porcelain-dark"
          >
            <Download className="size-4" /> Hours by employee (CSV)
          </a>
          <a
            href={`/manage/timesheets/export?period=${period.start}&type=detail`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-porcelain/30 bg-white px-3 py-2 text-sm font-semibold text-porcelain hover:bg-porcelain-light"
          >
            <Download className="size-4" /> Every shift (CSV)
          </a>
        </div>
      </div>
      {sheet.isCurrent && (
        <p className="mt-2 text-xs text-ink/60">This period is still open. Shifts still in progress aren&rsquo;t counted until they clock out.</p>
      )}

      <Card className="mt-5 divide-y divide-ink/5 p-0">
        {sheet.rows.map(({ employee, row, approval }) => (
          <div key={employee.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <a href={`#e-${employee.id}`} className="flex items-center gap-2 font-medium hover:underline">
              <ColorDot color={employeeColor(employee.colorIndex)} />
              {employee.displayName}
              {!employee.active && <Badge>Former</Badge>}
              {row.needsAttention && (
                <Badge tone="red">
                  <AlertTriangle className="size-3" /> Needs a fix
                </Badge>
              )}
            </a>
            <span className="flex items-center gap-3">
              <span className="font-mono tabular-nums">{formatMinutes(row.workedMs / 60_000)}</span>
              <ActionForm action={approveAction}>
                <input type="hidden" name="employeeId" value={employee.id} />
                <input type="hidden" name="periodStart" value={period.start} />
                {approval ? (
                  <SubmitButton variant="quiet" name="approve" value="false">
                    <Badge tone="sage">Approved</Badge> Undo
                  </SubmitButton>
                ) : (
                  <SubmitButton variant="secondary" name="approve" value="true">
                    Approve
                  </SubmitButton>
                )}
              </ActionForm>
            </span>
          </div>
        ))}
        <div className="flex justify-between bg-ink/[0.02] px-4 py-3 text-sm font-semibold">
          <span>Total</span>
          <span className="font-mono tabular-nums">{formatMinutes(totalMs / 60_000)}</span>
        </div>
      </Card>
      <p className="mt-2 text-xs text-ink/50">Changing a punch un-approves that person&rsquo;s timesheet so it gets checked again.</p>

      {sheet.rows.map(({ employee, row, punches }) => (
        <section key={employee.id} id={`e-${employee.id}`} className="scroll-mt-4">
          <SectionTitle>
            {employee.displayName} · {formatMinutes(row.workedMs / 60_000)}
          </SectionTitle>
          <Card className="space-y-3">
            {row.shifts.length === 0 && row.orphans.length === 0 && <p className="text-sm text-ink/50">No hours this period.</p>}
            {row.shifts.map((s) => (
              <div key={s.clockIn.id} className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-medium">{formatDay(s.date)}</span>
                <span className="flex items-center gap-2 text-ink/70">
                  {formatTime(s.clockIn.at, timeZone)} – {s.clockOut ? formatTime(s.clockOut.at, timeZone) : "still clocked in"}
                  {s.breakMs > 0 && ` · ${Math.round(s.breakMs / 60_000)} min break`}
                  {s.clockOut && <span className="font-mono">{formatMinutes(s.workedMs / 60_000)}</span>}
                  {s.adjusted && <Badge tone="gilt">Fixed</Badge>}
                  {s.missingClockOut && <Badge tone="red">Missing clock-out</Badge>}
                </span>
              </div>
            ))}
            {row.orphans.length > 0 && (
              <p className="text-sm text-red-700">
                {row.orphans.length} punch{row.orphans.length === 1 ? " doesn't" : "es don't"} fit the clock-in/out order and
                {row.orphans.length === 1 ? " isn't" : " aren't"} counted. Fix or remove {row.orphans.length === 1 ? "it" : "them"} below.
              </p>
            )}

            <details className="rounded-xl border border-ink/10">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-porcelain">Fix punches</summary>
              <div className="divide-y divide-ink/5">
                {punches.map((punch) => (
                  <PunchEditor
                    key={punch.id}
                    punch={punch}
                    timeZone={timeZone}
                    orphan={row.orphans.some((o) => o.id === punch.id)}
                    history={historyFor(punch.id).map((h) => {
                      const was = h.previousAt ? formatTime(h.previousAt, timeZone) : null;
                      const verb = h.action === "add" ? "Added" : h.action === "remove" ? `Removed (was ${was})` : `Changed from ${was}`;
                      return `${verb} by ${h.changedBy}: “${h.reason}”`;
                    })}
                  />
                ))}
                <div className="px-3 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">Add a missing punch</p>
                  <ActionForm action={addPunchAction} resetOnSuccess className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <Field label="Type">
                      <select name="kind" className={inputClass}>
                        {punchKinds.map((k) => (
                          <option key={k} value={k}>
                            {punchLabel[k]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Date">
                      <input name="date" type="date" required min={period.start} defaultValue={localDateOf(now, timeZone) < period.end ? localDateOf(now, timeZone) : period.start} className={inputClass} />
                    </Field>
                    <Field label="Time">
                      <input name="time" type="time" required className={inputClass} />
                    </Field>
                    <div className="min-w-48 flex-1">
                      <Field label="Reason">
                        <input name="reason" required minLength={3} maxLength={300} placeholder="Forgot to clock out" className={inputClass} />
                      </Field>
                    </div>
                    <SubmitButton variant="secondary">Add</SubmitButton>
                  </ActionForm>
                </div>
              </div>
            </details>
          </Card>
        </section>
      ))}
    </div>
  );
}

function PunchEditor({ punch, timeZone, orphan, history }: { punch: EffectivePunch; timeZone: string; orphan: boolean; history: string[] }) {
  return (
    <div className="px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 font-medium">{punchLabel[punch.kind]}</span>
        <span className="text-ink/70">
          {formatDay(localDateOf(punch.at, timeZone))} {formatTime(punch.at, timeZone)}
        </span>
        {orphan && <Badge tone="red">Out of order</Badge>}
      </div>
      {history.map((line) => (
        <p key={line} className="mt-1 text-xs text-ink/50">
          {line}
        </p>
      ))}
      <div className="mt-2 flex flex-wrap gap-4">
        <ActionForm action={editPunchAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="punchId" value={punch.id} />
          <input name="date" type="date" required defaultValue={localDateOf(punch.at, timeZone)} className={`${inputClass} w-auto`} aria-label="Date" />
          <input name="time" type="time" required defaultValue={hhmm(punch.at, timeZone)} className={`${inputClass} w-auto`} aria-label="Time" />
          <input name="reason" required minLength={3} maxLength={300} placeholder="Reason" className={`${inputClass} w-48`} aria-label="Reason for change" />
          <SubmitButton variant="secondary">Change time</SubmitButton>
        </ActionForm>
        <ActionForm action={removePunchAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="punchId" value={punch.id} />
          <input name="reason" required minLength={3} maxLength={300} placeholder="Reason" className={`${inputClass} w-40`} aria-label="Reason for removing" />
          <SubmitButton variant="danger">Remove</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
