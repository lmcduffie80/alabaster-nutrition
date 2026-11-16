import { UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { Card, ColorDot, employeeColor, FramedPanel, SectionTitle, Wordmark } from "@/components/ui";
import { addDays, formatDay, formatTime, localDateOf, startOfLocalDay, weekStartOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { publishedShifts } from "@/lib/server/schedule";
import { withMember } from "@/lib/server/session";
import { listEmployees, viewablePins } from "@/lib/server/team";
import { setNotifyEmailAction } from "./actions";
import { MyPin } from "./my-pin";
import { PhoneNotifications } from "./phone-notifications";

export const metadata: Metadata = { title: "My Schedule · Metzey" };

export default async function EmployeeSchedulePage() {
  const { viewer, timeZone, today, weekStart, shifts, team, myPin } = await withMember(async (db, viewer) => {
    const { timeZone } = await getBusiness(db);
    const today = localDateOf(new Date(), timeZone);
    const weekStart = weekStartOf(today);
    const end = addDays(weekStart, 14);
    const shifts = await publishedShifts(db, { from: startOfLocalDay(today, timeZone), to: startOfLocalDay(end, timeZone) });
    const team = new Map((await listEmployees(db, { includeInactive: true })).map((e) => [e.id, e]));
    const myPin = (await viewablePins(db, [viewer.employeeId])).get(viewer.employeeId) ?? null;
    return { viewer, timeZone, today, weekStart, shifts, team, myPin };
  });
  const mine = shifts.filter((s) => s.employeeId === viewer.employeeId);
  const emailsOn = team.get(viewer.employeeId)?.notifyEmail ?? true;
  const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i)).filter((d) => d >= today);
  const time = (s: (typeof shifts)[number]) => `${formatTime(s.startsAt, timeZone)} – ${formatTime(s.endsAt, timeZone)}`;

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <LiveRefresh />
      <header className="flex items-center justify-between">
        <Wordmark business={viewer.businessName} />
        <UserButton />
      </header>

      <FramedPanel className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/60">Your next shift</p>
        {mine[0] ? (
          <p className="mt-1 font-serif text-2xl font-semibold">
            {localDateOf(mine[0].startsAt, timeZone) === today ? "Today" : formatDay(localDateOf(mine[0].startsAt, timeZone), "long")}
            <span className="block text-lg">
              {time(mine[0])}
              {mine[0].position && ` · ${mine[0].position}`}
            </span>
          </p>
        ) : (
          <p className="mt-1 font-serif text-xl font-semibold">No shifts published yet.</p>
        )}
      </FramedPanel>

      <MyPin hasPin={team.get(viewer.employeeId)?.hasPin ?? false} current={myPin} />

      <SectionTitle>Your shifts</SectionTitle>
      <Card className="divide-y divide-ink/5 p-0">
        {mine.length === 0 && <p className="px-4 py-3 text-sm text-ink/50">Nothing scheduled in the next two weeks.</p>}
        {mine.map((s) => (
          <div key={s.id} className="flex justify-between px-4 py-3 text-sm">
            <span className="font-medium">{formatDay(localDateOf(s.startsAt, timeZone))}</span>
            <span className="text-ink/70">
              {time(s)}
              {s.position && ` · ${s.position}`}
            </span>
          </div>
        ))}
      </Card>

      <SectionTitle>Who&rsquo;s working</SectionTitle>
      <div className="space-y-3">
        {days.map((day) => {
          const onDay = shifts.filter((s) => localDateOf(s.startsAt, timeZone) === day);
          if (onDay.length === 0) return null;
          return (
            <Card key={day} className="p-0">
              <p className="border-b border-ink/5 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink/50">
                {day === today ? "Today" : formatDay(day, "long")}
              </p>
              {onDay.map((s) => {
                const person = team.get(s.employeeId);
                return (
                  <div key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <ColorDot color={employeeColor(person?.colorIndex ?? 0)} />
                      {person?.displayName ?? "Team member"}
                    </span>
                    <span className="text-ink/70">{time(s)}</span>
                  </div>
                );
              })}
            </Card>
          );
        })}
      </div>
      <form action={setNotifyEmailAction} className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm">
        <input type="hidden" name="on" value={emailsOn ? "false" : "true"} />
        <span>
          <span className="font-medium">Email me schedule changes</span>
          <span className="block text-xs text-ink/50">{emailsOn ? "On" : "Off"} · when a week is published or your shifts change</span>
        </span>
        <button type="submit" className="text-sm font-semibold text-porcelain hover:underline">
          Turn {emailsOn ? "off" : "on"}
        </button>
      </form>
      <PhoneNotifications />
      <p className="mt-6 text-center text-xs text-ink/50">Clock in and out on the store iPad.</p>
      <p className="mt-2 text-center text-xs text-ink/50">
        <Link href="/account" className="hover:underline">
          Delete my account
        </Link>
        {" · "}
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
      </p>
    </main>
  );
}
