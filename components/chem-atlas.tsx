"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, FileText, LayoutGrid, LibraryBig, ListChecks, Minus, Plus } from "lucide-react";
import { AtlasButton, DirectoryCard, FilterChip, UnitDirectoryCard } from "./ui/atlas-controls";
import { PracticeBuilder } from "./practice-builder";
import { addEntries, backupSchema, newDraft, newWorksheetId, worksheetStorageKey } from "@/lib/worksheet";
import type { Backup, Region } from "@/lib/worksheet";
import { originalSourcePages, renderSourceCanvas, sourceBounds, sourcePageLocation } from "@/lib/question-source";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Topic = { id: string; name: string };
type SourceRegion = { page: number; rect: number[] };
type Unit = { id: string; name: string; topics: [string, string][] };
type Question = {
  displayTopic?: string; displayName?: string; id: string; type: "MCQ" | "FRQ"; year: string | null; exam: string;
  number: number; pages: number[]; sourcePagesOriginal?: number[]; primaryUnit?: string; unitName?: string;
  primaryTopic?: string | null; topicName?: string | null; secondaryTopics: string[]; relatedTopics?: string[];
  topicParts?: { label: string; topics: string[]; topicNames: string[]; textPreview: string; confidence?: number; rationale?: string }[];
  secondaryTopicNames: string[]; multiConcept: boolean; classificationConfidence: number;
  status: "classified" | "review" | "legacy"; classificationRationale?: string; classificationMethod?: string; legacyConcepts?: string[]; sourceRegions?: SourceRegion[]; sourceAssets?: string[]; evidencePages?: number[]; reviewReason?: string | null; textPreview: string;
  source: string; sourceBank?: string;
};
type Bank = { id: string; name: string; size: number; addedAt: string; pages?: number };
type Attempt = { attempts: number; wrong: number; correct: number; last: string; history: { date: string; result: "correct" | "missed" | "unsure" }[] };
type Saved = { progress: Record<string, Attempt>; overrides: Record<string, string>; banks: Bank[]; questions: Question[]; sessions: number; sourcePages?: number };
type Catalog = { sourceFiles?: {url:string;from:number;to:number}[]; units: Unit[]; questions: Question[]; sourcePages: number; includedSourcePages?: number[]; topicDetails?: Record<string, { description: string; learningObjectives?: string[]; pdfPages?: number[] }>; audit?: { totalPages: number; pagesReferencedByQuestionRecords: number; unreferencedPages: number[]; unresolvedPages: number; classified: number; legacy: number; review: number; coverageNote: string }; stats: Record<string, number> };

const emptySourceFiles: NonNullable<Catalog["sourceFiles"]> = [];
const STORAGE_KEY = "apchem-studio-v2";
const DB_NAME = "apchem-practice-bank";
const STORE = "pdfs";
type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfJsModule: Promise<PdfJsModule> | undefined;
const pdfDocumentCache = new Map<string, Promise<PDFDocumentProxy>>();

async function getPdfDocument(key: string, source: { url: string } | { data: ArrayBuffer }) {
  let cached = pdfDocumentCache.get(key);
  if (!cached) {
    cached = (async () => {
      pdfJsModule ??= import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdfjs = await pdfJsModule;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const loadingTask = pdfjs.getDocument({ ...source, rangeChunkSize: 262144 });
      return await loadingTask.promise as PDFDocumentProxy;
    })();
    pdfDocumentCache.set(key, cached);
    cached.catch(() => pdfDocumentCache.delete(key));
  }
  return cached;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function savePdf(id: string, file: File) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(file, id);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }); db.close();
}
async function readPdf(id: string): Promise<ArrayBuffer | undefined> {
  const db = await openDb();
  const result = await new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly"); const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  }); db.close(); return result?.arrayBuffer();
}

async function openSourcePdf(url = "/ap-chemistry-mega.pdf", bankId?: string) {
  if (!bankId || bankId === "mega") return getPdfDocument(`asset:${url}`, { url });
  const key = `bank:${bankId}`;
  const cached = pdfDocumentCache.get(key);
  if (cached) return cached;
  const data = await readPdf(bankId);
  if (!data) throw new Error("This added bank PDF is no longer available in this browser.");
  return getPdfDocument(key, { data });
}

function PdfQuestionPage({ cropPadding = 10, page, sourcePage, bankId, bankName, questionNumber=0, cropView=false, highlightLabels=[], sourceAsset, sourceRegions=[] }: { cropPadding?: number; page: number; sourcePage: number; bankId?: string; bankName: string; questionNumber?: number; cropView?: boolean; highlightLabels?: string[]; sourceAsset?: string; sourceRegions?: SourceRegion[] }) {
  const frame = useRef<HTMLDivElement>(null); const viewportRef = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null); const activeScale = useRef(1);
  const [renderState, setRenderState] = useState<{key:string;status:"ready"|"error";message?:string}>({key:"",status:"ready"}); const [box, setBox] = useState({width:0,height:0});
  const [fitMode,setFitMode]=useState<"width"|"page"|"actual"|"custom">("width"); const [customScale,setCustomScale]=useState(1); const [renderedScale,setRenderedScale]=useState(1); const [fullscreen,setFullscreen]=useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const regionKey=sourceRegions.map(r=>`${r.page}:${r.rect.join(",")}`).join(";"); const labelKey=highlightLabels.join("|");
  const renderKey=[sourceAsset||"/ap-chemistry-mega.pdf",bankId||"mega",page,sourcePage,cropView?"crop":"full",regionKey,cropPadding].join("|");
  const busy=renderState.key!==renderKey;
  const error=renderState.key===renderKey&&renderState.status==="error"?renderState.message||"Could not render this source page.":"";
  useEffect(()=>{
    const el=viewportRef.current; if(!el)return;
    const observer=new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect)setBox({width:rect.width,height:rect.height});});
    observer.observe(el); return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{const el=viewportRef.current;if(el){el.scrollTop=0;el.scrollLeft=0;}},[page,sourceAsset,sourcePage,regionKey,cropView]);
  useEffect(()=>{
    const handle=()=>setFullscreen(document.fullscreenElement===frame.current);
    document.addEventListener("fullscreenchange",handle); return ()=>document.removeEventListener("fullscreenchange",handle);
  },[]);
  useEffect(()=>{
    const el=viewportRef.current; if(!el)return;
    const onWheel=(event:WheelEvent)=>{
      if ((!event.ctrlKey && !event.metaKey) || document.activeElement !== el) return;
      event.preventDefault();
      const current=activeScale.current || 1; const next=Math.max(.25,Math.min(4,current*(event.deltaY<0?1.12:.89)));
      setCustomScale(next);setFitMode("custom");
    };
    el.addEventListener("wheel",onWheel,{passive:false}); return ()=>el.removeEventListener("wheel",onWheel);
  },[]);
  useEffect(() => {
    let cancelled=false; let renderTask: {cancel:()=>void;promise:Promise<void>}|undefined;
    async function render() {
      if(!box.width||!box.height||!canvas.current)return;
      try {
        const doc = await openSourcePdf(sourceAsset, bankId);
        const pdfPage = await doc.getPage(page); if (cancelled || !canvas.current || !viewportRef.current) return;
        const regions = cropView ? sourceRegions.filter(r => r.page === sourcePage) : [];
        const bounds = sourceBounds(pdfPage, regions, cropPadding);
        const { width, height } = bounds;
        const fitWidth = box.width / width;
        const fitPage = Math.min(fitWidth, box.height / height);
        const scale = Math.min(4, fitMode === "width" ? fitWidth : fitMode === "page" ? fitPage : fitMode === "actual" ? 96 / 72 : customScale);
        activeScale.current=scale;setRenderedScale(scale);
        const cssViewport=pdfPage.getViewport({scale});
        const crop={x:bounds.x*scale,y:bounds.y*scale,width:width*scale,height:height*scale};
        const preferredDpr=Math.min(window.devicePixelRatio||1,2.25);
        const dpr=Math.max(.75,Math.min(preferredDpr,Math.sqrt(24_000_000/(crop.width*crop.height))));
        const target=canvas.current;
        target.style.width=`${crop.width}px`;target.style.height=`${crop.height}px`;
        const context=target.getContext("2d");if(!context)throw new Error("Could not display this PDF page.");
        renderTask = renderSourceCanvas(pdfPage, target, bounds, scale, dpr);
        const textPromise=highlightLabels.length?pdfPage.getTextContent():Promise.resolve(null);
        const [,text]=await Promise.all([renderTask.promise,textPromise]);if(cancelled||!canvas.current)return;
        const anchors=text?text.items.filter((item):item is typeof item&{str:string;transform:number[];width:number;height:number}=>"str" in item&&"transform" in item).map(item=>{
          const point=cssViewport.convertToViewportPoint(item.transform[4],item.transform[5]);return {item,x:point[0],y:point[1],text:item.str.trim()};
        }):[];
        context.setTransform(dpr,0,0,dpr,0,0);
        for(const label of highlightLabels){
          const marker=anchors.find(a=>a.text.startsWith(label)&&a.y>=crop.y&&a.y<=crop.y+crop.height&&a.x>=crop.x&&a.x<=crop.x+crop.width);
          if(marker){const markWidth=marker.item.width*scale;const markHeight=Math.max(8,marker.item.height*scale);context.fillStyle="rgba(250,197,90,.36)";context.fillRect(marker.x-crop.x-3,marker.y-crop.y-markHeight,markWidth+7,markHeight+5);}
        }
        if(!cancelled)setRenderState({key:renderKey,status:"ready"});
      } catch(e){if(!cancelled)setRenderState({key:renderKey,status:"error",message:e instanceof Error?e.message:"Could not render this source page."});}
    }
    void render();return ()=>{cancelled=true;renderTask?.cancel();};
  },[box.width,box.height,page,bankId,questionNumber,cropView,sourceAsset,sourcePage,regionKey,labelKey,fitMode,customScale,cropPadding,renderKey]);
  const setZoom=(factor:number)=>{setCustomScale(Math.max(.25,Math.min(4,activeScale.current*factor)));setFitMode("custom");};
  async function toggleFullscreen() {
    if (!frame.current) return;
    setFullscreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.current.requestFullscreen();
    } catch {
      setFullscreenError("Full-screen viewing is unavailable here. The document remains open below.");
    }
  }
  return <div className="pdf-frame" ref={frame}>
    <div className="pdf-viewer-toolbar" role="group" aria-label="PDF viewing controls">
      <div className="pdf-zoom-group"><button type="button" className="pdf-icon-button" aria-label="Zoom out" title="Zoom out" onClick={()=>setZoom(1/1.2)}><Minus size={16} aria-hidden="true" /></button><span className="pdf-zoom-value" aria-live="polite">{Math.round(renderedScale*100)}%</span><button type="button" className="pdf-icon-button" aria-label="Zoom in" title="Zoom in" onClick={()=>setZoom(1.2)}><Plus size={16} aria-hidden="true" /></button></div>
      <div className="pdf-fit-group" role="group" aria-label="PDF fit mode"><button type="button" aria-pressed={fitMode==="width"} className={fitMode==="width"?"selected":""} onClick={()=>setFitMode("width")}>Fit width</button><button type="button" aria-pressed={fitMode==="page"} className={fitMode==="page"?"selected":""} onClick={()=>setFitMode("page")}>Fit page</button><button type="button" aria-pressed={fitMode==="actual"} className={fitMode==="actual"?"selected":""} onClick={()=>setFitMode("actual")}>Actual size</button></div>
      <button type="button" className="pdf-reset-button" onClick={()=>{setCustomScale(1);setFitMode("width");}}>Reset</button>
      <button type="button" className="pdf-fullscreen-button" aria-pressed={fullscreen} onClick={()=>void toggleFullscreen()}>{fullscreen?"Exit full screen":"Full screen"}</button>
    </div>
    {fullscreenError && <p className="pdf-crop-note" role="status">{fullscreenError}</p>}
    <div className="pdf-label"><span>PDF SOURCE IMAGE</span><span>{bankName} · original page {sourcePage}</span></div>
    {cropView&&!error&&<div className="pdf-crop-note">{sourceRegions.some(r=>r.page===sourcePage)?"Question region · full page remains available for surrounding context.":"No reliable crop boundary recorded; showing the full page."}</div>}
    <div className="pdf-canvas-viewport" ref={viewportRef} role="region" aria-label="Source document" tabIndex={0} aria-busy={busy}>{busy&&<div className="pdf-wait" aria-live="polite"><span className="pdf-spinner"/>Preparing question image…</div>}{error && <div className="pdf-error" role="alert">{error}</div>}<canvas ref={canvas} hidden={!!error||busy} role="img" aria-label={`${bankName}, page ${sourcePage}`} /></div>
  </div>;
}

