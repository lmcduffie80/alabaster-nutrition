"use client";

import { Plus } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Button, Card, Field, FormMessage, inputClass } from "@/components/ui";
import { formatQuantity } from "@/lib/domain/inventory";

type SheetState = { error?: string; success?: string; at?: number } | null;
type SheetAction = (state: SheetState, form: FormData) => Promise<SheetState>;

export type SheetLine = {
  itemId: string;
  name: string;
  unit: string;
  quantity: number | null;
  lastCounted: number | null;
  enteredBy: string | null;
};

const asText = (quantity: number | null) => (quantity === null ? "" : String(quantity));
const SHEET_ID = "count-sheet";

/**
 * Count entry on the web, for managers and employees. Only boxes someone typed in are sent, so numbers
 * entered elsewhere meanwhile show up instead of being overwritten; typed numbers stay put if a save fails.
 */
export function CountSheet({
  countId,
  spots,
  action,
  addAction,
}: {
  countId: string;
  spots: { name: string; lines: SheetLine[] }[];
  action: SheetAction;
  addAction: SheetAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | undefined>();
  if (state?.success && state.at !== savedAt) {
    setSavedAt(state.at);
    setEdits({});
  }
  const all = spots.flatMap((s) => s.lines);
  const valueOf = (line: SheetLine) => edits[line.itemId] ?? asText(line.quantity);
  const filled = all.filter((l) => valueOf(l).trim() !== "").length;
  const unsaved = all.filter((l) => valueOf(l).trim() !== asText(l.quantity)).length;

  return (
    <>
      <form
        id={SHEET_ID}
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
                    {line.itemId in edits && (
                      <>
                        <input type="hidden" name={`p:${line.itemId}`} value={asText(line.quantity)} />
                        <input type="hidden" name={`q:${line.itemId}`} value={edits[line.itemId]} />
                      </>
                    )}
                    <input
                      data-count-input
                      inputMode="decimal"
                      enterKeyHint="next"
                      autoComplete="off"
                      value={valueOf(line)}
                      onChange={(e) => setEdits((v) => ({ ...v, [line.itemId]: e.target.value }))}
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
      </form>

      <AddItem countId={countId} action={addAction} />

      <div className="sticky bottom-0 mt-5 -mx-4 border-t border-ink/10 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink/60">
            {filled} of {all.length} counted{unsaved > 0 && ` · ${unsaved} not saved yet`}
          </p>
          <div className="flex gap-2">
            <Button type="submit" form={SHEET_ID} variant="secondary" name="intent" value="save" disabled={pending}>
              Save
            </Button>
            <Button type="submit" form={SHEET_ID} name="intent" value="finish" disabled={pending || filled === 0}>
              Save and finish
            </Button>
          </div>
        </div>
        <FormMessage error={state?.error} success={state?.success} />
      </div>
    </>
  );
}

/** For something on the shelf that isn't on the list. */
function AddItem({ countId, action }: { countId: string; action: SheetAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) ref.current?.reset();
  }, [state]);

  return (
    <details className="mt-5 rounded-xl border border-ink/10 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-porcelain">Item not on the list?</summary>
      <form ref={ref} action={formAction} className="mt-3 grid grid-cols-2 gap-3">
        <input type="hidden" name="countId" value={countId} />
        <Field label="Item number">
          <input name="code" autoComplete="off" maxLength={40} placeholder="SKU, if it has one" className={inputClass} />
        </Field>
        <Field label="Quantity">
          <input name="quantity" inputMode="decimal" autoComplete="off" required className={inputClass} />
        </Field>
        <div className="col-span-2">
          <Field label="Description">
            <input name="name" autoComplete="off" maxLength={80} placeholder="What it's called" className={inputClass} />
          </Field>
        </div>
        <Field label="Unit">
          <input name="unit" autoComplete="off" maxLength={40} placeholder="each" className={inputClass} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" disabled={pending} className="w-full">
            <Plus className="size-4" />
            Add to count
          </Button>
        </div>
        <p className="col-span-2 text-xs text-ink/50">
          If the number or description matches an item on file, it&rsquo;s added to this count. Otherwise a new item is
          set up, reordering at 1.
        </p>
        <div className="col-span-2">
          <FormMessage error={state?.error} success={state?.success} />
        </div>
      </form>
    </details>
  );
}
