import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge, Card, inputClass, SectionTitle } from "@/components/ui";
import type { AttendanceEntry } from "@/lib/domain/attendance";
import { formatDay, formatMinutes, formatRange, formatTime, localDateOf } from "@/lib/domain/time";
import { attendanceReport } from "@/lib/server/attendance";
import { withManager } from "@/lib/server/session";
import { calledInAction } from "../../actions";
import { ActionForm, SubmitButton } from "../../forms";
import { PrintButton } from "./print-button";

const cell = "px-3 py-2 text-left";
const head = `${cell} text-xs font-semibold uppercase tracking-wider text-ink/50`;

function count(n: number) {
  return n === 0 ? <span className="text-ink/30">0</span> : <strong>{n}</strong>;
}

function Result({ entry, timeZone }: { entry: AttendanceEntry; timeZone: string }) {
  switch (entry.status) {
    case "onTime":
      return <span>On time</span>;
    case "late":
      return <Badge tone="gilt">Late {entry.minutesLate} min</Badge>;
    case "calledIn":
      return (
        <span>
          <Badge tone="porcelain">Called in</Badge>
          {entry.shift.calledInNote && <span className="ml-2 text-ink/60">{entry.shift.calledInNote}</span>}
          {entry.shift.calledInAt && (
            <span className="ml-2 text-xs text-ink/40">
              marked {formatDay(localDateOf(entry.shift.calledInAt, timeZone))} {formatTime(entry.shift.calledInAt, timeZone)}
            </span>
          )}
        </span>
      );
    case "noClockIn":
      return <Badge tone="red">No clock-in</Badge>;
    case "upcoming":
      return <span className="text-ink/40">Not yet</span>;
  }
}

function CallInControl({ entry }: { entry: AttendanceEntry }) {
  if (entry.status === "calledIn") {
    return (
      <ActionForm action={calledInAction}>
        <input type="hidden" name="shiftId" value={entry.shift.id} />
        <SubmitButton variant="quiet" name="calledIn" value="false">
          Undo
        </SubmitButton>
      </ActionForm>
    );
  }
  if (entry.status !== "noClockIn" && entry.status !== "upcoming") return null;
  return (
    <ActionForm action={calledInAction} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="shiftId" value={entry.shift.id} />
      <input name="note" maxLength={200} placeholder="Note (optional)" aria-label="Call-in note" className={`${inputClass} w-40 py-1`} />
      <SubmitButton variant="secondary" name="calledIn" value="true">
        Called in
      </SubmitButton>
    </ActionForm>
  );
}

export default async function AttendanceReportPage({ searchParams }: PageProps<"/manage/timesheets/report">) {
  return withManager(async (db) => {
    const requested = (await searchParams).period;
    const now = new Date();
    const report = await attendanceReport(db, now, typeof requested === "string" ? requested : undefined);
    const { period, timeZone } = report;

    return (
      <div className="max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <Link href={`/manage/timesheets?period=${period.start}`} className="text-xs text-porcelain hover:underline">
              ← Timesheets
            </Link>
            <h1 className="font-serif text-3xl font-semibold">Attendance report</h1>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <Link href={`?period=${report.previousStart}`} className="rounded-lg p-1 hover:bg-ink/5" aria-label="Previous pay period">
                <ChevronLeft className="size-4" />
              </Link>
              <span className="font-medium">{formatRange(period)}</span>
              <Link href={`?period=${report.nextStart}`} className="rounded-lg p-1 hover:bg-ink/5" aria-label="Next pay period">
                <ChevronRight className="size-4" />
              </Link>
              {report.isCurrent ? <Badge tone="porcelain">Current period</Badge> : <Link href="?" className="text-xs text-porcelain hover:underline">Current period</Link>}
            </div>
          </div>
          <PrintButton />
        </div>
        <p className="mt-2 text-xs text-ink/60 print:hidden">
          Late means clocking in more than {report.lateGraceMinutes} minutes after the scheduled start (change this in Settings). Mark a
          shift &ldquo;Called in&rdquo; when someone calls instead of coming in.
        </p>

        <div className="hidden print:block">
          <h1 className="font-serif text-2xl font-semibold">{report.businessName} · Attendance</h1>
          <p className="text-sm text-ink/70">
            {formatRange(period)} · printed {formatDay(localDateOf(now, timeZone))} {formatTime(now, timeZone)} · late = more than{" "}
            {report.lateGraceMinutes} min after scheduled start
          </p>
        </div>

        <Card className="mt-5 overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10">
                <th className={head}>Employee</th>
                <th className={`${head} text-right`}>Hours worked</th>
                <th className={`${head} text-right`}>Scheduled</th>
                <th className={`${head} text-right`}>Late</th>
                <th className={`${head} text-right`}>Called in</th>
                <th className={`${head} text-right`}>No clock-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {report.rows.map(({ employee, workedMs, needsAttention, summary }) => (
                <tr key={employee.id}>
                  <td className={`${cell} font-medium`}>
                    {employee.displayName}
                    {needsAttention && <span className="ml-1 text-red-700" title="Has a missing clock-out or punch to fix">*</span>}
                  </td>
                  <td className={`${cell} text-right font-mono tabular-nums`}>{formatMinutes(workedMs / 60_000)}</td>
                  <td className={`${cell} text-right tabular-nums`}>{summary.scheduled}</td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {count(summary.late)}
                    {summary.late > 0 && <span className="ml-1 text-xs text-ink/50">({summary.minutesLate} min)</span>}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>{count(summary.calledIn)}</td>
                  <td className={`${cell} text-right tabular-nums`}>{count(summary.noClockIn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {report.rows.some((r) => r.needsAttention) && (
          <p className="mt-2 text-xs text-ink/60">* Has a missing clock-out or a punch to fix, so hours may be short. Fix it on Timesheets.</p>
        )}
        {report.isCurrent && (
          <p className="mt-1 text-xs text-ink/60">This period is still open. Shifts still in progress aren&rsquo;t counted until they clock out.</p>
        )}

        {report.rows
          .filter((r) => r.entries.length > 0)
          .map(({ employee, entries }) => (
            <section key={employee.id} className="break-inside-avoid">
              <SectionTitle>{employee.displayName}</SectionTitle>
              <Card className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10">
                      <th className={head}>Day</th>
                      <th className={head}>Scheduled</th>
                      <th className={head}>Clocked in</th>
                      <th className={head}>Result</th>
                      <th className={`${head} print:hidden`}>
                        <span className="sr-only">Call-in</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {entries.map((entry) => (
                      <tr key={entry.shift.id}>
                        <td className={`${cell} whitespace-nowrap`}>{formatDay(entry.date)}</td>
                        <td className={`${cell} whitespace-nowrap`}>
                          {formatTime(entry.shift.startsAt, timeZone)} – {formatTime(entry.shift.endsAt, timeZone)}
                          {entry.shift.position && <span className="block text-xs text-ink/50">{entry.shift.position}</span>}
                        </td>
                        <td className={`${cell} whitespace-nowrap`}>{entry.clockIn ? formatTime(entry.clockIn, timeZone) : "—"}</td>
                        <td className={cell}>
                          <Result entry={entry} timeZone={timeZone} />
                        </td>
                        <td className={`${cell} text-right print:hidden`}>
                          <CallInControl entry={entry} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          ))}
      </div>
    );
  });
}
