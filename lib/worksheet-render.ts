import type { WorksheetContent } from "./worksheet-content";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Region, SourceFile } from "./worksheet";
import { renderSourceCanvas, sourceBounds, sourcePageLocation } from "./question-source";
import { contentResponse } from "#student-content";

export async function renderWorksheet(draft: import("./worksheet").Draft, questions: import("./worksheet-pdf").WorksheetQuestion[],
  registry: import("./worksheet").Registry, mode: import("./worksheet").ExportMode, files: SourceFile[],
  open: (url?: string, bankId?: string) => Promise<PDFDocumentProxy>, signal: AbortSignal, content: WorksheetContent, loadFragments = async () => {
    const response = await contentResponse("/worksheet-fragments.pdf", signal);
    if (!response.ok) throw new Error("The reviewed question regions could not be loaded.");
    return new Uint8Array(await response.arrayBuffer());
  }) {
  const { composeWorksheet } = await import("./worksheet-pdf");
  return composeWorksheet(draft, questions, registry, mode, content, loadFragments, async (region: Region, question) => {
    signal.throwIfAborted();
    const location = sourcePageLocation(region.page, files, question?.sourceBank);
    const title = question ? `${question.exam}, question ${question.number}` : "Reference tables";
    const pdf = await open(location.url, location.bankId).catch(() => {
      throw new Error(`Cannot open the source PDF for ${title} (page ${region.page}). Restore the original PDF and try again.`);
    });
    signal.throwIfAborted();
    const page = await pdf.getPage(location.page).catch(() => {
      throw new Error(`Source page ${region.page} is unavailable for ${title}. Check the question’s original page reference.`);
    });
    signal.throwIfAborted();
    const bounds = sourceBounds(page, region.rect.length ? [region] : []);
    const canvas = document.createElement("canvas");
    try {
      const task = renderSourceCanvas(page, canvas, bounds, 300 / 72);
      const cancel = () => task.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      try { await task.promise; } finally { signal.removeEventListener("abort", cancel); }
      signal.throwIfAborted();
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not encode the source image.")), "image/png"));
      return { png: new Uint8Array(await png.arrayBuffer()), width: bounds.width, height: bounds.height };
    } finally {
      canvas.width = canvas.height = 0;
    }
  });
}
