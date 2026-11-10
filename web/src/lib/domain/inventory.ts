import { addDays, localDateOf, startOfLocalDay, weekday as weekdayOf } from "./time";

export const itemTypes = ["ingredient", "supply"] as const;
export type ItemType = (typeof itemTypes)[number];
export const itemTypeLabel: Record<ItemType, string> = { ingredient: "Ingredient", supply: "Supply" };

export const MAX_QUANTITY = 99_999_999.99;

/** A typed amount: blank is "not counted"; otherwise 0 or more with at most two decimals. */
export function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) throw new Error("Enter a number like 3 or 2.5.");
  const number = Number(trimmed);
  if (number > MAX_QUANTITY) throw new Error("Enter a smaller number.");
  return number;
}

/** Due from the start of the most recent count day until a count is finished on or after it. */
export function countDue(input: { now: Date; weekday: number; timeZone: string; lastFinishedAt: Date | null }) {
  const today = localDateOf(input.now, input.timeZone);
  const daysSince = (weekdayOf(today) - input.weekday + 7) % 7;
  const dueFrom = startOfLocalDay(addDays(today, -daysSince), input.timeZone);
  return input.lastFinishedAt === null || input.lastFinishedAt < dueFrom;
}

export function isLow(onHand: number | null, reorderAt: number) {
  return onHand !== null && onHand <= reorderAt;
}

/** Whole units needed to get back to `orderUpTo`. */
export function reorderAmount(onHand: number | null, orderUpTo: number) {
  return Math.max(0, Math.ceil(round2(orderUpTo - (onHand ?? 0))));
}

/** Last counted quantity plus what has been received since; `null` if never counted. */
export function onHand(lastCounted: number | null, receivedSince = 0): number | null {
  return lastCounted === null ? null : round2(lastCounted + receivedSince);
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatQuantity(value: number | null, unit?: string) {
  if (value === null) return "—";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
  return unit ? `${text} ${plural(unit, value)}` : text;
}

/** "tub" → "tubs"; units with a description ("sleeve of 50 cups") pluralize their first word. */
export function plural(unit: string, value: number) {
  if (value === 1) return unit;
  const [first, ...rest] = unit.split(" ");
  const pluralFirst = /(s|x|ch|sh)$/i.test(first) ? `${first}es` : /[^aeiou]y$/i.test(first) ? `${first.slice(0, -1)}ies` : `${first}s`;
  return [pluralFirst, ...rest].join(" ");
}
