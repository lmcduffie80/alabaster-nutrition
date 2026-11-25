"use client";

import { startTransition, useActionState, useState } from "react";
import { Button, Card, FormMessage, inputClass } from "@/components/ui";
import { formatQuantity } from "@/lib/domain/inventory";
import { saveCountAction } from "../../../inventory-actions";

export type SheetLine = {
  itemId: string;
  name: string;
  unit: string;
  quantity: number | null;
  lastCounted: number | null;
  enteredBy: string | null;
};

const asText = (quantity: number | null) => (quantity === null ? "" : String(quantity));

/** The manager's count entry. Typed numbers stay put if a save fails. */
export function CountSheet({ countId, spots }: { countId: string; spots: { name: string; lines: SheetLine[] }[] }) {
  const [state, formAction, pending] = useActionState(saveCountAction, null);
  const all = spots.flatMap((s) => s.lines);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(all.map((l) => [l.itemId, asText(l.quantity)])),
  );
  const filled = all.filter((l) => (values[l.itemId] ?? "").trim() !== "").length;
  const unsaved = all.filter((l) => (values[l.itemId] ?? "").trim() !== asText(l.quantity)).length;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const finishing = submitter?.getAttribute("value") === "finish";
        if (finishing && filled < all.length) {
          const left = all.length - filled;
          if (!window.confirm(`Finish with ${left} item${left === 1 ? "" : "s"} not counted? They'll be marked skipped.`)) return;
        }
        const data = new FormData(event.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="countId" value={countId} />
      {spots.map((spot) => (
        <section key={spot.name} className="mt-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">{spot.name}</h2>
          <Card className="divide-y divide-ink/5 p-0">
            {spot.lines.map((line) => (
              <label key={line.itemId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{line.name}</span>
                  <span className="block text-xs text-ink/50">
                    {line.lastCounted !== null && `Last count ${formatQuantity(line.lastCounted, line.unit)}`}
                    {line.lastCounted !== null && line.enteredBy && " · "}
                    {line.enteredBy && `Entered by ${line.enteredBy}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <input type="hidden" name={`p:${line.itemId}`} value={asText(line.quantity)} />
                  <input
                    name={`q:${line.itemId}`}
                    data-count-input
                    inputMode="decimal"
                    enterKeyHint="next"
                    autoComplete="off"
                    value={values[line.itemId] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [line.itemId]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const inputs = [...document.querySelectorAll<HTMLInputElement>("[data-count-input]")];
                      inputs[inputs.indexOf(e.currentTarget) + 1]?.focus();
                    }}
                    aria-label={`${line.name}, ${line.unit}`}
                    className={`${inputClass} w-24 text-right tabular-nums`}
                  />
                  <span className="w-10 text-xs text-ink/50">{line.unit}</span>
                </span>
              </label>
            ))}
          </Card>
        </section>
      ))}

      <div className="sticky bottom-0 mt-5 -mx-4 border-t border-ink/10 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink/60">
            {filled} of {all.length} counted{unsaved > 0 && ` · ${unsaved} not saved yet`}
          </p>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" name="intent" value="save" disabled={pending}>
              Save
            </Button>
            <Button type="submit" name="intent" value="finish" disabled={pending || filled === 0}>
              Save and finish
            </Button>
          </div>
        </div>
        <FormMessage error={state?.error} success={state?.success} />
      </div>
    </form>
  );
}
