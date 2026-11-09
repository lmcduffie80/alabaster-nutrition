import { TZDate } from "@date-fns/tz";

/** A calendar date in the business time zone, written `YYYY-MM-DD`. */
export type LocalDate = string;

const DAY_MS = 86_400_000;

function parts(date: LocalDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function isLocalDate(value: string): value is LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parts(value);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

export function localDateOf(at: Date, timeZone: string): LocalDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Calendar arithmetic only; never crosses a time zone. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: LocalDate, to: LocalDate) {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: LocalDate) {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The instant a local time happens in `timeZone`. */
export function instantAt(date: LocalDate, minutesAfterMidnight: number, timeZone: string): Date {
  const { year, month, day } = parts(date);
  const hours = Math.floor(minutesAfterMidnight / 60);
  const minutes = minutesAfterMidnight % 60;
  return new Date(new TZDate(year, month - 1, day, hours, minutes, timeZone).getTime());
}

export function startOfLocalDay(date: LocalDate, timeZone: string) {
  return instantAt(date, 0, timeZone);
}

export type LocalRange = { start: LocalDate; end: LocalDate; startsAt: Date; endsAt: Date };

/** `[start, end)` as local dates, plus the instants they begin and end. */
export function localRange(start: LocalDate, lengthInDays: number, timeZone: string): LocalRange {
  const end = addDays(start, lengthInDays);
  return { start, end, startsAt: startOfLocalDay(start, timeZone), endsAt: startOfLocalDay(end, timeZone) };
}

export function payPeriodContaining(at: Date, anchor: LocalDate, lengthInDays: number, timeZone: string): LocalRange {
  const offset = daysBetween(anchor, localDateOf(at, timeZone));
  const index = Math.floor(offset / lengthInDays);
  return localRange(addDays(anchor, index * lengthInDays), lengthInDays, timeZone);
}

/** Schedule weeks run Monday through Sunday. */
export function weekStartOf(date: LocalDate): LocalDate {
  return addDays(date, -((weekday(date) + 6) % 7));
}

export function minutesAfterMidnight(at: Date, timeZone: string) {
  const [hours, minutes] = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(at)
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

export function formatTime(at: Date, timeZone: string) {
  return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

export function formatDay(date: LocalDate, style: "short" | "long" = "short") {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: style === "long" ? "long" : "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatRange(range: Pick<LocalRange, "start" | "end">) {
  const fmt = (d: LocalDate) => {
    const { year, month, day } = parts(d);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  return `${fmt(range.start)} – ${fmt(addDays(range.end, -1))}`;
}

export function formatMinutes(total: number) {
  const sign = total < 0 ? "−" : "";
  const abs = Math.abs(Math.round(total));
  return `${sign}${Math.floor(abs / 60)}h ${(abs % 60).toString().padStart(2, "0")}m`;
}

export function formatTimer(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
