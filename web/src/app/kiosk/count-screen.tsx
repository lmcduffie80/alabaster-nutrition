"use client";

import { Check, CloudOff, Loader2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Card, FramedPanel } from "@/components/ui";
import { formatQuantity, parseQuantity, round2 } from "@/lib/domain/inventory";
import { enterCount, finishCounting, type CountScreenView } from "./actions";

type LineState = { value: string; saved: number | null; status: "idle" | "saving" | "saved" | "error"; message?: string };

const SAVE_DELAY_MS = 500;

function display(value: number | null) {
  return value === null ? "" : String(value);
}

export function CountScreen({
  view,
  onLeave,
  onFinished,
  onExpired,
}: {
  view: CountScreenView;
  onLeave: () => void;
  onFinished: (message: string) => void;
  onExpired: () => void;
}) {
  const [initial] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(view.lines.map((l) => [l.itemId, { value: display(l.quantity), saved: l.quantity, status: "idle" }])),
  );
  const [lines, setLines] = useState(initial);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Same as `lines`, readable inside async saves without waiting for a render. */
  const latest = useRef(initial);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  function update(itemId: string, patch: Partial<LineState>) {
    latest.current = { ...latest.current, [itemId]: { ...latest.current[itemId], ...patch } };
    setLines(latest.current);
  }

  async function save(itemId: string) {
    clearTimeout(timers.current.get(itemId));
    const line = latest.current[itemId];
    let quantity: number | null;
    try {
      quantity = parseQuantity(line.value);
    } catch (e) {
      update(itemId, { status: "error", message: (e as Error).message });
      return;
    }
    if (quantity === line.saved && line.status !== "error") return;
    update(itemId, { status: "saving", message: undefined });
    try {
      const result = await enterCount({ countId: view.countId, itemId, quantity: line.value });
      if (result.kind === "expired") return onExpired();
      if (result.kind === "saved") {
        const stillCurrent = latest.current[itemId].value === line.value;
        update(itemId, { saved: result.quantity, status: stillCurrent ? "saved" : "saving" });
        if (!stillCurrent) void save(itemId);
        return;
      }
      update(itemId, { status: "error", message: result.kind === "error" ? result.message : "Not saved" });
    } catch {
      update(itemId, { status: "error", message: "Not saved — tap to retry" });
    }
  }

  function step(itemId: string, delta: number) {
    const current = parseFloat(latest.current[itemId].value);
    const next = Math.max(0, round2((Number.isNaN(current) ? 0 : current) + delta));
    update(itemId, { value: String(next), status: "idle" });
    clearTimeout(timers.current.get(itemId));
    timers.current.set(itemId, setTimeout(() => void save(itemId), SAVE_DELAY_MS));
  }

  const counted = Object.values(lines).filter((l) => l.saved !== null).length;
  const blanks = view.lines.length - counted;
  const unsaved = Object.values(lines).some((l) => l.status === "saving" || l.status === "error");

  async function finish() {
    setError(null);
    if (unsaved) return setError("Some numbers haven’t saved yet. Fix the ones marked in red, then finish.");
    if (blanks > 0 && !confirmSkip) return setConfirmSkip(true);
    setFinishing(true);
    try {
      const result = await finishCounting({ countId: view.countId });
      if (result.kind === "finished") {
        return onFinished(result.skipped > 0 ? `Count finished · ${result.skipped} skipped` : "Count finished. Thank you!");
      }
      if (result.kind === "expired") return onExpired();
      setError(result.kind === "error" ? result.message : "Couldn’t finish. Try again.");
    } catch {
      setError("No connection — the count wasn’t finished. Check the Wi-Fi and try again.");
    } finally {
      setFinishing(false);
      setConfirmSkip(false);
    }
  }

  const spots = [...new Set(view.lines.map((l) => l.spotName))];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-ink/10 bg-white/80 px-8 py-4">
        <div>
          <p className="font-serif text-3xl font-semibold">Inventory count</p>
          <p className="text-sm text-ink/60" aria-live="polite">
            {counted} of {view.lines.length} counted
          </p>
        </div>
        <Button variant="quiet" onClick={onLeave}>
          Done for now
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {spots.map((spot) => (
          <section key={spot} className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/50">{spot}</h2>
            <Card className="divide-y divide-ink/5 p-0">
              {view.lines
                .filter((l) => l.spotName === spot)
                .map((line) => {
                  const state = lines[line.itemId];
                  return (
                    <div key={line.itemId} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{line.name}</p>
                        <p className="text-xs text-ink/50">
                          {line.unit}
                          {line.lastCounted !== null && ` · last count ${formatQuantity(line.lastCounted)}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Less ${line.name}`}
                        onClick={() => step(line.itemId, -1)}
                        className="flex size-12 items-center justify-center rounded-full bg-white ring-1 ring-ink/15 active:bg-porcelain-light"
                      >
                        <Minus className="size-5" />
                      </button>
                      <input
                        aria-label={`${line.name} count`}
                        inputMode="decimal"
                        value={state.value}
                        placeholder="—"
                        onChange={(e) => update(line.itemId, { value: e.target.value, status: "idle" })}
                        onBlur={() => void save(line.itemId)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        className={`w-20 rounded-xl border px-2 py-2 text-center font-mono text-xl tabular-nums outline-none focus:ring-2 focus:ring-porcelain/20 ${
                          state.status === "error" ? "border-red-400" : "border-ink/15"
                        }`}
                      />
                      <button
                        type="button"
                        aria-label={`More ${line.name}`}
                        onClick={() => step(line.itemId, 1)}
                        className="flex size-12 items-center justify-center rounded-full bg-white ring-1 ring-ink/15 active:bg-porcelain-light"
                      >
                        <Plus className="size-5" />
                      </button>
                      <span className="w-32 text-xs">
                        {state.status === "saving" && (
                          <span className="flex items-center gap-1 text-ink/50">
                            <Loader2 className="size-3.5 animate-spin" /> Saving…
                          </span>
                        )}
                        {state.status === "saved" && (
                          <span className="flex items-center gap-1 text-[#4d6340]">
                            <Check className="size-3.5" /> Saved
                          </span>
                        )}
                        {state.status === "error" && (
                          <button type="button" onClick={() => void save(line.itemId)} className="flex items-start gap-1 text-left text-red-700">
                            <CloudOff className="mt-px size-3.5 shrink-0" /> {state.message ?? "Not saved — tap to retry"}
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
            </Card>
          </section>
        ))}
      </div>

      <footer className="border-t border-ink/10 bg-white/80 px-8 py-4">
        {error && (
          <p role="alert" className="mb-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        {confirmSkip ? (
          <FramedPanel className="flex items-center justify-between gap-4">
            <p className="font-medium">
              Skip {blanks} {blanks === 1 ? "item" : "items"}? They keep last week’s count.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmSkip(false)}>
                Keep counting
              </Button>
              <Button onClick={() => void finish()} disabled={finishing}>
                Skip and finish
              </Button>
            </div>
          </FramedPanel>
        ) : (
          <Button className="w-full py-4 text-lg" onClick={() => void finish()} disabled={finishing}>
            Finish count
          </Button>
        )}
      </footer>
    </div>
  );
}
