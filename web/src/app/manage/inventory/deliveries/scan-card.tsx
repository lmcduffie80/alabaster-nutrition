"use client";

import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import { scanInvoiceAction, type ScanResult } from "./scan-actions";

const MAX_PAGES = 5;
const MAX_SIDE = 2000;
const MAX_PHOTO_BYTES = 1_400_000;
const MAX_TOTAL_BYTES = 3_800_000;

/** Longest side 2000 px, as JPEG, small enough for five pages to fit in one upload. */
async function shrink(file: File, budget: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let blob: Blob | null = null;
  for (const quality of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= budget) return blob;
  }
  throw new Error("too large");
}

export type Notice = { message: string; tone: "info" | "error" };
type Status = { kind: "idle" } | { kind: "reading"; pages: number } | ({ kind: "notice" } & Notice);

/** Photographs invoice or receipt pages and hands what was read to `onScanned`, which says what to tell the manager. */
export function ScanCard({
  title,
  hint,
  buttonLabel,
  onScanned,
}: {
  title: string;
  hint: string;
  buttonLabel: string;
  onScanned: (result: Exclude<ScanResult, { kind: "error" }>) => Notice;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const input = useRef<HTMLInputElement>(null);

  async function scan(files: File[]) {
    if (files.length === 0) return;
    if (files.length > MAX_PAGES) {
      return setStatus({ kind: "notice", tone: "error", message: `Choose up to ${MAX_PAGES} pages at a time.` });
    }
    setStatus({ kind: "reading", pages: files.length });
    const form = new FormData();
    try {
      const budget = Math.min(MAX_PHOTO_BYTES, Math.floor(MAX_TOTAL_BYTES / files.length));
      for (const [index, file] of files.entries()) form.append("photo", await shrink(file, budget), `page-${index + 1}.jpg`);
    } catch {
      return setStatus({ kind: "notice", tone: "error", message: "Couldn't open one of the photos. Try taking it again." });
    }

    let result;
    try {
      result = await scanInvoiceAction(form);
    } catch {
      return setStatus({ kind: "notice", tone: "error", message: "Couldn't reach the server. Check the connection and try again." });
    }
    if (result.kind === "error") return setStatus({ kind: "notice", tone: "error", message: result.message });
    setStatus({ kind: "notice", ...onScanned(result) });
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm">
        <p className="font-semibold">{title}</p>
        <p className="text-ink/60">{hint}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void scan(files);
        }}
      />
      <Button onClick={() => input.current?.click()} disabled={status.kind === "reading"}>
        <Camera className="size-4" /> {status.kind === "reading" ? "Reading…" : buttonLabel}
      </Button>
      {status.kind === "reading" && (
        <p className="basis-full text-sm text-ink/60">
          Reading {status.pages} {status.pages === 1 ? "page" : "pages"}. This can take up to a minute.
        </p>
      )}
      {status.kind === "notice" && (
        <p
          className={`basis-full rounded-lg px-3 py-2 text-sm ${
            status.tone === "error" ? "bg-red-50 text-red-700" : "bg-porcelain-light text-porcelain"
          }`}
        >
          {status.message}
        </p>
      )}
    </Card>
  );
}

export const MAX_SCAN_PHOTOS = MAX_PAGES;