type View = "desk" | "unit" | "library" | "detail" | "practice" | "progress" | "review" | "banks" | "audit";

export default function ChemAtlas({ builderRoute = false }: { builderRoute?: boolean }) {
  const router = useRouter();
  const [worksheetBackup, setWorksheetBackup] = useState<Backup>();
  useEffect(() => {
    try {
      const parsed = backupSchema.safeParse(JSON.parse(localStorage.getItem(worksheetStorageKey) || "null"));
      if (parsed.success) { setWorksheetBackup(parsed.data); return; }
    } catch { /* a fresh draft remains available when saved storage is unreadable */ }
    const draft = newDraft();
    setWorksheetBackup({ version: 1, active: draft.id, drafts: [draft] });
  }, []);
  function saveWorksheets(next: Backup) {
    setWorksheetBackup(next);
    try { localStorage.setItem(worksheetStorageKey, JSON.stringify(next)); }
    catch { setNotice("Worksheet storage is unavailable. Download a draft backup before leaving this page."); }
  }
  function addToWorksheet(id: string) {
    if (!worksheetBackup) return;
    const active = worksheetBackup.drafts.find(d => d.id === worksheetBackup.active);
    if (!active) return;
    const next = addEntries(active, [id]);
    if (next === active) { setNotice("This question is already on your worksheet."); return; }
    setNotice("Added to your active worksheet.");
    saveWorksheets({ ...worksheetBackup, drafts: worksheetBackup.drafts.map(d => d.id === active.id ? next : d) });
  }
  function worksheetAction(id: string) {
    if (!worksheetBackup) return null;
    const added = worksheetBackup.drafts.find(d => d.id === worksheetBackup.active)?.entries.some(e => e.id === id);
    return <AtlasButton className="worksheet-add" variant={added ? "tertiary" : "secondary"} disabled={added} onClick={() => addToWorksheet(id)}>{added ? "Added to worksheet" : "Add to Worksheet"}</AtlasButton>;
  }
  const [catalog, setCatalog] = useState<Catalog>({ units: [], questions: [], sourcePages: 0, stats: {} });
  const [progress, setProgress] = useState<Record<string, Attempt>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [banks, setBanks] = useState<Bank[]>([{ id: "mega", name: "AP Chemistry MEGA Compiled Test Bank.pdf", size: 0, addedAt: "Bundled source" }]);
  const [sessions, setSessions] = useState(0);
  const [view, setLocalView] = useState<View>("desk");
  const [unitsOpen, setUnitsOpen] = useState(false);
  const unitToggle = useRef<HTMLButtonElement>(null);
  function setView(next: View) {
    setUnitsOpen(false);
    if (builderRoute) router.push(next === "desk" ? "/" : `/?view=${next}`);
    else {
      if (view === "detail" && next !== "detail") {
        const state = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
        const url = new URL(window.location.href); url.search = next === "desk" ? "" : `?view=${encodeURIComponent(next)}`;
        window.history.replaceState({ ...state, chemAtlasView: next }, "", url);
      }
      setLocalView(next);
    }
  }
  function openUnit(id: string) {
    setUnitsOpen(false);
    if (builderRoute) { router.push(`/?view=unit&unit=${encodeURIComponent(id)}`); return; }
    setSelectedUnit(id); setSelectedTopic("all"); setExpandedTopicUnits({ [id]: true }); setLocalView("unit");
  }
  function openReview(kind: string) {
    if (builderRoute) { router.push(`/?view=review&kind=${kind}`); return; }
    setReviewKind(kind); setLocalView("review");
  }
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [selectedTopic, setSelectedTopic] = useState("all");
  const [expandedTopicUnits, setExpandedTopicUnits] = useState<Record<string, boolean>>({});
  const [typeFilter, setTypeFilter] = useState("Mixed");
  const [query, setQuery] = useState("");
  const [resultPage, setResultPage] = useState(0);
  const [reviewKind, setReviewKind] = useState("review");
  const [auditPage, setAuditPage] = useState(1);
  const [includeReview, setIncludeReview] = useState(false);
  const [queue, setQueue] = useState<Question[]>([]); const [index, setIndex] = useState(0);
  const handledQuestionUrl = useRef("");
  const sequenceCounter = useRef(0);
  const [pageIndex, setPageIndex] = useState(0); const [selfResult, setSelfResult] = useState<"correct" | "missed" | "unsure" | null>(null);
  const [imageMode, setImageMode] = useState<"full" | "crop">("crop");
  const [classificationVisible,setClassificationVisible]=useState(true);
  const [work, setWork] = useState(""); const [submitted, setSubmitted] = useState(false);
  const [sessionSize, setSessionSize] = useState(10); const [notice, setNotice] = useState("");
  const [newQuestionPage, setNewQuestionPage] = useState(""); const [newQuestionType, setNewQuestionType] = useState<"MCQ" | "FRQ">("FRQ");
  const [newQuestionNumber, setNewQuestionNumber] = useState(""); const [newQuestionBank, setNewQuestionBank] = useState("mega");
  const [newQuestionTopic, setNewQuestionTopic] = useState(""); const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/questions.json").then(r => r.json()).then(raw => { const data=raw as Catalog; setCatalog(old=>({...data,questions:[...data.questions,...old.questions.filter(q=>q.sourceBank)]})); }).catch(() => setNotice("Question catalog could not be loaded."));
    try {
      if (!sessionStorage.getItem("chematlas-question-sequence-session")) sessionStorage.setItem("chematlas-question-sequence-session", crypto.randomUUID());
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<Saved>;
      const prior = JSON.parse(localStorage.getItem("apchem-studio-v1") || "{}") as { progress?: Record<string, { attempts?: number; wrong?: number; correct?: number; last?: string; history?: { date: string; correct: boolean }[] }> };
      const migrated = Object.fromEntries(Object.entries(prior.progress || {}).map(([id,p]) => [id, {
        attempts:p.attempts || 0, wrong:p.wrong || 0, correct:p.correct || 0, last:p.last || "",
        history:(p.history || []).map(h=>({date:h.date,result:h.correct ? "correct" as const : "missed" as const}))
      }]));
      setProgress({ ...migrated, ...(saved.progress || {}) }); setOverrides(saved.overrides || {}); setSessions(saved.sessions || 0);
      if (saved.banks?.length) setBanks([{ id: "mega", name: "AP Chemistry MEGA Compiled Test Bank.pdf", size: 0, addedAt: "Bundled source" }, ...saved.banks.filter(b => b.id !== "mega")]);
      if (saved.questions?.length) setCatalog(old => ({ ...old, questions: [...old.questions, ...saved.questions!.filter(q => q.sourceBank)] }));
    } catch { /* keep the bundled bank usable if browser storage is damaged */ }
  }, []);
  useEffect(() => { if (catalog.questions.length) localStorage.setItem(STORAGE_KEY, JSON.stringify({ progress, overrides, banks: banks.filter(b => b.id !== "mega"), questions: catalog.questions.filter(q => q.sourceBank), sessions } satisfies Saved)); }, [catalog.questions, progress, overrides, banks, sessions]);

  const current = queue[index];
  const topics = useMemo(() => catalog.units.flatMap(u => u.topics.map(([id, name]) => ({ id, name, unit: u.id, unitName: u.name }))), [catalog.units]);
  const questions = useMemo(() => catalog.questions.map(q => {
    const topic = overrides[q.id] ?? q.primaryTopic ?? undefined;
    const related=overrides[q.id] ? [topic,...(q.relatedTopics || []).filter(id=>id!==q.primaryTopic && id!==topic)] : (q.relatedTopics?.length ? q.relatedTopics : (topic?[topic]:[]));
    return { ...q, status: overrides[q.id] ? "classified" as const : q.status, displayTopic: topic, relatedTopics:related, displayName: topics.find(t => t.id === topic)?.name ?? q.topicName ?? "Needs classification" };
  }), [catalog.questions, overrides, topics]);
  const originalPagesFor = (q: Question) => originalSourcePages(q);
  const locationFor = (q: Pick<Question, "sourceBank">, original: number) => sourcePageLocation(original, catalog.sourceFiles ?? emptySourceFiles, q.sourceBank);
  const pagesFor = (q: Question) => originalPagesFor(q).map(p => locationFor(q, p).page);
  const sourceAssetFor = (q: Question, i: number) => locationFor(q, originalPagesFor(q)[i]).url;
  function primeQuestionPage(q: Question, i = 0) {
    const original = originalPagesFor(q)[i];
    if (!original) return;
    const location = locationFor(q, original);
    void openSourcePdf(location.url, location.bankId).then(doc => doc.getPage(location.page)).catch(() => {});
  }
  useEffect(() => {
    if (builderRoute) return;
    const restore = () => {
      const url = new URL(window.location.href);
      const state = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
      const routeView = url.searchParams.get("view") ?? state.chemAtlasView;
      if (routeView === "detail") {
        const questionId = url.searchParams.get("question") ?? state.chemAtlasQuestion;
        const question = questions.find(q => q.id === questionId);
        if (!question || handledQuestionUrl.current === url.href) return;
        const sequenceKey = url.searchParams.get("sequence") ?? state.chemAtlasSequence;
        let ids: string[] = [];
        try { ids = sequenceKey ? JSON.parse(sessionStorage.getItem(`chematlas-question-sequence:${sequenceKey}`) || "[]") as string[] : []; }
        catch { ids = []; }
        let sequence = ids.map(id => questions.find(q => q.id === id)).filter(q => q !== undefined);
        if (!sequence.length) sequence = questions.filter(q => q.type === question.type).sort((a, b) => (Number(a.year) || Number.MAX_SAFE_INTEGER) - (Number(b.year) || Number.MAX_SAFE_INTEGER) || a.number - b.number || a.id.localeCompare(b.id));
        if (!sequence.some(q => q.id === question.id)) sequence = [...sequence, question];
        const position = Math.max(0, sequence.findIndex(q => q.id === question.id));
        handledQuestionUrl.current = url.href;
        setQueue(sequence); setIndex(position); setPageIndex(0); setImageMode("crop"); setSubmitted(false); setSelfResult(null); setWork(""); setLocalView("detail");
        primeQuestionPage(question);
        if (pagesFor(question).length > 1) primeQuestionPage(question, 1);
        return;
      }
      if (handledQuestionUrl.current === url.href) return;
      handledQuestionUrl.current = url.href;
      const nextView = routeView === "unit" || routeView === "library" || routeView === "audit" || routeView === "progress" || routeView === "banks" || routeView === "review" ? routeView : "desk";
      if (nextView === "unit") {
        const unit = url.searchParams.get("unit") ?? state.chemAtlasUnit ?? "";
        if (/^[uU]?[1-9]$/.test(unit)) { setSelectedUnit(unit); setExpandedTopicUnits({ [unit]: true }); }
      }
      if (nextView === "review") setReviewKind(url.searchParams.get("kind") === "legacy" ? "legacy" : "review");
      setLocalView(nextView);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [builderRoute, questions]);
  const reviewQuestions = questions.filter(q => q.status === "review" || (!q.displayTopic && q.status!=="legacy"));
  const legacyQuestions = questions.filter(q=>q.status==="legacy");
  const reviewList = (reviewKind==="legacy"?legacyQuestions:reviewQuestions).filter(q=>!query || `${q.id} ${q.number} ${q.year} ${q.textPreview} ${q.reviewReason} ${q.legacyConcepts?.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const bankResultsRef = useRef<HTMLDivElement>(null);
  useEffect(()=>setResultPage(0),[selectedUnit,selectedTopic,typeFilter,query,view,reviewKind]);
  useEffect(() => {
    if (bankResultsRef.current) bankResultsRef.current.scrollTop = 0;
  }, [selectedUnit, selectedTopic, typeFilter, query, resultPage, view]);
  const available = questions.filter(q => q.status === "classified" && !!q.displayTopic);
  const attempts = Object.values(progress).reduce((n, p) => n + p.attempts, 0);
  const misses = Object.values(progress).reduce((n, p) => n + p.wrong, 0);
  const mastered = Object.values(progress).filter(p => p.correct >= 3 && p.wrong === 0).length;
  const filteredQuestions = useMemo(() => questions.filter(q => {
    const related=q.relatedTopics || [];
    const matchingUnits=related.map(id=>topics.find(x=>x.id===id)?.unit).filter(Boolean);
    return (includeReview || q.status === "classified") && (selectedUnit === "all" || matchingUnits.includes(selectedUnit)) &&
      (selectedTopic === "all" || related.includes(selectedTopic)) && (typeFilter === "Mixed" || q.type === typeFilter) &&
      (!query || `${q.year} ${q.exam} ${q.number} ${q.textPreview} ${q.displayName}`.toLowerCase().includes(query.toLowerCase()));
  }), [questions, includeReview, selectedUnit, selectedTopic, typeFilter, query, topics]);
  const weakRows = useMemo(() => questions.filter(q => progress[q.id]?.wrong).sort((a,b) => (progress[b.id]?.wrong || 0) - (progress[a.id]?.wrong || 0)), [questions, progress]);
  const weakConcepts = useMemo(() => {
    const counts: Record<string, { id: string; name: string; wrong: number; attempts: number; ids: Set<string> }> = {};
    for (const q of questions) { const p = progress[q.id]; if (!p || !q.displayTopic) continue; const k=q.displayTopic; counts[k] ??= { id:k,name:q.displayName,wrong:0,attempts:0,ids:new Set() }; counts[k].wrong += p.wrong; counts[k].attempts += p.attempts; counts[k].ids.add(q.id); }
    return Object.values(counts).filter(x=>x.wrong).sort((a,b)=>b.wrong-a.wrong);
  }, [questions, progress]);

  function topicFor(q: Question) { return overrides[q.id] ?? q.primaryTopic ?? undefined; }
  function startSession(focus?: string) {
    const pool = questions.filter(q => {
      const topicId=topicFor(q);
      return (includeReview || q.status === "classified") &&
        (focus === "weak" ? (progress[q.id]?.wrong || 0) > 0 : !focus || (q.relatedTopics||[]).includes(focus)) &&
        (selectedUnit === "all" || (q.relatedTopics||[]).some(id=>topics.find(t=>t.id===id)?.unit===selectedUnit)) &&
        (selectedTopic === "all" || (q.relatedTopics||[]).includes(selectedTopic)) &&
        (typeFilter === "Mixed" || q.type === typeFilter);
    });
    const shuffled = [...pool].sort(() => Math.random() - .5).slice(0, sessionSize);
    setQueue(shuffled); setIndex(0); setPageIndex(0); setSelfResult(null); setWork(""); setSubmitted(false); setImageMode("crop"); if(shuffled[0])primeQuestionPage(shuffled[0]); setView("practice"); setSessions(s => s + (shuffled.length ? 1 : 0));
    if (!shuffled.length) setNotice("No matched questions fit those filters yet. Check Review or change the topic/type."); else setNotice("");
  }
  function markSelfCheck(result: "correct" | "missed" | "unsure") {
    if (!current || !submitted) return;
    const date = new Date().toISOString().slice(0,10);
    setProgress(old => { const p = old[current.id] || { attempts:0, wrong:0, correct:0, last:"", history:[] }; return { ...old, [current.id]: { attempts:p.attempts+1, wrong:p.wrong+(result === "missed" ? 1 : 0), correct:p.correct+(result === "correct" ? 1 : 0), last:date, history:[...p.history,{ date, result }] } }; });
    setSelfResult(result);
  }
  function nextQuestion() { if (index + 1 >= queue.length) { setView("progress"); return; } primeQuestionPage(queue[index+1]); setIndex(index+1); setPageIndex(0); setSelfResult(null); setWork(""); setSubmitted(false); }
  function reviewSession(topic?: string) { if (topic) { const ids = questions.filter(q => topicFor(q) === topic && progress[q.id]?.wrong).map(q=>q.id); setQueue(questions.filter(q=>ids.includes(q.id))); setIndex(0); setView("practice"); setPageIndex(0); setSubmitted(false); setSelfResult(null); setWork(""); } else startSession("weak"); }
  async function importPdf(file?: File) {
    if (!file) return; if (!file.name.toLowerCase().endsWith(".pdf")) { setNotice("Choose a PDF test bank."); return; }
    setUploading(true);
    try {
      const id = `bank-${newWorksheetId()}`; await savePdf(id, file);
      const bank = { id, name:file.name, size:file.size, addedAt:new Date().toISOString() };
      setBanks(old => [...old,bank]); setNewQuestionBank(id); setNotice(`${file.name} is saved. Add page references below to put its questions into your catalog.`);
    } catch { setNotice("The PDF could not be saved in this browser. Check available storage and try again."); }
    finally { setUploading(false); }
  }
  function addSourceQuestion() {
    const page = Number(newQuestionPage); const number = Number(newQuestionNumber); const bank = banks.find(b=>b.id===newQuestionBank);
    if (!bank || !Number.isInteger(page) || page < 1 || !Number.isInteger(number) || number < 1 || !newQuestionTopic) { setNotice("Add a valid source page, question number, and primary topic."); return; }
    const topic = topics.find(t=>t.id===newQuestionTopic)!; const id=`manual-${newQuestionBank}-${page}-${number}-${Date.now()}`;
    const q: Question = { id, type:newQuestionType, year:null, exam:"Added source bank", number, pages:[page], primaryUnit:topic.unit, unitName:topic.unitName, primaryTopic:topic.id, topicName:topic.name, secondaryTopics:[], secondaryTopicNames:[], multiConcept:false, classificationConfidence:1, status:"classified", textPreview:"Manually indexed source page. Open the page image to verify the question and topic.", source:bank.name, sourceBank:newQuestionBank };
    setCatalog(c=>({...c,questions:[...c.questions,q]})); setShowAddQuestion(false); setNewQuestionPage(""); setNewQuestionNumber(""); setNotice("Question added. Progress and existing questions were preserved.");
  }
  function updateClassification(q: Question, value: string) { setOverrides(old=>({...old,[q.id]:value})); setNotice("Topic assignment saved."); }
  function addReviewItem(q: Question) { setOverrides(old=>({...old,[q.id]:old[q.id] || ""})); }
  function openQuestion(q: Question, sourceSequence: Question[] = filteredQuestions) {
    const sequence = Array.from(new Map([...sourceSequence, q].map(item => [item.id, item])).values());
    const sessionKey = sessionStorage.getItem("chematlas-question-sequence-session") || "session";
    const sequenceKey = `${sessionKey}-${++sequenceCounter.current}`;
    const state = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    try { sessionStorage.setItem(`chematlas-question-sequence:${sequenceKey}`, JSON.stringify(sequence.map(item => item.id))); }
    catch { /* the current in-memory sequence remains navigable if session storage is unavailable */ }
    window.history.replaceState({ ...state, chemAtlasView: view, chemAtlasUnit: selectedUnit, chemAtlasTopic: selectedTopic, chemAtlasType: typeFilter, chemAtlasQuery: query, chemAtlasReviewKind: reviewKind }, "", window.location.href);
    const url = new URL(window.location.href);
    url.searchParams.set("view", "detail"); url.searchParams.set("question", q.id); url.searchParams.set("sequence", sequenceKey);
    window.history.pushState({ ...state, chemAtlasView: "detail", chemAtlasQuestion: q.id, chemAtlasSequence: sequenceKey, chemAtlasReturnView: view }, "", url);
    handledQuestionUrl.current = url.href;
    const position = sequence.findIndex(item => item.id === q.id);
    setQueue(sequence); setIndex(Math.max(0, position)); setPageIndex(0); setImageMode("crop"); setSubmitted(false); setSelfResult(null); setWork(""); setLocalView("detail");
    primeQuestionPage(q); if (pagesFor(q).length > 1) primeQuestionPage(q, 1);
  }
  function navigateDetail(delta: -1 | 1) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= queue.length) return;
    const next = queue[nextIndex];
    const state = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    const sequenceKey = String(state.chemAtlasSequence ?? new URL(window.location.href).searchParams.get("sequence") ?? "");
    const url = new URL(window.location.href);
    url.searchParams.set("view", "detail"); url.searchParams.set("question", next.id);
    if (sequenceKey) url.searchParams.set("sequence", sequenceKey);
    window.history.pushState({ ...state, chemAtlasView: "detail", chemAtlasQuestion: next.id, chemAtlasSequence: sequenceKey || undefined }, "", url);
    handledQuestionUrl.current = url.href;
    primeQuestionPage(next); if (pagesFor(next).length > 1) primeQuestionPage(next, 1);
    setIndex(nextIndex); setPageIndex(0); setSelfResult(null); setWork(""); setSubmitted(false); setLocalView("detail");
  }
  function returnToQuestionList() {
    const state = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    if (state.chemAtlasReturnView) { window.history.back(); return; }
    const url = new URL(window.location.href); url.search = "?view=library";
    window.history.replaceState({ ...state, chemAtlasView: "library" }, "", url);
    handledQuestionUrl.current = url.href; setLocalView("library");
  }
  useEffect(() => {
    if (view !== "detail") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || target?.isContentEditable || (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) || target?.closest(".pdf-canvas-viewport")) return;
      if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); navigateDetail(-1); }
      if (event.key === "ArrowRight" && index < queue.length - 1) { event.preventDefault(); navigateDetail(1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, index, queue]);
  function partsForTopic(q: Question, topicId?: string) { return (q.topicParts||[]).filter(part=>!topicId || part.topics.includes(topicId)); }

  const bankName = (id?: string) => banks.find(b=>b.id===(id || "mega"))?.name || "AP Chemistry MEGA Compiled Test Bank.pdf";
  const mainTopicQuestionCounts = (id: string) => available.filter(q => (q.relatedTopics||[]).includes(id)).length;
  const pageTitle = view === "desk" ? "Browse by unit" : view === "library" ? "Browse by topic" : view === "detail" ? "Question details" : view === "practice" ? "Practice session" : view === "progress" ? "Progress & patterns" : view === "review" ? "Classification review" : view === "audit" ? "Source page audit" : "Manage test banks";

  return <div className="shell">
    <div className={`app-shell${view === "library" ? " bank-active" : ""}`}>
    <header className="sidebar atlas-nav">
      <a href="#main-content" className="atlas-skip">Skip to content</a>
      <button className="brand" onClick={()=>setView("desk")} aria-label="ChemAtlas, AP Chemistry Studio"><div className="brandmark" aria-hidden="true"><span className="brandmark-ap">CA</span><span className="brandmark-star">✦</span></div><div className="brand-wordmark"><strong>ChemAtlas</strong><small>AP Chemistry Studio</small></div></button>
      <nav className="top-navigation" aria-label="Primary navigation">
          <div className="nav-cluster" aria-label="Question library">
          <div className="nav-unit-menu" onPointerEnter={e => { if (e.pointerType === "mouse") setUnitsOpen(true); }}
            onPointerLeave={e => { if (e.pointerType === "mouse" && !e.currentTarget.contains(document.activeElement)) setUnitsOpen(false); }}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setUnitsOpen(false); }}
            onKeyDown={e => { if (e.key === "Escape" && unitsOpen) { setUnitsOpen(false); unitToggle.current?.focus(); } }}>
            <button className={`nav nav-units-trigger${!builderRoute && (view === "desk" || view === "unit") ? " active" : ""}`} onClick={()=>setView("desk")} aria-current={!builderRoute && (view === "desk" || view === "unit") ? "page" : undefined}><BookOpen size={16} aria-hidden="true" />Browse by unit</button>
            <button ref={unitToggle} type="button" className="atlas-unit-toggle" aria-label="Choose a unit" aria-expanded={unitsOpen} aria-controls="atlas-unit-dropdown" onClick={()=>setUnitsOpen(open=>!open)}><ChevronDown size={16} aria-hidden="true" /></button>
            <div className="nav-unit-dropdown" id="atlas-unit-dropdown" hidden={!unitsOpen}>
              <button className="nav-unit-all" onClick={()=>{setSelectedUnit("all");setSelectedTopic("all");setView("desk");}}><b>All units</b><span>Course overview</span></button>
              <div className="nav-unit-grid">{catalog.units.map((unit,i)=><button key={unit.id} onClick={()=>{openUnit(unit.id);}}><b>UNIT {i+1}</b><span>{unit.name}</span></button>)}</div>
            </div>
          </div>
          <button className={`nav nav-bank ${view === "library" ? "active" : ""}`} onClick={()=>setView("library")} aria-current={view === "library" ? "page" : undefined}><LibraryBig size={16} aria-hidden="true" />Question bank</button>
          <a className={`nav nav-builder ${builderRoute ? "active" : ""}`} href="/practice-builder" aria-current={builderRoute ? "page" : undefined}><FileText size={16} aria-hidden="true" />Practice Builder</a>
        </div>
        <span className="nav-divider" aria-hidden="true"/>
        <details className="nav-tools">
          <summary aria-label="Tools"><LayoutGrid size={16} aria-hidden="true" /><span className="tools-label">Tools</span><ChevronDown className="tools-chevron" size={14} aria-hidden="true" /></summary>
          <div className="nav-menu-panel">
            <button className={view === "progress" ? "selected" : ""} onClick={e=>{setView("progress");e.currentTarget.closest("details")?.removeAttribute("open");}} aria-current={view === "progress" ? "page" : undefined}><span>↗</span>Progress</button>
            <button className={view === "review" && reviewKind !== "legacy" ? "selected" : ""} onClick={e=>{openReview("review");e.currentTarget.closest("details")?.removeAttribute("open");}} aria-current={view === "review" && reviewKind !== "legacy" ? "page" : undefined}><span>⌕</span>Review queue<i>{reviewQuestions.length}</i></button>
            <button className={view === "audit" ? "selected" : ""} onClick={e=>{setView("audit");e.currentTarget.closest("details")?.removeAttribute("open");}}><span>▧</span>Source page audit<i>{catalog.audit?.unresolvedPages || 0}</i></button>
            <button className={view === "review" && reviewKind === "legacy" ? "selected" : ""} onClick={e=>{openReview("legacy");e.currentTarget.closest("details")?.removeAttribute("open");}}><span>▧</span>Legacy content<i>{legacyQuestions.length}</i></button>
            <button onClick={e=>{setView("banks");e.currentTarget.closest("details")?.removeAttribute("open");}}><span>＋</span>Add a test bank</button>
          </div>
        </details>
      </nav>
      <div className="sidebar-bottom"><div className="profile"><div className="avatar">J</div><div><b>Study profile</b><small>Progress saved here</small></div></div></div>
    </header>
    <main className="main" id="main-content" tabIndex={-1}>
      {notice && <div className="notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={()=>setNotice("")}>×</button></div>}
      {builderRoute ? worksheetBackup ? <PracticeBuilder
        questions={questions} topics={topics} files={catalog.sourceFiles ?? emptySourceFiles}
        progress={progress} backup={worksheetBackup} save={saveWorksheets} openPdf={openSourcePdf}
        renderSource={(q, region: Region) => {
          const location = locationFor(q, region.page);
          return <PdfQuestionPage page={location.page} sourcePage={region.page} bankId={location.bankId}
            bankName={q.source} sourceAsset={location.url} cropView={!!region.rect.length} cropPadding={0} sourceRegions={[region]} />;
        }}
      /> : <div className="page" role="status">Loading Practice Builder…</div> : <>

      {view === "desk" && <div className="page dashboard-page">
        <section className="dashboard-heading"><div><h1>Browse by unit</h1><p>Choose a College Board unit to explore its topics and original questions.</p></div></section>
        <div className="stats catalog-stats atlas-metrics">
          <div className="stat atlas-metric--brand"><span className="stat-icon"><LibraryBig size={18} aria-hidden="true" /></span><div><small>QUESTION RECORDS</small><b>{questions.length.toLocaleString()}</b></div></div>
          <div className="stat atlas-metric--blue"><span className="stat-icon"><BookOpen size={18} aria-hidden="true" /></span><div><small>CURRICULUM TOPICS</small><b>{topics.length}</b></div></div>
          <div className="stat atlas-metric--amber"><span className="stat-icon"><ListChecks size={18} aria-hidden="true" /></span><div><small>TOTAL MCQs</small><b>{questions.filter(q=>q.type==="MCQ").length.toLocaleString()}</b></div></div>
          <div className="stat atlas-metric--teal"><span className="stat-icon"><FileText size={18} aria-hidden="true" /></span><div><small>TOTAL FRQs</small><b>{questions.filter(q=>q.type==="FRQ").length.toLocaleString()}</b></div></div>
        </div>
        <div className="section-head topic-head"><div><div className="eyebrow">COLLEGE BOARD COURSE FRAMEWORK</div><h2>All nine units</h2></div></div>
        <div className="unit-grid">{catalog.units.map((u,i)=>{const count=available.filter(q=>(q.relatedTopics||[]).some(id=>topics.find(t=>t.id===id)?.unit===u.id)).length;return <UnitDirectoryCard key={u.id} unit={i+1} label={`Unit ${i+1}`} title={u.name} onClick={()=>openUnit(u.id)}>{u.topics.length} topics · {count.toLocaleString()} classified questions</UnitDirectoryCard>})}</div>
        <div className="footnote">Question images are rendered from the original PDF pages. Topic assignments include a reasoning note. Legacy material and unresolved source items are kept separately. <a href="/classification-method.md" target="_blank" rel="noreferrer">Read the classification method</a> · <a href="/page-audit.json" target="_blank" rel="noreferrer">Source coverage audit</a></div>
      </div>}

      {view === "unit" && <div className="page unit-detail-page">
        {(()=>{const unit=catalog.units.find(u=>u.id===selectedUnit);if(!unit)return <div className="empty-state"><b>Choose a unit</b><button className="outline" onClick={()=>setView("desk")}>Back to all units</button></div>;const unitIndex=catalog.units.findIndex(u=>u.id===unit.id)+1;const unitTopics=topics.filter(t=>t.unit===unit.id);const unitQuestions=available.filter(q=>(q.relatedTopics||[]).some(id=>unitTopics.some(t=>t.id===id)));return <>
          <button className="back unit-back" onClick={()=>setView("desk")}>← All units</button>
          <div className="unit-detail-heading"><div><span className={`unit-no u${unitIndex}`}>UNIT {unitIndex}</span><h1 className="page-title">{unit.name}</h1><p className="muted">Choose a topic to browse its original AP Chemistry questions.</p></div><button className="primary" onClick={()=>{setSelectedTopic("all");setExpandedTopicUnits({[unit.id]:true});setView("library");}}>View unit questions <span>→</span></button></div>
          <div className="unit-detail-stats"><span><b>{unitTopics.length}</b> topics</span><span><b>{unitQuestions.length.toLocaleString()}</b> classified questions</span></div>
          <div className="unit-topic-page-grid">{unitTopics.map(topic=><DirectoryCard key={topic.id} label={topic.id} title={topic.name} onClick={()=>{setSelectedUnit(unit.id);setSelectedTopic(topic.id);setExpandedTopicUnits({[unit.id]:true});setView("library");}}>{mainTopicQuestionCounts(topic.id).toLocaleString()} questions</DirectoryCard>)}</div>
        </>;})()}
      </div>}

      {view === "library" && <div className="page bank-page">
        <div className="bank-fixed">
        <h1 className="page-title">Question bank</h1><p className="muted">Filter by unit, topic, type, or keyword. Multi-concept FRQs appear under each matched topic.</p>
        <div className="library-filters"><label>UNIT<select value={selectedUnit} onChange={e=>{const unit=e.target.value;setSelectedUnit(unit);setSelectedTopic("all");setExpandedTopicUnits(unit==="all"?{}:{[unit]:true});}}><option value="all">All units</option>{catalog.units.map(u=><option key={u.id} value={u.id}>{u.id.toUpperCase()} · {u.name}</option>)}</select></label><label>TOPIC<select value={selectedTopic} onChange={e=>{const topic=e.target.value;setSelectedTopic(topic);const unit=topics.find(t=>t.id===topic)?.unit;if(unit)setExpandedTopicUnits(prev=>({...prev,[unit]:true}));}}><option value="all">All topics</option>{topics.filter(t=>selectedUnit==="all"||t.unit===selectedUnit).map(t=><option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></label><label>TYPE<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option>Mixed</option><option>MCQ</option><option>FRQ</option></select></label><label className="search-label">SEARCH<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Year, question number, keyword"/></label></div>
        {(selectedUnit!=="all"||selectedTopic!=="all"||typeFilter!=="Mixed"||query) && <div className="atlas-filter-chips" role="group" aria-label="Active filters">
          {query && <FilterChip label={query} onRemove={()=>setQuery("")} />}
          {selectedUnit!=="all" && <FilterChip label={catalog.units.find(u=>u.id===selectedUnit)?.name ?? selectedUnit} onRemove={()=>{setSelectedUnit("all");setSelectedTopic("all");setExpandedTopicUnits({});}} />}
          {selectedTopic!=="all" && <FilterChip label={`${selectedTopic} · ${topics.find(t=>t.id===selectedTopic)?.name ?? "Topic"}`} onRemove={()=>setSelectedTopic("all")} />}
          {typeFilter!=="Mixed" && <FilterChip label={typeFilter} onRemove={()=>setTypeFilter("Mixed")} />}
          <AtlasButton variant="ghost" onClick={()=>{setSelectedUnit("all");setSelectedTopic("all");setTypeFilter("Mixed");setQuery("");setExpandedTopicUnits({});setResultPage(0);}}>Clear filters</AtlasButton>
        </div>}
        </div>
        <div className="library-results-head"><b>{selectedTopic==="all"?(selectedUnit==="all"?"All classified questions":`${catalog.units.find(u=>u.id===selectedUnit)?.name} · all topics`):`${selectedTopic} · ${topics.find(t=>t.id===selectedTopic)?.name}`}</b><span role="status" aria-live="polite">{filteredQuestions.length.toLocaleString()} catalog entries · uncertain matches are in Review</span></div>
        <div className="bank-results-scroll" ref={bankResultsRef} role="region" aria-label="Question bank results" tabIndex={0}>
        {selectedTopic!=="all" && catalog.topicDetails?.[selectedTopic] && <div className="topic-definition"><b>{selectedTopic} · {topics.find(t=>t.id===selectedTopic)?.name}</b><p>{catalog.topicDetails[selectedTopic].description}</p><small>College Board CED · learning objectives {catalog.topicDetails[selectedTopic].learningObjectives?.join(", ") || "see curriculum reference"}</small></div>}
        <div className="question-list">{filteredQuestions.slice(resultPage*50,(resultPage+1)*50).map(q=>{
          const context = topics.find(t=>t.id===selectedTopic) ?? topics.find(t=>t.id===q.displayTopic);
          const original = originalPagesFor(q);
          const relevantParts = partsForTopic(q,selectedTopic==="all" ? undefined : selectedTopic);
          const secondary = (q.relatedTopics||[]).filter(id=>id!==q.displayTopic).map(id=>topics.find(t=>t.id===id)).filter(Boolean);
          return <article className="catalog-row atlas-result" key={q.id}>
            <div className="atlas-result-head">
              <span className={`type-chip ${q.type.toLowerCase()}`}>{q.type}</span>
              <div className="atlas-result-identity"><h2>{q.year || "Added bank"} · Question {q.number}</h2>
                <p>{q.exam} · Original PDF {original.length===1 ? `page ${original[0]}` : `pages ${original[0]}–${original.at(-1)}`}</p>
              </div>
              <AtlasButton variant="ghost" onPointerEnter={()=>primeQuestionPage(q)} onFocus={()=>primeQuestionPage(q)} onClick={()=>openQuestion(q,filteredQuestions)} aria-label={`View question ${q.number} · ${q.exam}`}>View question <span aria-hidden="true">↗</span></AtlasButton>
            </div>
            <div className="atlas-result-body">
              {context && <p><strong>{context.id===q.displayTopic ? "Primary topic" : "Also filed under"}</strong> · <b className="atlas-topic-code">{context.id}</b> {context.name}</p>}
              {!relevantParts.length && q.textPreview && <p className="preview-line">{q.textPreview}</p>}
              <div className="atlas-result-actions">{worksheetAction(q.id)}{q.status==="review" && <span className="atlas-chip atlas-tone-review">Needs topic review</span>}{!!relevantParts.length && <span>{relevantParts.length} mapped {relevantParts.length===1 ? "part" : "parts"}</span>}</div>
              <details className="atlas-result-classification">
                <summary>Classification details</summary>
                <p>{q.displayTopic ? `Primary topic · ${q.displayTopic} ${q.displayName ?? ""}` : "Topic unassigned"}</p>
                {!!secondary.length && <p>Secondary topics · {secondary.map(t=>`${t!.id} ${t!.name}`).join(" · ")}</p>}
                {!!relevantParts.length && <ul>{relevantParts.map((part,i)=><li key={`${part.label}-${i}`}><strong>{part.label}</strong> {part.textPreview}</li>)}</ul>}
              </details>
            </div>
          </article>;
        })}{filteredQuestions.length>50&&<div className="catalog-pagination"><button className="outline" disabled={resultPage===0} onClick={()=>setResultPage(p=>p-1)}>← Previous</button><span>Page {resultPage+1} of {Math.ceil(filteredQuestions.length/50)}</span><button className="outline" disabled={(resultPage+1)*50>=filteredQuestions.length} onClick={()=>setResultPage(p=>p+1)}>Next →</button></div>}{!filteredQuestions.length&&<div className="empty-state"><span>⌕</span><b>No classified questions in this view</b><p>Try another topic, or see uncertain matches in the Review section.</p><button className="outline" onClick={()=>setView("review")}>Open classification review</button></div>}</div>
        <div className="curriculum-note"><b>Curriculum source</b> · AP Chemistry Course and Exam Description, College Board. Topic codes and names follow its nine-unit framework.</div>
        </div>
      </div>}

      {view === "detail" && current && <div className="page detail-page">
        <header className="detail-toolbar"><button className="back" onClick={returnToQuestionList}>← Back to list</button><div><div className="eyebrow">{current.exam}</div><h1 className="page-title">{current.type} {current.number}{current.year?` · ${current.year}`:""}</h1></div><div className="atlas-detail-badges"><span className={`type-chip ${current.type.toLowerCase()}`}>{current.type}</span><span className={`atlas-chip atlas-tone-${current.status==="review"?"review":current.status==="legacy"?"info":"classification"}`}>{current.status==="review"?"Needs topic review":current.status==="legacy"?"Legacy content":"Classified"}</span></div></header>
        <nav className="question-sequence-nav" aria-label="Question sequence">
          <button type="button" className="question-sequence-button" onClick={()=>navigateDetail(-1)} disabled={index===0} aria-label="Previous question"><ArrowLeft size={16} aria-hidden="true"/><span>Previous</span></button>
          <span className="question-sequence-position" aria-live="polite">Question <b>{index+1}</b> of {queue.length}</span>
          <button type="button" className="question-sequence-button" onClick={()=>navigateDetail(1)} disabled={index>=queue.length-1} aria-label="Next question"><span>Next</span><ArrowRight size={16} aria-hidden="true"/></button>
        </nav>
        <div className={`detail-workspace${classificationVisible?"":" summary-collapsed"}`}>
          <section className="panel detail-image-panel"><div className="detail-image-heading"><div><div className="eyebrow">SOURCE IMAGE</div><h2>Question as printed</h2></div>{worksheetAction(current.id)}<div className="detail-image-actions"><button className="classification-toggle" type="button" aria-expanded={classificationVisible} aria-controls="detail-classification" onClick={()=>setClassificationVisible(v=>!v)}>{classificationVisible?"Hide classification":"Show classification"}</button><div className="image-mode-tabs" role="group" aria-label="Source image view"><button type="button" aria-pressed={imageMode==="crop"} className={imageMode==="crop"?"selected":""} onClick={()=>setImageMode("crop")}>Question crop</button><button type="button" aria-pressed={imageMode==="full"} className={imageMode==="full"?"selected":""} onClick={()=>setImageMode("full")}>Full page</button></div></div></div>
            {pagesFor(current).length>1&&<div className="pdf-tabs" role="group" aria-label="Question source pages">{pagesFor(current).map((pg,i)=><button type="button" key={pg} aria-pressed={pageIndex===i} className={pageIndex===i?"selected":""} onClick={()=>setPageIndex(i)}>{`Page ${i+1} · `}Original {originalPagesFor(current)[i]}</button>)}</div>}
            <PdfQuestionPage page={pagesFor(current)[pageIndex]} sourcePage={originalPagesFor(current)[pageIndex]} bankId={current.sourceBank||"mega"} bankName={bankName(current.sourceBank)} sourceAsset={sourceAssetFor(current,pageIndex)} sourceRegions={current.sourceRegions} questionNumber={current.number} cropView={imageMode==="crop"} highlightLabels={partsForTopic(current,selectedTopic!=="all"&&current.relatedTopics?.includes(selectedTopic)?selectedTopic:undefined).map(p=>p.label)} />
          </section>
          <aside className="detail-summary panel" id="detail-classification">
            <div className="detail-summary-block"><span className="detail-label">PRIMARY TOPIC</span><b>{current.displayTopic?`${current.displayTopic} · ${current.displayName}`:"Needs classification"}</b></div>
            {(current.relatedTopics||[]).filter(id=>id!==current.displayTopic).length>0&&<div className="detail-summary-block"><span className="detail-label">ALSO FILED UNDER</span><div className="detail-chip-list">{(current.relatedTopics||[]).filter(id=>id!==current.displayTopic).map(id=>{const t=topics.find(x=>x.id===id);return t?<span className="secondary-tag" key={id}>{t.unit.toUpperCase()} · {t.id} · {t.name}</span>:null;})}</div></div>}
            <div className="detail-summary-block"><span className="detail-label">TOPIC MAPPING</span>{partsForTopic(current,selectedTopic!=="all"&&current.relatedTopics?.includes(selectedTopic)?selectedTopic:undefined).length?<div className="detail-part-list">{partsForTopic(current,selectedTopic!=="all"&&current.relatedTopics?.includes(selectedTopic)?selectedTopic:undefined).map((part,i)=><div className="detail-part compact-part" key={`${part.label}-${i}`}><mark>{part.label}</mark><p>{part.rationale||part.textPreview}</p><small>{part.topicNames.join(" · ")}</small></div>)}</div>:<p className="detail-summary-note">Whole-question match · open the source image to inspect the prompt.</p>}</div>
            {current.classificationRationale&&<details className="detail-evidence"><summary>Classification evidence</summary><p>{current.classificationRationale}</p><small>{current.classificationMethod||"Question-content review"}{current.evidencePages?.length?` · supporting bank pages ${current.evidencePages.join(", ")}`:""}</small>{!!current.legacyConcepts?.length&&<p><b>Legacy concepts:</b> {current.legacyConcepts.join(", ")}</p>}</details>}
            <div className="detail-quick-facts"><span>{current.type==="FRQ"?"Free response":"Multiple choice"}</span><span>{current.year||"Year unknown"}</span><span>Question {current.number}</span><span>{originalPagesFor(current).length===1?`PDF page ${originalPagesFor(current)[0]}`:`PDF pages ${originalPagesFor(current).join(", ")}`}</span><span>{bankName(current.sourceBank)}</span></div>
          </aside>
        </div>
      </div>}

      {view === "practice" && current && <div className="page practice-page"><div className="session-top"><button className="back" onClick={()=>setView("desk")}>← Exit session</button>{worksheetAction(current.id)}<span className="session-count">QUESTION {index+1} <i>/</i> {queue.length}</span></div><div className="progress-line" role="progressbar" aria-label="Practice session progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((index+(submitted?1:0))/queue.length)*100)}><i style={{width:`${((index+(submitted?1:0))/queue.length)*100}%`}}/></div><div className="question-meta"><span className={`type-chip ${current.type.toLowerCase()}`}>{current.type==="MCQ"?"MULTIPLE CHOICE":"FREE RESPONSE"}</span><span>{current.displayTopic ? `${current.displayTopic} · ${current.displayName}` : "Needs topic review"}</span><span>·</span><span>{current.year || current.exam}</span></div>
        <div className="question-card source-question"><div className="source-question-head"><div><div className="eyebrow">ORIGINAL QUESTION PAGE</div><h2>{current.year || "Source bank"} · {current.type} {current.number}</h2><p>Exact page image from <b>{bankName(current.sourceBank)}</b></p></div><div className="source-view-controls"><span className="source-page-count">{pageIndex+1} / {pagesFor(current).length} source page{pagesFor(current).length===1?"":"s"}</span><div className="image-mode-tabs" role="group" aria-label="Source image view"><button type="button" aria-pressed={imageMode==="crop"} className={imageMode==="crop"?"selected":""} onClick={()=>setImageMode("crop")}>Crop</button><button type="button" aria-pressed={imageMode==="full"} className={imageMode==="full"?"selected":""} onClick={()=>setImageMode("full")}>Full page</button></div></div></div>
        {pagesFor(current).length>1&&<div className="pdf-tabs" role="group" aria-label="Question source pages">{pagesFor(current).map((pg,i)=><button type="button" key={pg} aria-pressed={pageIndex===i} className={pageIndex===i?"selected":""} onClick={()=>setPageIndex(i)}>Original page {originalPagesFor(current)[i]}</button>)}</div>}
        <PdfQuestionPage page={pagesFor(current)[pageIndex]} sourcePage={originalPagesFor(current)[pageIndex]} bankId={current.sourceBank || "mega"} bankName={bankName(current.sourceBank)} sourceAsset={sourceAssetFor(current,pageIndex)} sourceRegions={current.sourceRegions} cropView={imageMode==="crop"} highlightLabels={partsForTopic(current).map(p=>p.label)} />
        {!submitted ? <div className="response-panel"><label htmlFor="work"><b>Your work / answer</b><span>Write your response here before submitting. The source image remains answer-free.</span></label><textarea id="work" value={work} onChange={e=>setWork(e.target.value)} placeholder={current.type==="FRQ"?"Show your reasoning, equations, units, and conclusion…":"Record your selected letter and a brief reason…"}/><div className="submit-row"><span>When ready, record your self-check. No answer is guessed or revealed.</span><button className="primary" onClick={()=>{if(!work.trim())setNotice("Add your answer or reasoning before submitting.");else setSubmitted(true);}}>Submit response <span>→</span></button></div></div> : <div className="feedback"><div className="eyebrow">SELF-CHECK & REFLECTION</div><div className="feedback-banner review-feedback"><b>Response saved</b><span>This source question is indexed to the PDF page. A verified answer key is not linked to this question record, so the site will not invent one.</span></div><div className="self-check-row" role="group" aria-label="Self-assess your response"><span>How did it go?</span>{(["correct","missed","unsure"] as const).map(r=><button key={r} type="button" aria-pressed={selfResult===r} disabled={!!selfResult} className={`self-check ${selfResult===r?"selected":""}`} onClick={()=>markSelfCheck(r)}>{r==="correct"?"Got it":r==="missed"?"Missed it":"Not sure"}</button>)}</div>{selfResult==="missed"&&<div className="guided-review"><b>Step-by-step mistake review</b><ol><li>Restate what the prompt asks you to determine, explain, calculate, or represent.</li><li>Identify the AP Chemistry unit/topic and the rule, relationship, or representation it requires.</li><li>Check your setup: species and charges, balanced atoms, units, significant figures, and signs where relevant.</li><li>Compare each step with the official scoring guide in the source bank; mark the exact step where your reasoning changed.</li></ol><p>The compiled bank’s scoring guides are retained in the PDF, but are not yet linked to individual indexed questions.</p></div>}{selfResult&&<button className="primary submit-btn" onClick={nextQuestion}>{index+1===queue.length?"Finish session":"Next question"}<span>→</span></button>}</div>}
        <div className="question-foot"><span>Primary topic: <b>{current.displayName}</b></span>{current.multiConcept&&<span className="multi-tag">MULTI-CONCEPT FRQ</span>}{current.secondaryTopicNames?.map(n=><span className="secondary-tag" key={n}>Also: {n}</span>)}<span className="source-note">Source: {bankName(current.sourceBank)} · original page {originalPagesFor(current)[pageIndex]}</span></div></div></div>}
      {view === "practice" && !current && <div className="page narrow"><div className="empty-state"><span>✦</span><b>No questions in this session</b><p>Choose a unit or topic with indexed questions.</p><button className="primary" onClick={()=>setView("library")}>Browse questions</button></div></div>}

      {view === "progress" && <div className="page"><div className="eyebrow">YOUR LEARNING, OVER TIME</div><h1 className="page-title">Progress & patterns</h1><p className="muted">Attempts, missed questions, and repeated review needs are saved in this browser.</p><div className="stats progress-stats"><div className="stat"><span className="stat-icon atlas-tone-info">↗</span><div><small>TOTAL ATTEMPTS</small><b>{attempts}</b></div></div><div className="stat"><span className="stat-icon atlas-tone-review">⌁</span><div><small>MISSED ANSWERS</small><b>{misses}</b></div></div><div className="stat"><span className="stat-icon atlas-tone-success">✦</span><div><small>CONCEPTS MASTERED</small><b>{mastered}</b></div></div></div><div className="panel"><div className="panel-head"><div><div className="eyebrow">FOCUS NEXT</div><h2>Concepts to revisit</h2></div><button className="outline" onClick={()=>reviewSession()}>Build review session →</button></div>{weakConcepts.length?weakConcepts.map(c=><div className="weak-row" key={c.id}><div className="weak-icon">⌁</div><div><b>{c.id} · {c.name}</b><small>{c.ids.size} question{c.ids.size===1?"":"s"} attempted</small></div><span className="missed-count">{c.wrong} missed · {c.attempts} attempts</span><button className="row-arrow" onClick={()=>reviewSession(c.id)}>Practice →</button></div>):<div className="empty-state"><span>✧</span><b>Your review map will grow as you practice</b><p>Mark a response as missed to focus future sessions on that question and topic.</p></div>}</div><div className="panel history-panel"><div className="eyebrow">MISSED QUESTIONS</div><h2>Question history</h2>{weakRows.length?weakRows.slice(0,60).map(q=><div className="history-row" key={q.id}><span className="history-x">↻</span><div><b>{q.type} {q.number} · {q.displayName}</b><small>{q.year || q.exam} · {q.source}</small></div><span>{progress[q.id]?.wrong} missed</span><button className="row-arrow" onClick={()=>{setQueue([q]);setIndex(0);setPageIndex(0);setView("practice");setSubmitted(false);setSelfResult(null);}}>Review →</button></div>):<div className="small-empty">No missed questions yet.</div>}</div></div>}

      {view === "audit" && <div className="page"><div className="eyebrow">CHECK EVERY SOURCE PAGE</div><h1 className="page-title">Source page audit</h1><p className="muted">These counts show which PDF pages currently have question records. Unlinked pages can be covers, directions, tables, answer material, or missed questions; the image must be checked before deciding.</p><div className="stats catalog-stats"><div className="stat"><div><small>ORIGINAL PDF PAGES</small><b>{catalog.audit?.totalPages || catalog.sourcePages}</b></div></div><div className="stat"><div><small>PAGES LINKED TO RECORDS</small><b>{catalog.audit?.pagesReferencedByQuestionRecords || 0}</b></div></div><div className="stat"><div><small>UNLINKED PAGES TO INSPECT</small><b>{catalog.audit?.unresolvedPages || 0}</b></div></div><div className="stat"><div><small>QUESTIONS NEEDING TOPIC REVIEW</small><b>{reviewQuestions.length}</b></div></div></div><div className="panel audit-panel"><div className="panel-head"><div><div className="eyebrow">ORIGINAL SOURCE IMAGE</div><h2>Unlinked page {auditPage} of {catalog.audit?.totalPages || catalog.sourcePages}</h2></div><label>GO TO PAGE<input type="number" min="1" max={catalog.audit?.totalPages || catalog.sourcePages} value={auditPage} onChange={e=>setAuditPage(Math.max(1,Math.min(catalog.audit?.totalPages || catalog.sourcePages,Number(e.target.value)||1)))}/></label></div><p className="muted">If this page contains a question that needs indexing, use “Add a question reference” under Manage test banks. Page images remain the compiled PDF exactly as provided.</p>{(()=>{const file=catalog.sourceFiles?.find(f=>auditPage>=f.from&&auditPage<=f.to);return file?<PdfQuestionPage page={auditPage-file.from+1} sourcePage={auditPage} bankName="AP Chemistry MEGA Compiled Test Bank.pdf" sourceAsset={file.url}/>:<div className="pdf-error">The source page file is unavailable.</div>;})()}<div className="catalog-pagination"><button className="outline" disabled={auditPage<=1} onClick={()=>setAuditPage(p=>p-1)}>← Previous page</button><span>Page {auditPage} · {catalog.audit?.unreferencedPages?.includes(auditPage)?"no question record linked":"question record linked"}</span><button className="outline" disabled={auditPage>=(catalog.audit?.totalPages || catalog.sourcePages)} onClick={()=>setAuditPage(p=>p+1)}>Next page →</button></div><div className="audit-note"><b>Classification status</b><p>{catalog.audit?.coverageNote}</p><a href="/page-audit.json" target="_blank" rel="noreferrer">Open complete page list</a> · <a href="/classification-method.md" target="_blank" rel="noreferrer">Read method and topic boundaries</a></div></div></div>}

      {view === "review" && <div className="page"><div className="eyebrow">KEEP UNCERTAIN MATCHES VISIBLE</div><h1 className="page-title">{reviewKind==="legacy"?"Legacy content":"Classification review"}</h1><p className="muted">The catalog does not guess a topic when the extracted question text is ambiguous. Assign a primary College Board topic below; the page image remains the authority.</p><div className="panel review-panel"><div className="panel-head"><div><h2>{reviewKind==="legacy"?"Outside the current AP framework":"Needs topic verification"}</h2><span className="muted">{reviewList.length} questions · {catalog.stats.multiConceptFrq || 0} multi-concept FRQs flagged</span></div><button className="outline" onClick={()=>setView("library")}>Browse classified →</button></div><div className="review-controls"><button className={reviewKind==="review"?"primary":"outline"} onClick={()=>setReviewKind("review")}>Unresolved ({reviewQuestions.length})</button><button className={reviewKind==="legacy"?"primary":"outline"} onClick={()=>setReviewKind("legacy")}>Legacy ({legacyQuestions.length})</button><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search these records" aria-label="Search review records"/></div>{reviewList.slice(resultPage*50,(resultPage+1)*50).map(q=><div className="review-row expanded-review" key={q.id}><span className="review-mark">?</span><div className="review-copy"><b>{q.year || "Source bank"} · {q.type} {q.number}</b><small>{q.reviewReason || q.classificationRationale || q.textPreview}</small><div className="review-source">Original PDF pages {originalPagesFor(q).join(", ")} · {q.source}</div></div><select value={overrides[q.id] ?? ""} onChange={e=>e.target.value?updateClassification(q,e.target.value):addReviewItem(q)}><option value="">Choose primary topic…</option>{catalog.units.map(u=><optgroup key={u.id} label={`${u.id.toUpperCase()} · ${u.name}`}>{u.topics.map(([tid,name])=><option key={tid} value={tid}>{tid} · {name}</option>)}</optgroup>)}</select><button className="outline compact" onClick={()=>openQuestion(q,reviewList)}>View image</button></div>)}{reviewList.length>50&&<div className="catalog-pagination"><button className="outline" disabled={resultPage===0} onClick={()=>setResultPage(p=>p-1)}>← Previous</button><span>Page {resultPage+1} of {Math.ceil(reviewList.length/50)}</span><button className="outline" disabled={(resultPage+1)*50>=reviewList.length} onClick={()=>setResultPage(p=>p+1)}>Next →</button></div>}{!reviewList.length&&<div className="empty-state"><span>✓</span><b>No records in this view</b><p>Try another search or open the question catalog.</p></div>}</div></div>}

      {view === "banks" && <div className="page"><div className="eyebrow">SOURCE FILES & QUESTION INDEX</div><h1 className="page-title">Manage test banks</h1><p className="muted">Add a PDF without replacing existing banks or clearing progress. Then index its questions with page references and a primary College Board topic.</p><div className="bank-layout"><div className="panel import-panel"><div className="panel-head"><div><div className="eyebrow">ADD SOURCE PDF</div><h2>Bring in another test bank</h2></div><span className="import-icon">＋</span></div><label className="upload-zone"><input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(e:ChangeEvent<HTMLInputElement>)=>{void importPdf(e.target.files?.[0]);e.currentTarget.value=""}}/><span className="upload-icon">↑</span><b>{uploading?"Saving PDF…":"Choose a PDF to add"}</b><small>PDF is stored in this browser and kept alongside your current question bank. Add page references below to index its questions.</small><span className="upload-button">Browse files</span></label><div className="import-note"><b>Progress is preserved</b><p>New question records merge into this browser’s saved catalog. Existing question IDs, topic assignments, and attempt history remain intact.</p></div></div><div className="panel schema-panel"><div className="eyebrow">MANUAL SOURCE INDEX</div><h2>Add a question reference</h2><p>The question image will be rendered directly from the PDF page. Confirm its topic against the page before adding it.</p><label>Source bank<select value={newQuestionBank} onChange={e=>setNewQuestionBank(e.target.value)}>{banks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><div className="manual-fields"><label>PDF page<input value={newQuestionPage} onChange={e=>setNewQuestionPage(e.target.value)} type="number" min="1" placeholder="e.g. 12"/></label><label>Question #<input value={newQuestionNumber} onChange={e=>setNewQuestionNumber(e.target.value)} type="number" min="1" placeholder="e.g. 4"/></label></div><label>Question type<select value={newQuestionType} onChange={e=>setNewQuestionType(e.target.value as "MCQ"|"FRQ")}><option value="FRQ">Free response</option><option value="MCQ">Multiple choice</option></select></label><label>Primary topic<select value={newQuestionTopic} onChange={e=>setNewQuestionTopic(e.target.value)}><option value="">Choose topic…</option>{catalog.units.map(u=><optgroup key={u.id} label={`${u.id.toUpperCase()} · ${u.name}`}>{u.topics.map(([id,name])=><option key={id} value={id}>{id} · {name}</option>)}</optgroup>)}</select></label><button className="primary full" onClick={addSourceQuestion}>Add source question <span>→</span></button></div></div><div className="panel bank-list"><div className="panel-head"><div><div className="eyebrow">IN YOUR LIBRARY</div><h2>Source banks</h2></div><span className="bank-count">{banks.length} PDFs</span></div>{banks.map(b=><div className="bank-row" key={b.id}><span className="file-mark">PDF</span><div><b>{b.name}</b><small>{b.id==="mega"?`${catalog.sourcePages.toLocaleString()} pages · ${catalog.questions.length.toLocaleString()} indexed question records`: `${(b.size/1024/1024).toFixed(1)} MB · ${catalog.questions.filter(q=>q.sourceBank===b.id).length} indexed questions`}</small></div><span className="ready-label">Preserved</span></div>)}</div></div>}

      {view!=="detail"&&view!=="practice"&&view!=="library"&&<footer className="footer">College Board unit/topic map <span>·</span> Original source pages <span>·</span> Progress saved locally</footer>}
    </>}
    </main>
    </div>
  </div>;
}

