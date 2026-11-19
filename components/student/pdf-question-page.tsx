"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { sourceBounds, type Region } from "@/lib/question-source";
import { capRenderScale, resolveViewerScale, type ViewerZoom } from "@/lib/viewer-scale";
import { readPdf } from "./pdf-bank-store";

type PdfEntry = {
  users: number;
  opening: Promise<PDFDocumentLoadingTask>;
  document: Promise<PDFDocumentProxy>;
};

const pdfs = new Map<string, PdfEntry>();
const MAX_IDLE_PDFS = 3;

async function openPdf(key: string, bankId?: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  if (bankId && bankId !== "mega") {
    const data = await readPdf(bankId);
    if (!data) throw new Error("This added bank PDF is no longer available in this browser.");
    return pdfjs.getDocument({ data });
  }
  return pdfjs.getDocument({ url: key, rangeChunkSize: 65536 });
}

function destroyPdf(entry: PdfEntry) {
  void entry.opening.then(task => task.destroy()).catch(() => {});
}

function retainPdf(key: string, bankId?: string) {
  let entry = pdfs.get(key);
  if (entry) {
    pdfs.delete(key);
  } else {
    const opening = openPdf(key, bankId);
    const created = { users: 0, opening, document: opening.then(task => task.promise) };
    void created.document.catch(() => {
      if (pdfs.get(key) !== created) return;
      pdfs.delete(key);
      destroyPdf(created);
    });
    entry = created;
  }
  pdfs.set(key, entry);
  entry.users++;
  return entry;
}

function releasePdf(entry: PdfEntry) {
  entry.users--;
  const idle = [...pdfs].filter(([, pdf]) => pdf.users === 0);
  for (const [key, pdf] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE_PDFS))) {
    pdfs.delete(key);
    destroyPdf(pdf);
  }
}

type Props = {
  page: number;
  sourcePage: number;
  bankId?: string;
  bankName: string;
  questionNumber?: number;
  cropView?: boolean;
  highlightLabels?: string[];
  sourceAsset?: string;
  sourceRegions?: Region[];
  zoom?: ViewerZoom;
  fitBox?: { width: number; height: number };
  onScale?: (scale: number) => void;
};

