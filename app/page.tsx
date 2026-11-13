"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Activity, ArrowUpRight, Atom, Beaker, BookOpen, ChevronDown, FileText, FlaskConical, LayoutGrid, LibraryBig, Menu, Network, Orbit, Thermometer } from "lucide-react";
import stimulusDocument from "../research/stimuli.json";
import { planWorksheet } from "../lib/worksheet.mjs";
import { buildChemAtlasUrl, parseChemAtlasLocation } from "./navigation.mjs";
import { serializeProgress, parseProgress } from "../lib/progress-transfer.mjs";

type AppView = "desk" | "library" | "builder" | "detail" | "practice" | "progress" | "review" | "banks" | "audit";
type RouteUpdates = { unit?: string | null; topic?: string | null; type?: string | null; query?: string | null; questionId?: string | null; sessionIds?: string[] | null; step?: number | null };

function subscribeToNavigation(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener("chematlas:navigate", callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("chematlas:navigate", callback);
  };
}
const getNavigationSnapshot = () => window.location.href;
const getServerNavigationSnapshot = () => "https://chematlas.invalid/";

type SourceRegion = { page: number; rect: number[] };
type Unit = { id: string; name: string; topics: [string, string][] };
type Question = {
  displayTopic?: string; displayName?: string; id: string; type: "MCQ" | "FRQ"; year: string | null; exam: string;
  number: number; pages: number[]; sourcePagesOriginal?: number[]; primaryUnit?: string; unitName?: string;
  primaryTopic?: string | null; topicName?: string | null; secondaryTopics: string[]; relatedTopics?: string[];
  topicParts?: { label: string; topics: string[]; topicNames: string[]; textPreview: string; confidence?: number; rationale?: string }[];
  secondaryTopicNames: string[]; multiConcept: boolean; classificationConfidence: number;
  status: "classified" | "review" | "legacy"; classificationRationale?: string; classificationMethod?: string; legacyConcepts?: string[]; sourceRegions?: SourceRegion[]; sourceAssets?: string[]; evidencePages?: number[]; reviewReason?: string | null; textPreview: string;
  source: string; sourceBank?: string; stimulusIds?: string[];
};
type Bank = { id: string; name: string; size: number; addedAt: string; pages?: number };
type Attempt = { attempts: number; wrong: number; correct: number; last: string; history: { date: string; result: "correct" | "missed" | "unsure" }[] };
type Saved = { progress: Record<string, Attempt>; overrides: Record<string, string>; banks: Bank[]; questions: Question[]; sessions: number; sourcePages?: number };
type Catalog = { sourceFiles?: {url:string;from:number;to:number}[]; units: Unit[]; questions: Question[]; sourcePages: number; includedSourcePages?: number[]; topicDetails?: Record<string, { description: string; learningObjectives?: string[]; pdfPages?: number[] }>; audit?: { totalPages: number; pagesReferencedByQuestionRecords: number; unreferencedPages: number[]; unresolvedPages: number; classified: number; legacy: number; review: number; coverageNote: string }; stats: Record<string, number> };

const STORAGE_KEY = "apchem-studio-v2";
const DB_NAME = "apchem-practice-bank";
const STORE = "pdfs";

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

