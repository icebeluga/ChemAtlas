"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Region as SourceRegion } from "@/lib/question-source";
import { readPdf } from "./pdf-bank-store";

export function PdfQuestionPage({ page, sourcePage, bankId, bankName, questionNumber=0, cropView=false, highlightLabels=[], sourceAsset, sourceRegions=[] }: { page: number; sourcePage: number; bankId?: string; bankName: string; questionNumber?: number; cropView?: boolean; highlightLabels?: string[]; sourceAsset?: string; sourceRegions?: SourceRegion[] }) {
  const wrap = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false; let task: { destroy: () => void } | undefined;
    async function render() {
      try {
        setBusy(true); setError("");
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const data = bankId && bankId !== "mega" ? await readPdf(bankId) : undefined;
        if (bankId && bankId !== "mega" && !data) throw new Error("This added bank PDF is no longer available in this browser.");
        const docTask = pdfjs.getDocument(data ? { data } : { url: sourceAsset || "/ap-chemistry-mega.pdf", rangeChunkSize: 65536 });
        task = docTask;
        const doc = await docTask.promise as PDFDocumentProxy;
        const pdfPage = await doc.getPage(page);
        if (cancelled || !canvas.current || !wrap.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(2, Math.max(0.6, (wrap.current.clientWidth - 24) / base.width));
        const viewport = pdfPage.getViewport({ scale });
        const scratch = document.createElement("canvas");
        scratch.width = Math.ceil(viewport.width); scratch.height = Math.ceil(viewport.height);
        const scratchContext = scratch.getContext("2d"); const context = canvas.current.getContext("2d");
        if (!scratchContext || !context) throw new Error("Could not display this PDF page.");
        await pdfPage.render({ canvas: scratch, canvasContext: scratchContext, viewport }).promise;
        const text = await pdfPage.getTextContent();
        const items = text.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number; height: number } => "str" in item && "transform" in item);
        const anchors = items.map(item => {
          const point=viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          return { item, x:point[0], y:point[1], text:item.str.trim() };
        });
        let crop={x:0,y:0,width:viewport.width,height:viewport.height};
        const regions = sourceRegions.filter(r=>r.page===sourcePage);
        if (cropView && regions.length) {
          const x0=Math.min(...regions.map(r=>r.rect[0]))*scale;
          const y0=Math.min(...regions.map(r=>r.rect[1]))*scale;
          const x1=Math.max(...regions.map(r=>r.rect[2]))*scale;
          const y1=Math.max(...regions.map(r=>r.rect[3]))*scale;
          crop={x:Math.max(0,x0),y:Math.max(0,y0),width:Math.min(viewport.width,x1)-Math.max(0,x0),height:Math.min(viewport.height,y1)-Math.max(0,y0)};
        }
        canvas.current.width=Math.ceil(crop.width); canvas.current.height=Math.ceil(crop.height);
        canvas.current.style.width=`${Math.ceil(crop.width)}px`; canvas.current.style.height=`${Math.ceil(crop.height)}px`;
        context.drawImage(scratch,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
        for (const label of highlightLabels) {
          const marker=anchors.find(a=>a.text.trim().startsWith(label) && (!regions.length || regions.some(r=>a.x>=r.rect[0]*scale && a.x<=r.rect[2]*scale && a.y>=r.rect[1]*scale && a.y<=r.rect[3]*scale)) && a.y>=crop.y && a.y<=crop.y+crop.height && a.x>=crop.x && a.x<=crop.x+crop.width);
          if (marker) { context.fillStyle="rgba(250, 197, 90, .48)"; context.fillRect(marker.x-crop.x-3,marker.y-crop.y-marker.item.height,marker.item.width+7,marker.item.height+5); }
        }
        if (!cancelled) setBusy(false);
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : "Could not render this source page."); setBusy(false); } }
    }
    void render(); return () => { cancelled = true; task?.destroy(); };
  }, [page, bankId, questionNumber, cropView, sourceAsset, sourcePage, JSON.stringify(sourceRegions), highlightLabels.join("|")]);
  return <div className="pdf-frame" ref={wrap}>
    <div className="pdf-label"><span>PDF SOURCE IMAGE</span><span>{bankName} · original page {sourcePage}</span></div>
    {busy && <div className="pdf-wait">Rendering original page…</div>}
    {cropView && !error && <div className="pdf-crop-note">{sourceRegions.length ? "Source region · full page remains available for surrounding context." : "No reliable crop boundary recorded; showing the full page."}</div>}
    {error ? <div className="pdf-error">{error}</div> : <canvas ref={canvas} aria-label={`${bankName}, page ${sourcePage}`} />}
  </div>;
}
