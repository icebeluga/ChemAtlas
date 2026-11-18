"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Minus, MoveHorizontal, Plus, Scan } from "lucide-react";
import { pdfWorkerUrl } from "#student-content";

export function WorksheetPreview({ bytes, count, onCount }: { bytes: Uint8Array; count: number; onCount: (n: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [fitPage, setFitPage] = useState(false);
  const [error, setError] = useState("");
  const { width } = box;
  const fitHeight = fitPage ? box.height : Infinity;
  const renderRequest = useMemo(() => ({ doc, page, zoom, width, fitHeight }), [doc, page, zoom, width, fitHeight]);
  const [painted, setPainted] = useState<typeof renderRequest>();
  useEffect(() => {
    let stale = false;
    let dispose: (() => void) | undefined;
    import("pdfjs-dist/legacy/build/pdf.mjs").then(pdfjs => {
      if (stale) return;
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl();
      const task = pdfjs.getDocument({ data: bytes.slice() });
      dispose = () => { void task.destroy(); };
      return task.promise.then(document => {
        if (!stale) { setDoc(document); onCount(document.numPages); }
      });
    }).catch(() => { if (!stale) setError("Could not display the preview. You can still download the PDF."); });
    return () => { stale = true; dispose?.(); };
  }, [bytes, onCount]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const { doc, page, zoom, width, fitHeight } = renderRequest;
    const target = canvas.current;
    if (!doc || !target || !width || !fitHeight) return;
    let stale = false;
    let task: RenderTask | undefined;
    doc.getPage(page).then(source => {
      if (stale) return;
      const natural = source.getViewport({ scale: 1 });
      const scale = zoom * Math.min(width / natural.width, fitHeight / natural.height);
      const dpi = Math.min(devicePixelRatio || 1, 2);
      const viewport = source.getViewport({ scale: scale * dpi });
      target.width = Math.ceil(viewport.width);
      target.height = Math.ceil(viewport.height);
      target.style.width = `${viewport.width / dpi}px`;
      task = source.render({ canvas: target, viewport });
      return task.promise.then(() => { if (!stale) setPainted(renderRequest); });
    }).catch(() => { if (!stale) setError("This preview page could not be rendered."); });
    return () => { stale = true; task?.cancel(); };
  }, [renderRequest]);

  return <div className="worksheet-preview">
    <div className="ca-b-preview-bar" role="group" aria-label="PDF preview controls">
      <button type="button" className="ca-icon" aria-label="Previous page" title="Previous page" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
      <span aria-live="polite">Page {page} of {count || "…"}</span>
      <button type="button" className="ca-icon" aria-label="Next page" title="Next page" disabled={page >= count} onClick={() => setPage(page + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
      <button type="button" className="ca-icon" aria-label="Zoom out" title="Zoom out" disabled={zoom <= .5} onClick={() => setZoom(Math.max(.5, zoom - .25))}><Minus size={16} aria-hidden="true" /></button>
      <span aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button type="button" className="ca-icon" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(Math.min(2, zoom + .25))}><Plus size={16} aria-hidden="true" /></button>
      <button type="button" className="ca-icon" aria-label="Fit width" title="Fit width" aria-pressed={!fitPage} onClick={() => { setZoom(1); setFitPage(false); }}><MoveHorizontal size={16} aria-hidden="true" /></button>
      <button type="button" className="ca-icon" aria-label="Fit page" title="Fit page" aria-pressed={fitPage} onClick={() => { setZoom(1); setFitPage(true); }}><Scan size={16} aria-hidden="true" /></button>
    </div>
    <div className="worksheet-paper" data-fit-page={fitPage} ref={host} role="region" aria-label="Worksheet PDF" tabIndex={0}>
      {error && <p role="alert">{error}</p>}
      <canvas ref={canvas} data-painted={painted === renderRequest ? "" : undefined} role="img" aria-label={`PDF preview page ${page}`} />
    </div>
  </div>;
}
