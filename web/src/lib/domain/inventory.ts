import { addDays, localDateOf, startOfLocalDay, weekday as weekdayOf, type LocalDate } from "./time";

export const itemTypes = ["ingredient", "supply"] as const;
export type ItemType = (typeof itemTypes)[number];
export const itemTypeLabel: Record<ItemType, string> = { ingredient: "Ingredient", supply: "Supply" };
export const itemTypePlural: Record<ItemType, string> = { ingredient: "Ingredients", supply: "Supplies" };

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

/** Never low without a reorder level. */
export function isLow(onHand: number | null, reorderAt: number | null) {
  return onHand !== null && reorderAt !== null && onHand <= reorderAt;
}

/** Whole units needed to get back to `orderUpTo`. */
export function reorderAmount(onHand: number | null, orderUpTo: number | null) {
  if (orderUpTo === null) return 0;
  return Math.max(0, Math.ceil(round2(orderUpTo - (onHand ?? 0))));
}

/**
 * Where on-hand stock is measured from: the last count, or the starting stock when it is newer (an item
 * set up from a receipt and not counted since). Also says which deliveries came after it.
 */
export function stockBase(
  lastCount: { quantity: number; countedOn: LocalDate } | null,
  starting: StartingStock | null,
): { quantity: number; adds: (line: Pick<ReceivedLine, "receivedOn" | "onShelfForCount">) => boolean } | null {
  if (lastCount && (!starting || lastCount.countedOn >= starting.on)) {
    return { quantity: lastCount.quantity, adds: (l) => deliveryCounts(l.receivedOn, l.onShelfForCount, lastCount.countedOn) };
  }
  if (starting) return { quantity: starting.quantity, adds: (l) => l.receivedOn > starting.on };
  return null;
}

/** Last counted quantity plus what has been received since; `null` if never counted. */
export function onHand(lastCounted: number | null, receivedSince = 0): number | null {
  return lastCounted === null ? null : round2(lastCounted + receivedSince);
}

/**
 * Whether a delivery adds to an item counted on `countedOn` (business-local dates). A delivery received the
 * same day is added unless it was already on the shelf when the count was done.
 */
export function deliveryCounts(receivedOn: LocalDate, onShelfForCount: boolean, countedOn: LocalDate) {
  return receivedOn > countedOn || (receivedOn === countedOn && !onShelfForCount);
}

/** Price of one count unit, or `null` when the line has no price. */
export function unitCost(lineTotal: number | null, quantity: number) {
  return lineTotal === null || quantity <= 0 ? null : lineTotal / quantity;
}

export function stockValue(onHand: number | null, cost: number | null) {
  return onHand === null || cost === null ? null : round2(onHand * cost);
}

/** A typed dollar amount ("$1,234.50"); blank is `null`. */
export function parseMoney(value: string): number | null {
  const trimmed = value.trim().replace(/^\$/, "").replace(/,/g, "");
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) throw new Error("Enter an amount like 42.50.");
  const number = Number(trimmed);
  if (number > MAX_QUANTITY) throw new Error("Enter a smaller amount.");
  return number;
}

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(value: number | null) {
  return value === null ? "—" : dollars.format(value);
}

export type FinishedCount = { id: string; countedOn: LocalDate; quantities: Map<string, number | null> };
/** On hand on `on`, including that day's deliveries. */
export type StartingStock = { quantity: number; on: LocalDate };
export type ReceivedLine = { itemId: string; quantity: number; receivedOn: LocalDate; onShelfForCount: boolean };
export type UsagePeriod = {
  fromCountId: string;
  toCountId: string;
  from: LocalDate;
  to: LocalDate;
  /** Per item on both counts: start, received, end, used. `used` is null when either count skipped it. */
  lines: Map<string, { start: number | null; received: number; end: number | null; used: number | null }>;
};

/**
 * Usage between each pair of consecutive finished counts (oldest first):
 * what was there at the start, plus what arrived in between, minus what was left.
 */
export function usagePeriods(
  counts: FinishedCount[],
  deliveries: ReceivedLine[],
  starting: Map<string, StartingStock> = new Map(),
): UsagePeriod[] {
  const periods: UsagePeriod[] = [];
  for (let i = 1; i < counts.length; i++) {
    const before = counts[i - 1];
    const after = counts[i];
    // An item new since `before` starts from its starting stock, if it has one from within the period.
    const lines: UsagePeriod["lines"] = new Map();
    for (const itemId of new Set([...before.quantities.keys(), ...after.quantities.keys()])) {
      const stock = starting.get(itemId);
      const fromStarting =
        !before.quantities.has(itemId) && stock !== undefined && stock.on >= before.countedOn && stock.on <= after.countedOn;
      const start = fromStarting ? stock.quantity : (before.quantities.get(itemId) ?? null);
      const end = after.quantities.get(itemId) ?? null;
      const inBetween = (l: ReceivedLine) =>
        (fromStarting ? l.receivedOn > stock.on : deliveryCounts(l.receivedOn, l.onShelfForCount, before.countedOn)) &&
        !deliveryCounts(l.receivedOn, l.onShelfForCount, after.countedOn);
      const got = round2(deliveries.filter((l) => l.itemId === itemId && inBetween(l)).reduce((sum, l) => sum + l.quantity, 0));
      lines.set(itemId, { start, received: got, end, used: start === null || end === null ? null : round2(start + got - end) });
    }
    periods.push({ fromCountId: before.id, toCountId: after.id, from: before.countedOn, to: after.countedOn, lines });
  }
  return periods;
}

export const HIGH_USAGE_FACTOR = 1.5;
export const USAGE_HISTORY = 4;

/**
 * "mismatch": more on the shelf than could be there. "high": over 1.5× the average of the item's
 * last four periods with a usage (skipped and mismatched periods don't count).
 */
export function usageFlag(used: number | null, previous: (number | null)[]): "mismatch" | "high" | null {
  if (used === null) return null;
  if (used < 0) return "mismatch";
  const history = previous.filter((u): u is number => u !== null && u >= 0).slice(-USAGE_HISTORY);
  if (history.length < USAGE_HISTORY) return null;
  const average = history.reduce((sum, u) => sum + u, 0) / history.length;
  return average > 0 && used > HIGH_USAGE_FACTOR * average ? "high" : null;
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
