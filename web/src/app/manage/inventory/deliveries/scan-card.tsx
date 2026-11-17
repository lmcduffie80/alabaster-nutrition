"use client";

import { Camera, FileText } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import { scanInvoiceAction, type ScanResult } from "./scan-actions";

const MAX_PAGES = 5;
const MAX_SIDE = 2000;
const MAX_PHOTO_BYTES = 1_400_000;
const MAX_TOTAL_BYTES = 3_800_000;

const isPdf = (file: File) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

async function photoCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** As JPEG, small enough for five pages to fit in one upload. */
async function shrink(canvas: HTMLCanvasElement, budget: number): Promise<Blob> {
  let blob: Blob | null = null;
  for (const quality of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= budget) return blob;
  }
  throw new Error("too large");
}

export type Notice = { message: string; tone: "info" | "error" };
type Status = { kind: "idle" } | { kind: "reading"; pages: number } | ({ kind: "notice" } & Notice);

/** Reads invoice or receipt pages, from photos or a PDF, and hands what was read to `onScanned`, which says what to tell the manager. */
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
  const photoInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const tooMany = `Choose up to ${MAX_PAGES} pages at a time.`;

  async function scan(files: File[]) {
    if (files.length === 0) return;
    if (files.length > MAX_PAGES) return setStatus({ kind: "notice", tone: "error", message: tooMany });
    const pdfs = files.filter(isPdf);
    const form = new FormData();

    if (pdfs.length) {
      if (pdfs.length !== files.length || pdfs.length > 1) {
        return setStatus({ kind: "notice", tone: "error", message: "Choose one PDF at a time." });
      }
      setStatus({ kind: "reading", pages: 1 });
      try {
        const { openPdf } = await import("./pdf-pages");
        const pdf = await openPdf(pdfs[0]);
        try {
          if (pdf.pageCount > MAX_PAGES) {
            return setStatus({ kind: "notice", tone: "error", message: `That PDF has ${pdf.pageCount} pages. Metzey reads up to ${MAX_PAGES}.` });
          }
          setStatus({ kind: "reading", pages: pdf.pageCount });
          const budget = Math.min(MAX_PHOTO_BYTES, Math.floor(MAX_TOTAL_BYTES / pdf.pageCount));
          let index = 0;
          for await (const canvas of pdf.pages(MAX_SIDE)) form.append("photo", await shrink(canvas, budget), `page-${++index}.jpg`);
        } finally {
          void pdf.close();
        }
      } catch {
        return setStatus({ kind: "notice", tone: "error", message: "Couldn't open that PDF. Try saving it again, or take photos instead." });
      }
    } else {
      setStatus({ kind: "reading", pages: files.length });
      try {
        const budget = Math.min(MAX_PHOTO_BYTES, Math.floor(MAX_TOTAL_BYTES / files.length));
        for (const [index, file] of files.entries()) form.append("photo", await shrink(await photoCanvas(file), budget), `page-${index + 1}.jpg`);
      } catch {
        return setStatus({ kind: "notice", tone: "error", message: "Couldn't open one of the photos. Try taking it again." });
      }
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
      {[
        { ref: photoInput, accept: "image/*", multiple: true },
        { ref: pdfInput, accept: "application/pdf,.pdf", multiple: false },
      ].map(({ ref, accept, multiple }) => (
        <input
          key={accept}
          ref={ref}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void scan(files);
          }}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => photoInput.current?.click()} disabled={status.kind === "reading"}>
          <Camera className="size-4" /> {status.kind === "reading" ? "Reading…" : buttonLabel}
        </Button>
        <Button variant="secondary" onClick={() => pdfInput.current?.click()} disabled={status.kind === "reading"}>
          <FileText className="size-4" /> Upload PDF
        </Button>
      </div>
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
