import Link from "next/link";
import { Badge, Card, ColorDot, employeeColor, SectionTitle } from "@/components/ui";
import { getDb } from "@/db";
import { buildShifts, isMissingClockOut } from "@/lib/domain/punches";
import { addDays, formatDay, formatMinutes, formatTime, localDateOf, startOfLocalDay } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { listKiosks } from "@/lib/server/kiosk";
import { currentShiftPunches } from "@/lib/server/punches";
import { shiftsStartingBetween } from "@/lib/server/schedule";
import { requireManager } from "@/lib/server/session";
import { listEmployees } from "@/lib/server/team";

export default async function TodayPage() {
  await requireManager();
  const db = await getDb();
  const now = new Date();
  const business = await getBusiness(db, now);
  const { timeZone } = business;
  const today = localDateOf(now, timeZone);
  const employees = await listEmployees(db);
  const kiosks = await listKiosks(db);

  const statuses = await Promise.all(
    employees.map(async (employee) => {
      const open = buildShifts(await currentShiftPunches(db, employee.id), now).shifts.find((s) => s.clockOut === null);
      return { employee, open };
    }),
  );
  const working = statuses.filter((s) => s.open);
  const missing = working.filter((s) => isMissingClockOut(s.open!, now, business.missingClockOutHours));

  const todaysShifts = await shiftsStartingBetween(db, startOfLocalDay(today, timeZone), startOfLocalDay(addDays(today, 1), timeZone));
  const nameOf = new Map(employees.map((e) => [e.id, e]));

  const setup = [
    !business.managerPinDigest && { href: "/manage/settings", text: "Set a manager PIN so you can open these tools on the store iPad." },
    kiosks.length === 0 && { href: "/manage/settings", text: "Set up the store iPad as the kiosk (open this site on the iPad and go to Settings)." },
    employees.length <= 1 && { href: "/manage/team", text: "Add your employees and give each one a PIN." },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl font-semibold">Today</h1>
      <p className="text-sm text-ink/60">{formatDay(today, "long")}</p>

      {setup.length > 0 && (
        <Card className="mt-5 border-gilt/40 bg-[#fbf7ee]">
          <p className="text-sm font-semibold">Getting started</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {setup.map((item) => (
              <li key={item.text}>
                <Link href={item.href} className="text-porcelain hover:underline">
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {missing.length > 0 && (
        <Card className="mt-5 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-800">Missing clock-out</p>
          {missing.map(({ employee, open }) => (
            <p key={employee.id} className="mt-1 text-sm text-red-800">
              {employee.displayName} has been clocked in since {formatTime(open!.clockIn.at, timeZone)}{" "}
              {localDateOf(open!.clockIn.at, timeZone) !== today && formatDay(localDateOf(open!.clockIn.at, timeZone))}.{" "}
              <Link href="/manage/timesheets" className="font-semibold underline">
                Fix in Timesheets
              </Link>
            </p>
          ))}
        </Card>
      )}

      <SectionTitle>Working now</SectionTitle>
      <Card className="divide-y divide-ink/5 p-0">
        {working.length === 0 && <p className="px-4 py-3 text-sm text-ink/50">Nobody is clocked in.</p>}
        {working.map(({ employee, open }) => (
          <div key={employee.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <ColorDot color={employeeColor(employee.colorIndex)} />
              {employee.displayName}
            </span>
            <span className="flex items-center gap-3 text-ink/70">
              since {formatTime(open!.clockIn.at, timeZone)} · {formatMinutes(open!.workedMs / 60_000)}
              {open!.onBreak ? <Badge tone="gilt">On break</Badge> : <Badge tone="porcelain">In</Badge>}
            </span>
          </div>
        ))}
      </Card>

      <SectionTitle>Scheduled today</SectionTitle>
      <Card className="divide-y divide-ink/5 p-0">
        {todaysShifts.length === 0 && <p className="px-4 py-3 text-sm text-ink/50">No shifts scheduled today.</p>}
        {todaysShifts.map((s) => {
          const employee = nameOf.get(s.employeeId);
          return (
            <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <ColorDot color={employeeColor(employee?.colorIndex ?? 0)} />
                {employee?.displayName ?? "Former employee"}
              </span>
              <span className="text-ink/70">
                {formatTime(s.startsAt, timeZone)} – {formatTime(s.endsAt, timeZone)}
                {s.position && ` · ${s.position}`}
              </span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