export function PdfQuestionPage({
  page, sourcePage, bankId, bankName, questionNumber = 0, cropView = false,
  highlightLabels = [], sourceAsset, sourceRegions = [], zoom, fitBox, onScale,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sizeVersion, setSizeVersion] = useState(0);
  const [result, setResult] = useState<{ renderId: string; contentId: string; error?: string }>();
  const pdfKey = bankId && bankId !== "mega" ? `bank:${bankId}` : sourceAsset || "/ap-chemistry-mega.pdf";
  const regionsKey = JSON.stringify(sourceRegions);
  const labelsKey = JSON.stringify(highlightLabels);
  const contentId = JSON.stringify([pdfKey, page, sourcePage, questionNumber, cropView, regionsKey, labelsKey]);
  const fitWidth = fitBox?.width;
  const fitHeight = fitBox?.height;
  const renderId = JSON.stringify([contentId, zoom, sizeVersion, fitWidth, fitHeight]);
  const busy = result?.renderId !== renderId;
  const error = result?.renderId === renderId ? result.error : undefined;
  const fitToHeight = zoom === "page";
  const fitted = zoom === "width" || fitToHeight;

  useEffect(() => {
    const frame = wrap.current;
    if (!fitted || !frame) return;
    const viewport = frame.closest<HTMLElement>("[data-pdf-viewport]") ?? frame;
    let { clientWidth: width, clientHeight: height } = viewport;
    const observer = new ResizeObserver(() => {
      // A width-fitted phone viewer grows with its content, including its loading message.
      if (width === viewport.clientWidth && (!fitToHeight || height === viewport.clientHeight)) return;
      width = viewport.clientWidth;
      height = viewport.clientHeight;
      setSizeVersion(previous => previous + 1);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitted, fitToHeight]);

  useEffect(() => {
    const frame = wrap.current;
    const target = canvas.current;
    if (!frame || !target) return;

    const lease = retainPdf(pdfKey, bankId);
    let cancelled = false;
    let task: RenderTask | undefined;
    async function render(output: HTMLCanvasElement, wrapper: HTMLDivElement) {
      try {
        const documentProxy = await lease.document;
        if (cancelled) return;
        const pdfPage = await documentProxy.getPage(page);
        if (cancelled) return;

        const base = pdfPage.getViewport({ scale: 1 });
        const regions = (JSON.parse(regionsKey) as Region[]).filter(region => region.page === sourcePage);
        const area = sourceBounds(pdfPage, cropView ? regions : []);
        const viewport = wrapper.closest<HTMLElement>("[data-pdf-viewport]") ?? wrapper;
        const chrome = [...viewport.querySelectorAll<HTMLElement>(".pdf-label,.pdf-crop-note,[data-viewer-chrome]")]
          .reduce((sum, element) => sum + element.offsetHeight, 24);
        const scale = zoom === undefined
          ? Math.min(2, Math.max(0.6, (wrapper.clientWidth - 24) / base.width))
          : resolveViewerScale(zoom, { width: viewport.clientWidth - 24, height: viewport.clientHeight - chrome },
            { width: fitWidth ?? area.width, height: fitHeight ?? area.height });
        const renderScale = capRenderScale(base, scale, zoom === undefined ? 1 : window.devicePixelRatio || 1);
        const ratio = renderScale / scale;
        const renderViewport = pdfPage.getViewport({ scale: renderScale });
        const scratch = document.createElement("canvas");
        scratch.width = Math.max(1, Math.ceil(renderViewport.width));
        scratch.height = Math.max(1, Math.ceil(renderViewport.height));
        const scratchContext = scratch.getContext("2d");
        const context = output.getContext("2d");
        if (!scratchContext || !context) throw new Error("Could not display this PDF page.");
        task = pdfPage.render({ canvas: scratch, canvasContext: scratchContext, viewport: renderViewport });
        await task.promise;
        if (cancelled) return;

        const labels = JSON.parse(labelsKey) as string[];
        const text = labels.length || zoom === undefined ? await pdfPage.getTextContent() : undefined;
        if (cancelled) return;
        const display = pdfPage.getViewport({ scale });
        const x = area.x * scale;
        const y = area.y * scale;
        // Keep the same scaled crop coordinates used by the original viewer.
        const width = cropView && regions.length && area.width !== base.width
          ? Math.min(display.width, Math.max(...regions.map(r => r.rect[2])) * scale) - x : display.width;
        const height = cropView && regions.length && area.height !== base.height
          ? Math.min(display.height, Math.max(...regions.map(r => r.rect[3])) * scale) - y : display.height;
        output.width = Math.max(1, Math.ceil(width * ratio));
        output.height = Math.max(1, Math.ceil(height * ratio));
        output.style.width = `${Math.ceil(width)}px`;
        output.style.height = `${Math.ceil(height)}px`;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.drawImage(scratch, x * ratio, y * ratio, width * ratio, height * ratio, 0, 0, width, height);

        for (const label of labels) {
          for (const item of text?.items ?? []) {
            if (!("str" in item) || !item.str.trim().startsWith(label)) continue;
            const [left, baseline] = base.convertToViewportPoint(item.transform[4], item.transform[5]);
            if (left < area.x || left > area.x + area.width || baseline < area.y || baseline > area.y + area.height) continue;
            if (regions.length && !regions.some(({ rect }) => left >= rect[0] && baseline >= rect[1] && left <= rect[2] && baseline <= rect[3])) continue;
            const glyphHeight = item.height || Math.abs(item.transform[3]);
            context.fillStyle = "rgba(250, 197, 90, .48)";
            context.fillRect(left * scale - x - 3, (baseline - glyphHeight) * scale - y,
              item.width * scale + 7, glyphHeight * scale + 5);
            break;
          }
        }
        setResult({ renderId, contentId });
        onScale?.(scale);
      } catch (caught) {
        if (!cancelled) setResult({ renderId, contentId, error: caught instanceof Error ? caught.message : "Could not render this source page." });
      }
    }
    void render(target, frame);
    return () => {
      cancelled = true;
      task?.cancel();
      releasePdf(lease);
    };
  }, [pdfKey, bankId, page, sourcePage, cropView, regionsKey, labelsKey, zoom, fitWidth, fitHeight, onScale, contentId, renderId]);

  const visible = result?.contentId === contentId && !result.error;
  return <div className="pdf-frame" ref={wrap}>
    <div className="pdf-label"><span>PDF SOURCE IMAGE</span><span>{bankName} · original page {sourcePage}</span></div>
    {busy && <div className="pdf-wait">Rendering original page…</div>}
    {cropView && !error && <div className="pdf-crop-note">{sourceRegions.length ? "Source region · full page remains available for surrounding context." : "No reliable crop boundary recorded; showing the full page."}</div>}
    {error ? <div className="pdf-error">{error}</div> :
      <canvas ref={canvas} aria-label={`${bankName}, page ${sourcePage}`} style={{ visibility: visible ? "visible" : "hidden" }} />}
  </div>;
}
