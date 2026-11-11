import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { Badge, Card, ColorDot, employeeColor, Field, inputClass, SectionTitle } from "@/components/ui";
import { addDays, formatDay, formatRange, formatTime, isLocalDate, localDateOf, weekStartOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { weekSchedule } from "@/lib/server/schedule";
import { withManager } from "@/lib/server/session";
import { listEmployees } from "@/lib/server/team";
import { addShiftAction, deleteShiftAction, publishAction } from "../actions";
import { ActionForm, SubmitButton } from "../forms";

export default async function SchedulePage({ searchParams }: PageProps<"/manage/schedule">) {
  return withManager(async (db) => {
    const { timeZone } = await getBusiness(db);
    const requested = (await searchParams).week;
    const today = localDateOf(new Date(), timeZone);
    const weekStart = typeof requested === "string" && isLocalDate(requested) ? weekStartOf(requested) : weekStartOf(today);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    const [employees, week] = await Promise.all([listEmployees(db), weekSchedule(db, weekStart)]);
    const scheduledIds = new Set(week.shifts.map((s) => s.employeeId));
    const rows = [
      ...employees,
      ...(await listEmployees(db, { includeInactive: true })).filter((e) => !e.active && scheduledIds.has(e.id)),
    ];

    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-semibold">Schedule</h1>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <Link href={`?week=${addDays(weekStart, -7)}`} className="rounded-lg p-1 hover:bg-ink/5" aria-label="Previous week">
                <ChevronLeft className="size-4" />
              </Link>
              <span className="font-medium">Week of {formatRange({ start: weekStart, end: addDays(weekStart, 7) })}</span>
              <Link href={`?week=${addDays(weekStart, 7)}`} className="rounded-lg p-1 hover:bg-ink/5" aria-label="Next week">
                <ChevronRight className="size-4" />
              </Link>
              {weekStart !== weekStartOf(today) && (
                <Link href="?" className="text-xs text-porcelain hover:underline">
                  This week
                </Link>
              )}
            </div>
          </div>
          <ActionForm action={publishAction} className="flex items-center gap-3">
            <input type="hidden" name="weekStart" value={weekStart} />
            {week.publishedAt ? (
              <>
                <Badge tone="sage">Published · the team can see it</Badge>
                <SubmitButton variant="quiet" name="publish" value="false">
                  Unpublish
                </SubmitButton>
              </>
            ) : (
              <>
                <Badge tone="gilt">Draft · only you can see it</Badge>
                <SubmitButton name="publish" value="true">
                  Publish week
                </SubmitButton>
              </>
            )}
          </ActionForm>
        </div>
        {week.publishedAt && (
          <p className="mt-2 text-xs text-ink/60">Changes to a published week show up for the team right away.</p>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="w-32 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-ink/50">Employee</th>
                {days.map((day) => (
                  <th key={day} className={`px-2 py-2 text-left text-xs font-semibold ${day === today ? "text-porcelain" : "text-ink/60"}`}>
                    {formatDay(day)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((employee) => (
                <tr key={employee.id}>
                  <td className="border-t border-ink/10 px-2 py-2 align-top font-medium">
                    <span className="flex items-center gap-2">
                      <ColorDot color={employeeColor(employee.colorIndex)} />
                      {employee.displayName}
                    </span>
                  </td>
                  {days.map((day) => (
                    <td key={day} className="border-t border-ink/10 px-1 py-1 align-top">
                      {week.shifts
                        .filter((s) => s.employeeId === employee.id && localDateOf(s.startsAt, timeZone) === day)
                        .map((s) => (
                          <div
                            key={s.id}
                            className="mb-1 flex items-start justify-between gap-1 rounded-lg px-2 py-1 text-xs text-white"
                            style={{ backgroundColor: employeeColor(employee.colorIndex) }}
                          >
                            <span>
                              {formatTime(s.startsAt, timeZone)} – {formatTime(s.endsAt, timeZone)}
                              {s.position && <span className="block opacity-80">{s.position}</span>}
                              {s.calledInAt && <span className="block font-semibold">Called in</span>}
                            </span>
                            <ActionForm action={deleteShiftAction}>
                              <input type="hidden" name="id" value={s.id} />
                              <button type="submit" className="rounded p-0.5 hover:bg-white/20" aria-label="Delete shift">
                                <X className="size-3" />
                              </button>
                            </ActionForm>
                          </div>
                        ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SectionTitle>Add a shift</SectionTitle>
        <Card className="max-w-4xl">
          <ActionForm action={addShiftAction} className="flex flex-wrap items-end gap-3">
            <div className="min-w-40">
              <Field label="Employee">
                <select name="employeeId" required className={inputClass}>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.displayName}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="min-w-36">
              <Field label="Day">
                <select name="date" required className={inputClass} defaultValue={days.includes(today) ? today : weekStart}>
                  {days.map((day) => (
                    <option key={day} value={day}>
                      {formatDay(day)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="w-32">
              <Field label="Start">
                <input name="start" type="time" required defaultValue="07:00" step={900} className={inputClass} />
              </Field>
            </div>
            <div className="w-32">
              <Field label="End">
                <input name="end" type="time" required defaultValue="13:00" step={900} className={inputClass} />
              </Field>
            </div>
            <div className="min-w-32 flex-1">
              <Field label="Position (optional)">
                <input name="position" maxLength={40} placeholder="Opener" className={inputClass} />
              </Field>
            </div>
            <SubmitButton>Add shift</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    );
  });
}