function PdfQuestionPage({ page, sourcePage, bankId, bankName, questionNumber=0, cropView=false, highlightLabels=[], sourceAsset, sourceRegions=[] }: { page: number; sourcePage: number; bankId?: string; bankName: string; questionNumber?: number; cropView?: boolean; highlightLabels?: string[]; sourceAsset?: string; sourceRegions?: SourceRegion[] }) {
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

export default function Home() {
  const locationHref = useSyncExternalStore(subscribeToNavigation, getNavigationSnapshot, getServerNavigationSnapshot);
  const route = parseChemAtlasLocation(new URL(locationHref).search);
  const view = route.view as AppView;
  const selectedUnit = route.unit;
  const selectedTopic = route.topic;
  const typeFilter = route.type;
  const query = route.query;
  const [catalog, setCatalog] = useState<Catalog>({ units: [], questions: [], sourcePages: 0, stats: {} });
  const [approvedImages] = useState<Record<string, string[]>>({});
  const [progress, setProgress] = useState<Record<string, Attempt>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [banks, setBanks] = useState<Bank[]>([{ id: "mega", name: "AP Chemistry MEGA Compiled Test Bank.pdf", size: 0, addedAt: "Bundled source" }]);
  const [sessions, setSessions] = useState(0);
  const [showWorksheet, setShowWorksheet] = useState(false);
  const worksheetRef = useRef<HTMLElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resultPage, setResultPage] = useState(0);
  const [reviewKind, setReviewKind] = useState("review");
  const [auditPage, setAuditPage] = useState(1);
  const includeReview = false;
  const [queue, setQueue] = useState<Question[]>([]); const [index, setIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0); const [selfResult, setSelfResult] = useState<"correct" | "missed" | "unsure" | null>(null);
  const [imageMode, setImageMode] = useState<"full" | "crop" | "approved">("full");
  const [work, setWork] = useState(""); const [submitted, setSubmitted] = useState(false);
  const [sessionSize, setSessionSize] = useState(10); const [notice, setNotice] = useState("");
  const [newQuestionPage, setNewQuestionPage] = useState(""); const [newQuestionType, setNewQuestionType] = useState<"MCQ" | "FRQ">("FRQ");
  const [newQuestionNumber, setNewQuestionNumber] = useState(""); const [newQuestionBank, setNewQuestionBank] = useState("mega");
  const [newQuestionTopic, setNewQuestionTopic] = useState(""); const [, setShowAddQuestion] = useState(false);
  const [uploading, setUploading] = useState(false);

  function navigate(next: AppView, updates: RouteUpdates = {}, replace = false) {
    const nextUrl = buildChemAtlasUrl(window.location.href, next, updates);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      const state = { ...(window.history.state || {}), chemAtlas: true, view: next };
      if (replace) window.history.replaceState(state, "", nextUrl);
      else window.history.pushState(state, "", nextUrl);
    }
    setShowWorksheet(false);
    setToolsOpen(false);
    setMobileMenuOpen(false);
    setResultPage(0);
    window.dispatchEvent(new Event("chematlas:navigate"));
  }

  function updateFilters(updates: Pick<RouteUpdates, "unit" | "topic" | "type" | "query">) {
    const nextUrl = buildChemAtlasUrl(window.location.href, view, updates);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState({ ...(window.history.state || {}), chemAtlas: true, view }, "", nextUrl);
      window.dispatchEvent(new Event("chematlas:navigate"));
    }
    setResultPage(0);
  }

  useEffect(() => {
    fetch("/questions.json").then(r => r.json()).then(raw => { const data=raw as Catalog; setCatalog(old=>({...data,questions:[...data.questions,...old.questions.filter(q=>q.sourceBank)]})); }).catch(() => setNotice("Question catalog could not be loaded."));
    try {
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

  function exportBrowserProgress() {
    const data = serializeProgress({ progress, overrides, sessions });
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "chematlas-progress.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice("Progress export created. Keep this file private.");
  }
  async function importBrowserProgress(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setNotice("Progress import rejected: the file exceeds the 2 MB limit.");
      return;
    }
    try {
      const imported = parseProgress(await file.text());
      if (!window.confirm("Replace this browser's progress, classifications, and session count with the imported copy? This cannot be undone.")) return;
      setProgress(imported.progress);
      setOverrides(imported.overrides);
      setSessions(imported.sessions);
      setNotice("Progress imported. Your bundled catalog and source PDFs were not changed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to read the progress file.");
    }
  }

  const topics = useMemo(() => catalog.units.flatMap(u => u.topics.map(([id, name]) => ({ id, name, unit: u.id, unitName: u.name }))), [catalog.units]);
  const questions = useMemo<Question[]>(() => catalog.questions.map(q => {
    const topic = overrides[q.id] ?? q.primaryTopic ?? undefined;
    const related: string[] = overrides[q.id] ? [overrides[q.id],...(q.relatedTopics || []).filter(id=>id!==q.primaryTopic && id!==overrides[q.id])] : (q.relatedTopics?.length ? q.relatedTopics : (topic?[topic]:[]));
    return { ...q, status: overrides[q.id] ? "classified" as const : q.status, displayTopic: topic, relatedTopics:related, displayName: topics.find(t => t.id === topic)?.name ?? q.topicName ?? "Needs classification" };
  }), [catalog.questions, overrides, topics]);
  const sessionQuestions = route.sessionIds.flatMap(id => { const question = questions.find(q => q.id === id); return question ? [question] : []; });
  const routeQuestion = questions.find(q => q.id === route.questionId);
  const activeQueue = view === "practice" && sessionQuestions.length ? sessionQuestions : queue.length ? queue : routeQuestion ? [routeQuestion] : [];
  const activeIndex = view === "practice" && sessionQuestions.length ? Math.min(route.step, sessionQuestions.length - 1) : index;
  const current = view === "detail"
    ? routeQuestion ?? queue[index]
    : view === "practice"
      ? activeQueue[activeIndex] ?? routeQuestion
      : queue[index];
  useEffect(() => {
    function resetPracticeAfterHistoryNavigation() {
      setShowWorksheet(false);
      setPageIndex(0);
      setWork("");
      setSubmitted(false);
      setSelfResult(null);
    }
    window.addEventListener("popstate", resetPracticeAfterHistoryNavigation);
    return () => window.removeEventListener("popstate", resetPracticeAfterHistoryNavigation);
  }, []);
  const reviewQuestions = questions.filter(q => q.status === "review" || (!q.displayTopic && q.status!=="legacy"));
  const legacyQuestions = questions.filter(q=>q.status==="legacy");
  const reviewList = (reviewKind==="legacy"?legacyQuestions:reviewQuestions).filter(q=>!query || `${q.id} ${q.number} ${q.year} ${q.textPreview} ${q.reviewReason} ${q.legacyConcepts?.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const available = questions.filter(q => q.status === "classified" && !!q.displayTopic);
  const attempts = Object.values(progress).reduce((n, p) => n + p.attempts, 0);
  const misses = Object.values(progress).reduce((n, p) => n + p.wrong, 0);
  const mastered = Object.values(progress).filter(p => p.correct >= 3 && p.wrong === 0).length;
  const filteredQuestions = questions.filter(q => {
    const related=q.relatedTopics || [];
    const matchingUnits=related.map(id=>topics.find(x=>x.id===id)?.unit).filter(Boolean);
    return (includeReview || q.status === "classified") && (selectedUnit === "all" || matchingUnits.includes(selectedUnit)) &&
      (selectedTopic === "all" || related.includes(selectedTopic)) && (typeFilter === "Mixed" || q.type === typeFilter) &&
      (!query || `${q.year} ${q.exam} ${q.number} ${q.textPreview} ${q.displayName}`.toLowerCase().includes(query.toLowerCase()));
  });
  const detailSequence = filteredQuestions.some(q => q.id === current?.id) ? filteredQuestions : questions;
  const detailIndex = current ? detailSequence.findIndex(q => q.id === current.id) : -1;
  const weakRows = useMemo(() => questions.filter(q => progress[q.id]?.wrong).sort((a,b) => (progress[b.id]?.wrong || 0) - (progress[a.id]?.wrong || 0)), [questions, progress]);
  const weakConcepts = useMemo(() => {
    const counts: Record<string, { id: string; name: string; wrong: number; attempts: number; ids: Set<string> }> = {};
    for (const q of questions) { const p = progress[q.id]; if (!p || !q.displayTopic) continue; const k=q.displayTopic; counts[k] ??= { id:k,name:q.displayName ?? q.topicName ?? "Needs classification",wrong:0,attempts:0,ids:new Set() }; counts[k].wrong += p.wrong; counts[k].attempts += p.attempts; counts[k].ids.add(q.id); }
    return Object.values(counts).filter(x=>x.wrong).sort((a,b)=>b.wrong-a.wrong);
  }, [questions, progress]);

  function topicFor(q: Question) { return overrides[q.id] ?? q.primaryTopic ?? undefined; }
  function startSession(focus?: string) {
    const pool = questions.filter(q => {
      return (includeReview || q.status === "classified") &&
        (focus === "weak" ? (progress[q.id]?.wrong || 0) > 0 : !focus || (q.relatedTopics||[]).includes(focus)) &&
        (selectedUnit === "all" || (q.relatedTopics||[]).some(id=>topics.find(t=>t.id===id)?.unit===selectedUnit)) &&
        (selectedTopic === "all" || (q.relatedTopics||[]).includes(selectedTopic)) &&
        (typeFilter === "Mixed" || q.type === typeFilter);
    });
    const shuffled = [...pool].sort(() => Math.random() - .5).slice(0, sessionSize);
    setQueue(shuffled); setIndex(0); setPageIndex(0); setSelfResult(null); setWork(""); setSubmitted(false); setSessions(s => s + (shuffled.length ? 1 : 0));
    if (!shuffled.length) setNotice("No matched questions fit those filters yet. Check Review or change the topic/type."); else { setNotice(""); navigate("practice", { questionId: shuffled[0].id, sessionIds: shuffled.map(q => q.id), step: 0 }); }
  }
  function markSelfCheck(result: "correct" | "missed" | "unsure") {
    if (!current || !submitted) return;
    const date = new Date().toISOString().slice(0,10);
    setProgress(old => { const p = old[current.id] || { attempts:0, wrong:0, correct:0, last:"", history:[] }; return { ...old, [current.id]: { attempts:p.attempts+1, wrong:p.wrong+(result === "missed" ? 1 : 0), correct:p.correct+(result === "correct" ? 1 : 0), last:date, history:[...p.history,{ date, result }] } }; });
    setSelfResult(result);
  }
  function goToPracticeIndex(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= activeQueue.length) return;
    const question = activeQueue[nextIndex];
    if (!question) return;
    setIndex(nextIndex); setPageIndex(0); setSelfResult(null); setWork(""); setSubmitted(false);
    navigate("practice", { questionId: question.id, sessionIds: activeQueue.map(q => q.id), step: nextIndex }, true);
  }
  function nextQuestion() { const nextIndex = activeIndex + 1; if (nextIndex >= activeQueue.length) { navigate("progress"); return; } goToPracticeIndex(nextIndex); }
  function reviewSession(topic?: string) { if (topic) { const ids = questions.filter(q => topicFor(q) === topic && progress[q.id]?.wrong).map(q=>q.id); const restored = questions.filter(q=>ids.includes(q.id)); setQueue(restored); setIndex(0); setPageIndex(0); setSubmitted(false); setSelfResult(null); setWork(""); if (restored.length) navigate("practice", { questionId: restored[0].id, sessionIds: restored.map(q=>q.id), step: 0 }); } else startSession("weak"); }
  async function importPdf(file?: File) {
    if (!file) return; if (!file.name.toLowerCase().endsWith(".pdf")) { setNotice("Choose a PDF test bank."); return; }
    setUploading(true);
    try {
      const id = `bank-${crypto.randomUUID()}`; await savePdf(id, file);
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
  function openQuestion(q: Question) { setQueue([q]); setIndex(0); setPageIndex(0); setImageMode(approvedImages[q.id]?.length?"approved":"full"); setSubmitted(false); setSelfResult(null); setWork(""); navigate("detail", { questionId: q.id }); }
  function partsForTopic(q: Question, topicId?: string) { return (q.topicParts||[]).filter(part=>!topicId || part.topics.includes(topicId)); }

  const bankName = (id?: string) => banks.find(b=>b.id===(id || "mega"))?.name || "AP Chemistry MEGA Compiled Test Bank.pdf";
  const originalPagesFor = (q?: Question) => q?.sourcePagesOriginal?.length ? q.sourcePagesOriginal : (q?.pages?.length?q.pages:[1]);
  const pagesFor = (q?: Question) => q?.sourceBank && q.sourceBank!=="mega" ? q.pages : originalPagesFor(q).map(p=>{const file=catalog.sourceFiles?.find(f=>p>=f.from&&p<=f.to);return file?p-file.from+1:p;});
  const sourceAssetFor = (q:Question,i:number) => q.sourceBank && q.sourceBank!=="mega" ? undefined : catalog.sourceFiles?.find(f=>originalPagesFor(q)[i]>=f.from&&originalPagesFor(q)[i]<=f.to)?.url;
  const mainTopicQuestionCounts = (id: string) => available.filter(q => (q.relatedTopics||[]).includes(id)).length;
  function printWorksheet() {
    if (worksheetRef.current?.querySelector(".pdf-error")) {
      setNotice("A source page failed to render. Check the worksheet preview before printing.");
    } else if (worksheetRef.current?.querySelector(".pdf-wait")) {
      setNotice("Wait for the source pages to render before printing.");
    } else {
      setNotice("");
      window.print();
    }
  }

  return <div className="app-shell">
    <header className="site-nav">
      <button className="mobile-menu-toggle" aria-label="Toggle navigation" aria-expanded={mobileMenuOpen} onClick={()=>setMobileMenuOpen(open=>!open)}><Menu size={21}/></button>
      <button className="brand-lockup" onClick={()=>navigate("desk")} aria-label="ChemAtlas home"><span className="brandmark">C<span>✦</span></span><span className="brand-copy"><b>ChemAtlas</b><small>AP Chemistry Studio</small></span></button>
      <nav className={`top-navigation ${mobileMenuOpen?"mobile-open":""}`} aria-label="Main navigation">
        <button className={`top-nav-item ${view==="desk"?"selected":""}`} aria-current={view==="desk"?"page":undefined} onClick={()=>{navigate("desk");setMobileMenuOpen(false);}}><BookOpen size={21}/><span>Browse by unit</span><ChevronDown className="nav-chevron" size={16}/></button>
        <button className={`top-nav-item ${view==="library"||view==="detail"?"selected":""}`} aria-current={view==="library"?"page":undefined} onClick={()=>{navigate("library");setMobileMenuOpen(false);}}><LibraryBig size={20}/><span>Question bank</span></button>
        <button className={`top-nav-item ${view==="builder"||view==="practice"?"selected":""}`} aria-current={view==="builder"?"page":undefined} onClick={()=>{navigate("builder");setMobileMenuOpen(false);}}><FileText size={20}/><span>Practice Builder</span></button>
        <div className="tools-menu"><button className={`top-nav-item tools-toggle ${["progress","review","audit","banks"].includes(view)?"selected":""}`} aria-haspopup="menu" aria-expanded={toolsOpen} onClick={()=>setToolsOpen(open=>!open)}><LayoutGrid size={20}/><span>Tools</span><ChevronDown size={16}/></button>
          {toolsOpen&&<div className="tools-popover" role="menu"><button role="menuitem" onClick={()=>{navigate("progress");setToolsOpen(false);setMobileMenuOpen(false);}}><Activity size={17}/> Progress</button><button role="menuitem" onClick={()=>{setReviewKind("review");navigate("review");setToolsOpen(false);setMobileMenuOpen(false);}}><span className="menu-count">{reviewQuestions.length}</span> Review queue</button><button role="menuitem" onClick={()=>{navigate("audit");setToolsOpen(false);setMobileMenuOpen(false);}}><FileText size={17}/> Source page audit</button><button role="menuitem" onClick={()=>{setReviewKind("legacy");navigate("review");setToolsOpen(false);setMobileMenuOpen(false);}}><BookOpen size={17}/> Legacy content</button><button role="menuitem" onClick={()=>{navigate("banks");setToolsOpen(false);setMobileMenuOpen(false);}}><Beaker size={17}/> Manage test banks</button></div>}
        </div>
      </nav>
      <div className="nav-profile" title="Study profile">J</div>
    </header>
    <main className="main">
      {notice && <div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}

      {view === "desk" && <div className="page browse-page">
        <section className="catalog-banner"><div><span className="eyebrow">COLLEGE BOARD COURSE FRAMEWORK</span><h1>Browse by unit</h1><p>Choose a College Board unit to explore its topics and original questions.</p></div></section>
        <div className="stats catalog-stats target-stats"><div className="stat stat-green"><span className="stat-icon"><LibraryBig size={23}/></span><div><small>QUESTION RECORDS</small><b>{questions.length.toLocaleString()}</b></div></div><div className="stat stat-blue"><span className="stat-icon"><BookOpen size={23}/></span><div><small>CURRICULUM TOPICS</small><b>{topics.length.toLocaleString()}</b></div></div><div className="stat stat-amber"><span className="stat-icon"><Activity size={23}/></span><div><small>TOTAL MCQs</small><b>{questions.filter(q=>q.type==="MCQ").length.toLocaleString()}</b></div></div><div className="stat stat-cyan"><span className="stat-icon"><FileText size={23}/></span><div><small>TOTAL FRQs</small><b>{questions.filter(q=>q.type==="FRQ").length.toLocaleString()}</b></div></div></div>
        <div className="unit-section-title"><div><span className="eyebrow">COLLEGE BOARD COURSE FRAMEWORK</span><h2>All nine units</h2></div><span className="unit-divider"/></div>
        <div className="unit-grid target-unit-grid">{catalog.units.map((u,i)=>{const Icon=[Atom,Network,FlaskConical,Beaker,Activity,Thermometer,Orbit,Network,Atom][i];const accent=["mint","blue","orange","blue","mint","blue","orange","mint","blue"][i];const count=available.filter(q=>(q.relatedTopics||[]).some(id=>topics.find(t=>t.id===id)?.unit===u.id)).length;return <button className={`unit-card target-unit-card accent-${accent}`} key={u.id} onClick={()=>{navigate("library", { unit: u.id, topic: "all" });}}><span className="unit-icon"><Icon size={27} strokeWidth={1.8}/></span><span className="unit-copy"><span className="unit-no">UNIT {i+1}</span><b>{u.name}</b><small>{u.topics.length} topics · {count.toLocaleString()} classified questions</small></span><span className="unit-open"><ArrowUpRight size={23}/></span></button>})}</div>
        <div className="footnote">Question images are rendered from the original PDF pages. Topic assignments include a reasoning note. Legacy material and unresolved source items are kept separately. <a href="/classification-method.md" target="_blank" rel="noreferrer">Read the classification method</a> · <a href="/page-audit.json" target="_blank" rel="noreferrer">Source coverage audit</a></div>
      </div>}

      {view === "library" && <div className="page">
        <div className="eyebrow">COLLEGE BOARD UNIT → TOPIC → QUESTION</div><h1 className="page-title">Question catalog</h1><p className="muted">Choose a unit, then a topic. Multi-concept FRQs appear under every matched topic, with the related subpart called out for that topic.</p>
        <div className="library-filters"><label>UNIT<select value={selectedUnit} onChange={e=>{updateFilters({ unit: e.target.value, topic: "all" });}}><option value="all">All units</option>{catalog.units.map(u=><option key={u.id} value={u.id}>{u.id.toUpperCase()} · {u.name}</option>)}</select></label><label>TOPIC<select value={selectedTopic} onChange={e=>updateFilters({ topic: e.target.value })}><option value="all">All topics</option>{topics.filter(t=>selectedUnit==="all"||t.unit===selectedUnit).map(t=><option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></label><label>TYPE<select value={typeFilter} onChange={e=>updateFilters({ type: e.target.value })}><option>Mixed</option><option>MCQ</option><option>FRQ</option></select></label><label className="search-label">SEARCH<input value={query} onChange={e=>updateFilters({ query: e.target.value })} placeholder="Year, question number, keyword"/></label></div>
        {selectedTopic!=="all" && catalog.topicDetails?.[selectedTopic] && <div className="topic-definition"><b>{selectedTopic} · {topics.find(t=>t.id===selectedTopic)?.name}</b><p>{catalog.topicDetails[selectedTopic].description}</p><small>College Board CED · learning objectives {catalog.topicDetails[selectedTopic].learningObjectives?.join(", ") || "see curriculum reference"}</small></div>}
        <div className="topic-shortcuts">{topics.filter(t=>selectedUnit==="all"||t.unit===selectedUnit).map(t=><button key={t.id} className={selectedTopic===t.id?"topic-tag chosen":"topic-tag"} onClick={()=>updateFilters({ topic: selectedTopic===t.id?"all":t.id })}><span>{t.id}</span>{t.name}<i>{mainTopicQuestionCounts(t.id)}</i></button>)}</div>
        <div className="library-results-head"><b>{selectedTopic==="all"?(selectedUnit==="all"?"All classified questions":`${catalog.units.find(u=>u.id===selectedUnit)?.name} · all topics`):`${selectedTopic} · ${topics.find(t=>t.id===selectedTopic)?.name}`}</b><span>{filteredQuestions.length.toLocaleString()} catalog entries · uncertain matches are in Review</span></div>
        <div className="question-list">{filteredQuestions.slice(resultPage*50,(resultPage+1)*50).map(q=>{const contextId=selectedTopic!=="all"?selectedTopic:q.displayTopic;const t=topics.find(x=>x.id===contextId);const original=originalPagesFor(q);const relevantParts=partsForTopic(q,selectedTopic!=="all"?selectedTopic:undefined);const primaryMatch=contextId===q.displayTopic;const approved=approvedImages[q.id]?.[0];return <article className="catalog-row" key={q.id}><button className="catalog-main" onClick={()=>openQuestion(q)}>{approved?<span className="catalog-approved-thumb"><img src={approved} loading="lazy" alt="Approved question preview"/><small>IMAGE VERIFIED</small></span>:null}<span className={`type-chip ${q.type.toLowerCase()}`}>{q.type}</span><span className="catalog-info"><b>{q.year || "Added bank"} · Question {q.number}</b><small>{q.exam} · Original PDF {original.length===1?`page ${original[0]}`:`pages ${original[0]}–${original[original.length-1]}`}</small><span className="topic-context"><b>{primaryMatch?"Primary topic":"Also filed under"}:</b> {t?.id} · {t?.name}</span>{relevantParts.length?<span className="part-matches">{relevantParts.slice(0,3).map((part,i)=><span className="part-match" key={`${part.label}-${i}`}><mark>{part.label}</mark><span>{part.textPreview}</span></span>)}</span>:<span className="preview-line">{q.textPreview}</span>}</span><span className="catalog-arrow">Open details ↗</span></button><div className="catalog-tags">{t&&<span className="curriculum-tag">{t.unit.toUpperCase()} · {t.id}</span>}{q.multiConcept&&<span className="multi-tag">MULTI-CONCEPT FRQ</span>}{(q.relatedTopics||[]).filter(id=>id!==q.displayTopic).map(id=>topics.find(x=>x.id===id)).filter(Boolean).map(topic=><span className="secondary-tag" key={topic!.id}>{topic!.id} · {topic!.name}</span>)}<span className="ready-label">Topic assigned</span></div></article>;})}{filteredQuestions.length>50&&<div className="catalog-pagination"><button className="outline" disabled={resultPage===0} onClick={()=>setResultPage(p=>p-1)}>← Previous</button><span>Page {resultPage+1} of {Math.ceil(filteredQuestions.length/50)}</span><button className="outline" disabled={(resultPage+1)*50>=filteredQuestions.length} onClick={()=>setResultPage(p=>p+1)}>Next →</button></div>}{!filteredQuestions.length&&<div className="empty-state"><span>⌕</span><b>No classified questions in this view</b><p>Try another topic, or see uncertain matches in the Review section.</p><button className="outline" onClick={()=>navigate("review")}>Open classification review</button></div>}</div>
        <div className="curriculum-note"><b>Curriculum source</b> · AP Chemistry Course and Exam Description, College Board. Topic codes and names follow its nine-unit framework.</div>
      </div>}

      {view === "builder" && <div className="page builder-page"><section className="builder-intro"><span className="eyebrow">BUILD A FOCUSED PRACTICE SET</span><h1 className="page-title">Practice Builder</h1><p className="muted">Choose a unit, topic, and question type. ChemAtlas will draw a randomized set from the indexed source questions that match.</p></section><div className="builder-layout"><section className="panel builder-panel"><div className="panel-head"><div><span className="eyebrow">YOUR QUESTION SET</span><h2>Set the practice scope</h2></div><span className="builder-symbol"><FileText size={22}/></span></div><div className="builder-controls"><label>UNIT<select value={selectedUnit} onChange={e=>{updateFilters({ unit: e.target.value, topic: "all" });}}><option value="all">All units</option>{catalog.units.map(u=><option key={u.id} value={u.id}>{u.id.toUpperCase()} · {u.name}</option>)}</select></label><label>TOPIC<select value={selectedTopic} onChange={e=>updateFilters({ topic: e.target.value })}><option value="all">All topics</option>{topics.filter(t=>selectedUnit==="all"||t.unit===selectedUnit).map(t=><option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></label><label>QUESTION TYPE<select value={typeFilter} onChange={e=>updateFilters({ type: e.target.value })}><option>Mixed</option><option>MCQ</option><option>FRQ</option></select></label><label>QUESTION COUNT<select value={sessionSize} onChange={e=>setSessionSize(Number(e.target.value))}>{[5,10,15,20,30].map(n=><option key={n} value={n}>{n} questions</option>)}</select></label></div><div className="builder-summary"><span className="builder-summary-icon"><BookOpen size={21}/></span><div><b>{filteredQuestions.length.toLocaleString()} matching questions</b><small>Only classified records appear in this set. Original PDF pages open during practice.</small></div></div><button className="primary builder-start" disabled={!filteredQuestions.length} onClick={()=>startSession()}>{filteredQuestions.length?`Start ${Math.min(sessionSize,filteredQuestions.length)}-question practice`:"No questions match these filters"}<ArrowUpRight size={18}/></button></section><aside className="builder-side"><div className="builder-side-icon"><FlaskConical size={23}/></div><h2>Practice from the source</h2><p>Questions stay linked to their original PDF pages. Submit your response, then record a self-check to build your personal progress map.</p><button className="text-button" onClick={()=>navigate("library")}>Browse the question bank →</button></aside></div></div>}

      {view === "detail" && current && <div className="page detail-page"><button className="back" onClick={()=>navigate("library")}>← Back to catalog</button><div className="detail-heading"><div><div className="eyebrow">{current.exam}</div><h1 className="page-title">{current.type} {current.number}{current.year?` · ${current.year}`:""}</h1></div><span className={current.status==="review"?"review-label":"ready-label"}>{current.status==="review"?"Needs topic review":"Classified"}</span></div><p className="muted">{bankName(current.sourceBank)} · original PDF page{originalPagesFor(current).length===1?"":"s"} {originalPagesFor(current).join(", ")}</p>
        <div className="detail-navigation"><button className="outline" disabled={detailIndex <= 0} onClick={()=>openQuestion(detailSequence[detailIndex-1])}>← Previous question</button><span>{detailIndex >= 0 ? `Question ${detailIndex+1} of ${detailSequence.length}` : "Question details"}</span><button className="outline" disabled={detailIndex < 0 || detailIndex+1 >= detailSequence.length} onClick={()=>openQuestion(detailSequence[detailIndex+1])}>Next question →</button></div>
        <div className="detail-topic-map"><div className="primary-topic-callout"><span>PRIMARY TOPIC</span><b>{current.displayTopic?`${current.displayTopic} · ${current.displayName}`:"Needs classification"}</b></div><div className="related-topic-list"><span>ALSO FILED UNDER</span>{(current.relatedTopics||[]).filter(id=>id!==current.displayTopic).length?(current.relatedTopics||[]).filter(id=>id!==current.displayTopic).map(id=>{const t=topics.find(x=>x.id===id);return t?<span className="secondary-tag" key={id}>{t.unit.toUpperCase()} · {t.id} · {t.name}</span>:null;}):<small>No additional topic matches recorded.</small>}</div></div>
        <section className="panel detail-match-panel"><div className="panel-head"><div><div className="eyebrow">WHY THIS QUESTION APPEARS HERE</div><h2>{selectedTopic!=="all"&&current.relatedTopics?.includes(selectedTopic)?`${selectedTopic} · ${topics.find(t=>t.id===selectedTopic)?.name}`:"Topic mapping"}</h2></div><span className="multi-tag">{current.multiConcept?"MULTI-CONCEPT FRQ":"SOURCE QUESTION"}</span></div>{partsForTopic(current,selectedTopic!=="all"&&current.relatedTopics?.includes(selectedTopic)?selectedTopic:undefined).length?<div className="detail-parts">{partsForTopic(current,selectedTopic!=="all"&&current.relatedTopics?.includes(selectedTopic)?selectedTopic:undefined).map((part,i)=><div className="detail-part" key={`${part.label}-${i}`}><mark>{part.label}</mark><p>{part.rationale || part.textPreview}</p><small>{part.topicNames.map((n,j)=><span key={`${n}-${j}`}>{n}</span>)}</small></div>)}</div>:<p className="muted detail-whole-match">This item is indexed as a whole-question match. The source image below lets you inspect the original prompt before changing its topic assignment.</p>}</section>
        {current.classificationRationale && <section className="classification-evidence"><b>Classification evidence</b><p>{current.classificationRationale}</p><small>{current.classificationMethod || "Question-content review"}{current.evidencePages?.length?` · supporting bank pages ${current.evidencePages.join(", ")}`:""}</small>{!!current.legacyConcepts?.length && <p><b>Legacy concepts:</b> {current.legacyConcepts.join(", ")}</p>}</section>}
        <div className="detail-meta-grid"><div><small>QUESTION TYPE</small><b>{current.type==="FRQ"?"Free response":"Multiple choice"}</b></div><div><small>YEAR</small><b>{current.year||"Not identified"}</b></div><div><small>QUESTION NUMBER</small><b>{current.number}</b></div><div><small>EXAM / VERSION</small><b>{current.exam}</b></div><div><small>SOURCE PAGES</small><b>{originalPagesFor(current).join(", ")}</b></div><div><small>CLASSIFICATION STATUS</small><b>{current.status==="classified"?"Topic assigned":current.status==="legacy"?"Outside current framework":"Needs review"}</b></div></div>
        <section className="panel detail-image-panel"><div className="panel-head"><div><div className="eyebrow">SOURCE IMAGE</div><h2>Question as printed</h2></div><div className="image-mode-tabs">{approvedImages[current.id]?.length?<button className={imageMode==="approved"?"selected":""} onClick={()=>setImageMode("approved")}>Approved image</button>:null}<button className={imageMode==="full"?"selected":""} onClick={()=>setImageMode("full")}>Full page</button><button className={imageMode==="crop"?"selected":""} onClick={()=>setImageMode("crop")}>Question crop</button></div></div><p className="muted">{imageMode==="approved"?"Current accepted image revision. The original PDF remains available below in Full page or Question crop mode.":"Yellow marks indicate the FRQ parts linked to the topic shown above. Use Full page to see shared instructions, diagrams, and surrounding context."}</p>{imageMode==="approved"&&approvedImages[current.id]?.length?<div className="approved-image-stack">{approvedImages[current.id].map((src,i)=><figure key={src}><img src={src} loading="lazy" alt={`${current.type} ${current.number} approved image segment ${i+1}`}/>{approvedImages[current.id].length>1?<figcaption>Segment {i+1} of {approvedImages[current.id].length}</figcaption>:null}</figure>)}</div>:<><div className="pdf-tabs">{pagesFor(current).map((pg,i)=><button key={pg} className={pageIndex===i?"selected":""} onClick={()=>setPageIndex(i)}>Original page {originalPagesFor(current)[i]}</button>)}</div><PdfQuestionPage page={pagesFor(current)[pageIndex]} sourcePage={originalPagesFor(current)[pageIndex]} bankId={current.sourceBank||"mega"} bankName={bankName(current.sourceBank)} sourceAsset={sourceAssetFor(current,pageIndex)} sourceRegions={current.sourceRegions} questionNumber={current.number} cropView={imageMode==="crop"} highlightLabels={partsForTopic(current,selectedTopic!=="all"&&current.relatedTopics?.includes(selectedTopic)?selectedTopic:undefined).map(p=>p.label)} /></>}</section>
      </div>}
      {view === "detail" && !current && <div className="page narrow"><div className="empty-state"><b>Question not found</b><p>This question ID is not present in the currently loaded catalog.</p><button className="outline" onClick={()=>navigate("library")}>Back to Question Bank</button></div></div>}

      {view === "practice" && current && !showWorksheet && <div className="page practice-page"><div className="session-top"><button className="back" onClick={()=>navigate("desk")}>← Exit session</button><button className="outline compact" onClick={() => setShowWorksheet(true)}>Worksheet</button><div className="session-step-controls"><button className="outline compact" disabled={activeIndex <= 0} onClick={()=>goToPracticeIndex(activeIndex-1)}>← Previous</button><span className="session-count">QUESTION {activeIndex+1} <i>/</i> {activeQueue.length}</span></div></div><div className="progress-line"><i style={{width:`${((activeIndex+(submitted?1:0))/activeQueue.length)*100}%`}}/></div><div className="question-meta"><span className={`type-chip ${current.type.toLowerCase()}`}>{current.type==="MCQ"?"MULTIPLE CHOICE":"FREE RESPONSE"}</span><span>{current.displayTopic ? `${current.displayTopic} · ${current.displayName}` : "Needs topic review"}</span><span>·</span><span>{current.year || current.exam}</span></div>
        <div className="question-card source-question"><div className="source-question-head"><div><div className="eyebrow">ORIGINAL QUESTION PAGE</div><h2>{current.year || "Source bank"} · {current.type} {current.number}</h2><p>Exact page image from <b>{bankName(current.sourceBank)}</b></p></div><span className="source-page-count">{pageIndex+1} / {pagesFor(current).length} source page{pagesFor(current).length===1?"":"s"}</span></div>
        <div className="pdf-tabs">{pagesFor(current).map((pg,i)=><button key={pg} className={pageIndex===i?"selected":""} onClick={()=>setPageIndex(i)}>Original page {originalPagesFor(current)[i]}</button>)}</div>
        <PdfQuestionPage page={pagesFor(current)[pageIndex]} sourcePage={originalPagesFor(current)[pageIndex]} bankId={current.sourceBank || "mega"} bankName={bankName(current.sourceBank)} sourceAsset={sourceAssetFor(current,pageIndex)} />
        {!submitted ? <div className="response-panel"><label htmlFor="work"><b>Your work / answer</b><span>Write your response here before submitting. The source image remains answer-free.</span></label><textarea id="work" value={work} onChange={e=>setWork(e.target.value)} placeholder={current.type==="FRQ"?"Show your reasoning, equations, units, and conclusion…":"Record your selected letter and a brief reason…"}/><div className="submit-row"><span>When ready, record your self-check. No answer is guessed or revealed.</span><button className="primary" onClick={()=>{if(!work.trim())setNotice("Add your answer or reasoning before submitting.");else setSubmitted(true);}}>Submit response <span>→</span></button></div></div> : <div className="feedback"><div className="eyebrow">SELF-CHECK & REFLECTION</div><div className="feedback-banner review-feedback"><b>Response saved</b><span>This source question is indexed to the PDF page. A verified answer key is not linked to this question record, so the site will not invent one.</span></div><div className="self-check-row"><span>How did it go?</span>{(["correct","missed","unsure"] as const).map(r=><button key={r} disabled={!!selfResult} className={`self-check ${selfResult===r?"selected":""}`} onClick={()=>markSelfCheck(r)}>{r==="correct"?"Got it":r==="missed"?"Missed it":"Not sure"}</button>)}</div>{selfResult==="missed"&&<div className="guided-review"><b>Step-by-step mistake review</b><ol><li>Restate what the prompt asks you to determine, explain, calculate, or represent.</li><li>Identify the AP Chemistry unit/topic and the rule, relationship, or representation it requires.</li><li>Check your setup: species and charges, balanced atoms, units, significant figures, and signs where relevant.</li><li>Compare each step with the official scoring guide in the source bank; mark the exact step where your reasoning changed.</li></ol><p>The compiled bank’s scoring guides are retained in the PDF, but are not yet linked to individual indexed questions.</p></div>}{selfResult&&<button className="primary submit-btn" onClick={nextQuestion}>{activeIndex+1===activeQueue.length?"Finish session":"Next question"}<span>→</span></button>}</div>}
        <div className="question-foot"><span>Primary topic: <b>{current.displayName}</b></span>{current.multiConcept&&<span className="multi-tag">MULTI-CONCEPT FRQ</span>}{current.secondaryTopicNames?.map(n=><span className="secondary-tag" key={n}>Also: {n}</span>)}<span className="source-note">Source: {bankName(current.sourceBank)} · original page {originalPagesFor(current)[pageIndex]}</span></div></div></div>}
      {view === "practice" && showWorksheet && <section className="page worksheet" ref={worksheetRef}>
        <div className="worksheet-actions">
          <button className="back" onClick={() => { setShowWorksheet(false); setNotice(""); }}>← Back to session</button>
          <button className="primary" onClick={printWorksheet}>Print or save PDF</button>
        </div>
        <h1 className="page-title">AP Chemistry practice worksheet</h1>
        {planWorksheet(activeQueue, stimulusDocument.stimuli, originalPagesFor).map(({ question, segments }, position) => (
          <article key={question.id}>
            <h2>{position + 1}. {question.year || "Source bank"} · {question.type} {question.number}</h2>
            {segments.map(({ page, regions, stimulusId }, segmentIndex) => {
              const file = catalog.sourceFiles?.find(source => page >= source.from && page <= source.to);
              const bankId = question.sourceBank || "mega";
              return <div key={segmentIndex} data-stimulus-id={stimulusId}>
                {stimulusId && <h3>Shared stimulus</h3>}
                <PdfQuestionPage page={bankId === "mega" && file ? page - file.from + 1 : page}
                  sourcePage={page} bankId={bankId} bankName={bankName(bankId)}
                  sourceAsset={file?.url} sourceRegions={regions} cropView={regions.length > 0}/>
              </div>;
            })}
            {segments.length === 0 && <p>See the source page included earlier in this worksheet.</p>}
            <div className="worksheet-answer" aria-hidden="true" />
          </article>
        ))}
      </section>}
      {view === "practice" && !current && <div className="page narrow"><div className="empty-state"><span>✦</span><b>No questions in this session</b><p>Choose a unit or topic with indexed questions.</p><button className="primary" onClick={()=>navigate("library")}>Browse questions</button></div></div>}

      {view === "progress" && <div className="page"><div className="eyebrow">YOUR LEARNING, OVER TIME</div><h1 className="page-title">Progress & patterns</h1><p className="muted">Attempts, missed questions, and repeated review needs are saved in this browser.</p><div className="panel" style={{marginBlock:"1rem"}}><div className="eyebrow">DOMAIN MIGRATION</div><h2>Export or import browser progress</h2><p className="muted">Transfer attempts, topic overrides, and session count between your old and new ChemAtlas addresses. Import replaces the current browser’s progress. Uploaded personal PDF files are stored separately in IndexedDB and are not included in this progress export.</p><div style={{display:"flex",gap:"0.75rem",alignItems:"center",flexWrap:"wrap"}}><button className="outline" onClick={exportBrowserProgress}>Export progress (.json)</button><label className="outline" style={{cursor:"pointer",padding:"0.65rem 1rem"}}>Import progress (.json)<input type="file" accept=".json,application/json" style={{display:"none"}} onChange={e=>{void importBrowserProgress(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/></label></div></div><div className="stats progress-stats"><div className="stat"><span className="stat-icon peach">↗</span><div><small>TOTAL ATTEMPTS</small><b>{attempts}</b></div></div><div className="stat"><span className="stat-icon rose">⌁</span><div><small>MISSED ANSWERS</small><b>{misses}</b></div></div><div className="stat"><span className="stat-icon lavender">✦</span><div><small>CONCEPTS MASTERED</small><b>{mastered}</b></div></div></div><div className="panel"><div className="panel-head"><div><div className="eyebrow">FOCUS NEXT</div><h2>Concepts to revisit</h2></div><button className="outline" onClick={()=>reviewSession()}>Build review session →</button></div>{weakConcepts.length?weakConcepts.map(c=><div className="weak-row" key={c.id}><div className="weak-icon">⌁</div><div><b>{c.id} · {c.name}</b><small>{c.ids.size} question{c.ids.size===1?"":"s"} attempted</small></div><span className="missed-count">{c.wrong} missed · {c.attempts} attempts</span><button className="row-arrow" onClick={()=>reviewSession(c.id)}>Practice →</button></div>):<div className="empty-state"><span>✧</span><b>Your review map will grow as you practice</b><p>Mark a response as missed to focus future sessions on that question and topic.</p></div>}</div><div className="panel history-panel"><div className="eyebrow">MISSED QUESTIONS</div><h2>Question history</h2>{weakRows.length?weakRows.slice(0,60).map(q=><div className="history-row" key={q.id}><span className="history-x">↻</span><div><b>{q.type} {q.number} · {q.displayName}</b><small>{q.year || q.exam} · {q.source}</small></div><span>{progress[q.id]?.wrong} missed</span><button className="row-arrow" onClick={()=>{setQueue([q]);setIndex(0);setPageIndex(0);setSubmitted(false);setSelfResult(null);setWork("");navigate("practice",{questionId:q.id,sessionIds:[q.id],step:0});}}>Review →</button></div>):<div className="small-empty">No missed questions yet.</div>}</div></div>}

      {view === "audit" && <div className="page"><div className="eyebrow">CHECK EVERY SOURCE PAGE</div><h1 className="page-title">Source page audit</h1><p className="muted">These counts show which PDF pages currently have question records. Unlinked pages can be covers, directions, tables, answer material, or missed questions; the image must be checked before deciding.</p><div className="stats catalog-stats"><div className="stat"><div><small>ORIGINAL PDF PAGES</small><b>{catalog.audit?.totalPages || catalog.sourcePages}</b></div></div><div className="stat"><div><small>PAGES LINKED TO RECORDS</small><b>{catalog.audit?.pagesReferencedByQuestionRecords || 0}</b></div></div><div className="stat"><div><small>UNLINKED PAGES TO INSPECT</small><b>{catalog.audit?.unresolvedPages || 0}</b></div></div><div className="stat"><div><small>QUESTIONS NEEDING TOPIC REVIEW</small><b>{reviewQuestions.length}</b></div></div></div><div className="panel audit-panel"><div className="panel-head"><div><div className="eyebrow">ORIGINAL SOURCE IMAGE</div><h2>Unlinked page {auditPage} of {catalog.audit?.totalPages || catalog.sourcePages}</h2></div><label>GO TO PAGE<input type="number" min="1" max={catalog.audit?.totalPages || catalog.sourcePages} value={auditPage} onChange={e=>setAuditPage(Math.max(1,Math.min(catalog.audit?.totalPages || catalog.sourcePages,Number(e.target.value)||1)))}/></label></div><p className="muted">If this page contains a question that needs indexing, use “Add a question reference” under Manage test banks. Page images remain the compiled PDF exactly as provided.</p>{(()=>{const file=catalog.sourceFiles?.find(f=>auditPage>=f.from&&auditPage<=f.to);return file?<PdfQuestionPage page={auditPage-file.from+1} sourcePage={auditPage} bankName="AP Chemistry MEGA Compiled Test Bank.pdf" sourceAsset={file.url}/>:<div className="pdf-error">The source page file is unavailable.</div>;})()}<div className="catalog-pagination"><button className="outline" disabled={auditPage<=1} onClick={()=>setAuditPage(p=>p-1)}>← Previous page</button><span>Page {auditPage} · {catalog.audit?.unreferencedPages?.includes(auditPage)?"no question record linked":"question record linked"}</span><button className="outline" disabled={auditPage>=(catalog.audit?.totalPages || catalog.sourcePages)} onClick={()=>setAuditPage(p=>p+1)}>Next page →</button></div><div className="audit-note"><b>Classification status</b><p>{catalog.audit?.coverageNote}</p><a href="/page-audit.json" target="_blank" rel="noreferrer">Open complete page list</a> · <a href="/classification-method.md" target="_blank" rel="noreferrer">Read method and topic boundaries</a></div></div></div>}

      {view === "review" && <div className="page"><div className="eyebrow">KEEP UNCERTAIN MATCHES VISIBLE</div><h1 className="page-title">{reviewKind==="legacy"?"Legacy content":"Classification review"}</h1><p className="muted">The catalog does not guess a topic when the extracted question text is ambiguous. Assign a primary College Board topic below; the page image remains the authority.</p><div className="panel review-panel"><div className="panel-head"><div><h2>{reviewKind==="legacy"?"Outside the current AP framework":"Needs topic verification"}</h2><span className="muted">{reviewList.length} questions · {catalog.stats.multiConceptFrq || 0} multi-concept FRQs flagged</span></div><button className="outline" onClick={()=>navigate("library")}>Browse classified →</button></div><div className="review-controls"><button className={reviewKind==="review"?"primary":"outline"} onClick={()=>{setReviewKind("review");setResultPage(0);}}>Unresolved ({reviewQuestions.length})</button><button className={reviewKind==="legacy"?"primary":"outline"} onClick={()=>{setReviewKind("legacy");setResultPage(0);}}>Legacy ({legacyQuestions.length})</button><input value={query} onChange={e=>updateFilters({ query: e.target.value })} placeholder="Search these records" aria-label="Search review records"/></div>{reviewList.slice(resultPage*50,(resultPage+1)*50).map(q=><div className="review-row expanded-review" key={q.id}><span className="review-mark">?</span><div className="review-copy"><b>{q.year || "Source bank"} · {q.type} {q.number}</b><small>{q.reviewReason || q.classificationRationale || q.textPreview}</small><div className="review-source">Original PDF pages {originalPagesFor(q).join(", ")} · {q.source}</div></div><select value={overrides[q.id] ?? ""} onChange={e=>e.target.value?updateClassification(q,e.target.value):addReviewItem(q)}><option value="">Choose primary topic…</option>{catalog.units.map(u=><optgroup key={u.id} label={`${u.id.toUpperCase()} · ${u.name}`}>{u.topics.map(([tid,name])=><option key={tid} value={tid}>{tid} · {name}</option>)}</optgroup>)}</select><button className="outline compact" onClick={()=>openQuestion(q)}>View image</button></div>)}{reviewList.length>50&&<div className="catalog-pagination"><button className="outline" disabled={resultPage===0} onClick={()=>setResultPage(p=>p-1)}>← Previous</button><span>Page {resultPage+1} of {Math.ceil(reviewList.length/50)}</span><button className="outline" disabled={(resultPage+1)*50>=reviewList.length} onClick={()=>setResultPage(p=>p+1)}>Next →</button></div>}{!reviewList.length&&<div className="empty-state"><span>✓</span><b>No records in this view</b><p>Try another search or open the question catalog.</p></div>}</div></div>}

      {view === "banks" && <div className="page"><div className="eyebrow">SOURCE FILES & QUESTION INDEX</div><h1 className="page-title">Manage test banks</h1><p className="muted">Add a PDF without replacing existing banks or clearing progress. Then index its questions with page references and a primary College Board topic.</p><div className="bank-layout"><div className="panel import-panel"><div className="panel-head"><div><div className="eyebrow">ADD SOURCE PDF</div><h2>Bring in another test bank</h2></div><span className="import-icon">＋</span></div><label className="upload-zone"><input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(e:ChangeEvent<HTMLInputElement>)=>{void importPdf(e.target.files?.[0]);e.currentTarget.value=""}}/><span className="upload-icon">↑</span><b>{uploading?"Saving PDF…":"Choose a PDF to add"}</b><small>PDF is stored in this browser and kept alongside your current question bank. Add page references below to index its questions.</small><span className="upload-button">Browse files</span></label><div className="import-note"><b>Progress is preserved</b><p>New question records merge into this browser’s saved catalog. Existing question IDs, topic assignments, and attempt history remain intact.</p></div></div><div className="panel schema-panel"><div className="eyebrow">MANUAL SOURCE INDEX</div><h2>Add a question reference</h2><p>The question image will be rendered directly from the PDF page. Confirm its topic against the page before adding it.</p><label>Source bank<select value={newQuestionBank} onChange={e=>setNewQuestionBank(e.target.value)}>{banks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><div className="manual-fields"><label>PDF page<input value={newQuestionPage} onChange={e=>setNewQuestionPage(e.target.value)} type="number" min="1" placeholder="e.g. 12"/></label><label>Question #<input value={newQuestionNumber} onChange={e=>setNewQuestionNumber(e.target.value)} type="number" min="1" placeholder="e.g. 4"/></label></div><label>Question type<select value={newQuestionType} onChange={e=>setNewQuestionType(e.target.value as "MCQ"|"FRQ")}><option value="FRQ">Free response</option><option value="MCQ">Multiple choice</option></select></label><label>Primary topic<select value={newQuestionTopic} onChange={e=>setNewQuestionTopic(e.target.value)}><option value="">Choose topic…</option>{catalog.units.map(u=><optgroup key={u.id} label={`${u.id.toUpperCase()} · ${u.name}`}>{u.topics.map(([id,name])=><option key={id} value={id}>{id} · {name}</option>)}</optgroup>)}</select></label><button className="primary full" onClick={addSourceQuestion}>Add source question <span>→</span></button></div></div><div className="panel bank-list"><div className="panel-head"><div><div className="eyebrow">IN YOUR LIBRARY</div><h2>Source banks</h2></div><span className="bank-count">{banks.length} PDFs</span></div>{banks.map(b=><div className="bank-row" key={b.id}><span className="file-mark">PDF</span><div><b>{b.name}</b><small>{b.id==="mega"?`${catalog.sourcePages.toLocaleString()} pages · ${catalog.questions.length.toLocaleString()} indexed question records`: `${(b.size/1024/1024).toFixed(1)} MB · ${catalog.questions.filter(q=>q.sourceBank===b.id).length} indexed questions`}</small></div><span className="ready-label">Preserved</span></div>)}</div></div>}

      <footer className="footer">College Board unit/topic map <span>·</span> Original source pages <span>·</span> Progress saved locally</footer>
    </main>
  </div>;
}

