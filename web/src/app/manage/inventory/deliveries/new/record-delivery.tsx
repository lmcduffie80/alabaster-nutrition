"use client";

import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import { recordDeliveryAction } from "../../../inventory-actions";
import { DeliveryForm, type DeliveryFormValues, type PickableItem, type PickableSpot, type PickableSupplier } from "../delivery-form";
import { scanInvoiceAction } from "../scan-actions";

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

type Status = { kind: "idle" } | { kind: "reading"; pages: number } | { kind: "notice"; message: string; tone: "info" | "error" };

export function RecordDelivery({
  items,
  suppliers,
  spots,
  blank,
}: {
  items: PickableItem[];
  suppliers: PickableSupplier[];
  spots: PickableSpot[];
  blank: DeliveryFormValues;
}) {
  const [values, setValues] = useState(blank);
  const [formKey, setFormKey] = useState(0);
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
    if (result.kind === "unreadable") {
      setValues({ ...values, photoIds: result.photoIds });
      setFormKey((k) => k + 1);
      return setStatus({ kind: "notice", tone: "error", message: "Couldn't read this invoice — enter it below. The photos will be saved with it." });
    }
    const { prefill } = result;
    setValues({ ...prefill, onShelfForCount: false, photoIds: result.photoIds });
    setFormKey((k) => k + 1);
    const lines = prefill.lines.length;
    const unmatched = prefill.lines.filter((l) => !l.itemId).length;
    setStatus({
      kind: "notice",
      tone: "info",
      message:
        `Read ${lines} ${lines === 1 ? "line" : "lines"}` +
        (unmatched ? `; ${unmatched} need${unmatched === 1 ? "s" : ""} an item.` : ".") +
        " Check everything against the invoice before saving.",
    });
  }

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-semibold">Have the invoice?</p>
          <p className="text-ink/60">Take a photo of each page (up to {MAX_PAGES}) and the form fills itself in.</p>
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
          <Camera className="size-4" /> {status.kind === "reading" ? "Reading…" : "Scan invoice"}
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
      <Card>
        <DeliveryForm
          key={formKey}
          action={recordDeliveryAction}
          items={items}
          suppliers={suppliers}
          spots={spots}
          initial={values}
          submitLabel="Save delivery"
        />
      </Card>
    </div>
  );
}
