import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerPort ??= new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });

export async function openPdf(file: File) {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  return {
    pageCount: doc.numPages,
    /** Each page drawn on a white canvas, longest side `maxSide` px. */
    async *pages(maxSide: number): AsyncGenerator<HTMLCanvasElement> {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: maxSide / Math.max(base.width, base.height) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvas, viewport, background: "white" }).promise;
        page.cleanup();
        yield canvas;
      }
    },
    close: () => task.destroy(),
  };
}
