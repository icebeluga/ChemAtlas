"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, BookOpen, FileText, FlaskConical } from "lucide-react";
import { getStimuli, pdfSource, pdfWorkerUrl, sitePath } from "#student-content";
import { onContentClear } from "@/lib/content-lifecycle";
import { ProtectedDocumentLink } from "@/components/student/protected-document-link";
import { planWorksheet } from "../lib/worksheet.mjs";
import { buildChemAtlasUrl, parseChemAtlasLocation } from "../app/navigation.mjs";
import { serializeProgress, parseProgress } from "../lib/progress-transfer.mjs";
import type { ProgressSnapshot } from "../lib/progress-transfer.mjs";

import { PracticeBuilder } from "@/components/practice-builder";
import { AppTopBar } from "@/components/student/app-top-bar";
import { QuestionBank } from "@/components/student/bank/question-bank";
import { useCatalog } from "@/components/student/hooks/use-catalog";
import type { Catalog, Question } from "@/components/student/hooks/use-catalog";
import { PdfQuestionPage } from "@/components/student/pdf-question-page";
import { readPdf, savePdf } from "@/components/student/pdf-bank-store";
import { sourcePageLocation } from "@/lib/question-source";
import { filterQuestions } from "@/lib/question-filter";
import { addEntries } from "@/lib/worksheet";
import { downloadWorksheetBackup, useWorksheets } from "@/components/student/hooks/use-worksheets";
import { WorksheetLegacyRecovery } from "@/components/student/worksheet-legacy-recovery";

const emptySourceFiles: NonNullable<Catalog["sourceFiles"]> = [];

type AppView = "desk" | "unit" | "library" | "builder" | "detail" | "practice" | "progress" | "review" | "banks" | "audit";
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
const bankViewportQuery = "(min-width: 701px)";
function subscribeToBankViewport(callback: () => void) {
  const viewport = matchMedia(bankViewportQuery);
  viewport.addEventListener("change", callback);
  return () => viewport.removeEventListener("change", callback);
}
const getWideBankViewport = () => matchMedia(bankViewportQuery).matches;
const getServerBankViewport = () => true;

export function ChemAtlas({ worksheet: initialWorksheet = false, onSignOut }: { worksheet?: boolean; onSignOut?: () => void }) {
  const stimulusDocument = getStimuli();
  const locationHref = useSyncExternalStore(subscribeToNavigation, getNavigationSnapshot, getServerNavigationSnapshot);
  const worksheet = locationHref === getServerNavigationSnapshot() ? initialWorksheet
    : new URL(locationHref).pathname.replace(/\/$/, "") === sitePath("practice-builder").replace(/\/$/, "");
  const wideBank = useSyncExternalStore(subscribeToBankViewport, getWideBankViewport, getServerBankViewport);
  const route = parseChemAtlasLocation(new URL(locationHref).search);
  const view = route.view as AppView;
  const bankView = !worksheet && (view === "desk" || view === "unit" || view === "library" || view === "detail");
  const phonePane = bankView && !wideBank && view === "detail" && !!route.questionId;
  const selectedUnit = route.unit;
  const selectedTopic = route.topic;
  const typeFilter = route.type;
  const query = route.query;
  const [notice, setNotice] = useState("");
  const [pendingProgressImport, setPendingProgressImport] = useState<ProgressSnapshot | null>(null);
  const progressImportDialog = useRef<HTMLDialogElement>(null);
  const progressImportInput = useRef<HTMLInputElement>(null);
  const progressImportButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = progressImportDialog.current;
    if (!dialog) return;
    if (pendingProgressImport && !dialog.open) dialog.showModal();
    else if (!pendingProgressImport && dialog.open) dialog.close();
  }, [pendingProgressImport]);
  const [catalogLoadFailed, setCatalogLoadFailed] = useState(false);
  const onCatalogError = useCallback((message: string) => {
    setCatalogLoadFailed(true);
    setNotice(message);
  }, []);
  const { catalog, topics, questions, browserState, progress, overrides, banks, sessions } = useCatalog(onCatalogError);
  const [showWorksheet, setShowWorksheet] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const wasBankView = useRef(bankView);
  const worksheets = useWorksheets();
  const { backup, warning, rejectedEdits, save: saveWorksheets, activeDraft, worksheetIds,
    importing, pendingImport, importDrafts, discardPendingImport } = worksheets;
  const worksheetWarning = <>
    {warning && backup && <div className="ca-notice" role="status">
      <div>{warning} <button type="button" className="ca-btn" onClick={() => downloadWorksheetBackup(backup)}>Download drafts</button>
        {rejectedEdits?.map((edit, index) => <button key={index} type="button" className="ca-btn"
          onClick={() => downloadWorksheetBackup(edit, `chematlas-rejected-edit-${index + 1}.json`)}>Download rejected edit {index + 1}</button>)}
      </div>
    </div>}
    {importing && <div className="ca-notice" role="status">Importing worksheet drafts…</div>}
    {pendingImport && <div className="ca-notice">
      <div>
        <p role="status">{pendingImport.reason}</p>
        <button type="button" className="ca-btn" onClick={() => downloadWorksheetBackup(pendingImport.backup, "chematlas-pending-import.json")}>Download pending import</button>
        <button type="button" className="ca-btn" onClick={discardPendingImport}>Discard pending import</button>
      </div>
    </div>}
    <WorksheetLegacyRecovery {...worksheets} />
  </>;
  const openWorksheetPdf = useCallback(async (url?: string, bankId?: string) => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl();
    const data = bankId && bankId !== "mega" ? await readPdf(bankId) : undefined;
    if (bankId && bankId !== "mega" && !data) throw new Error("Restore the added bank PDF to open this question.");
    const task = pdfjs.getDocument(data ? { data } : { ...await pdfSource(url ?? "/ap-chemistry-mega.pdf"), rangeChunkSize: 65536 });
    const unregister = onContentClear(() => { void task.destroy(); unregister(); });
    return task.promise;
  }, []);
  const worksheetRef = useRef<HTMLElement>(null);
  const [resultPage, setResultPage] = useState(0);
  const [reviewKind, setReviewKind] = useState("review");
  const [auditPage, setAuditPage] = useState(1);
  const includeReview = false;
  const [queue, setQueue] = useState<Question[]>([]); const [index, setIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0); const [selfResult, setSelfResult] = useState<"correct" | "missed" | "unsure" | null>(null);
  const [work, setWork] = useState(""); const [submitted, setSubmitted] = useState(false);
  const [sessionSize, setSessionSize] = useState(10);
  const [newQuestionPage, setNewQuestionPage] = useState(""); const [newQuestionType, setNewQuestionType] = useState<"MCQ" | "FRQ">("FRQ");
  const [newQuestionNumber, setNewQuestionNumber] = useState(""); const [newQuestionBank, setNewQuestionBank] = useState("mega");
  const [newQuestionTopic, setNewQuestionTopic] = useState(""); const [, setShowAddQuestion] = useState(false);
  const [uploading, setUploading] = useState(false);

  function navigate(next: AppView, updates: RouteUpdates = {}, replace = false, openPhonePane = false) {
    const nextUrl = buildChemAtlasUrl(worksheet ? new URL(sitePath(), locationHref).href : window.location.href, next, updates);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      const state = {
        ...window.history.state,
        chemAtlas: true,
        view: next,
        bankPane: next === "detail" && (openPhonePane || (replace && window.history.state?.bankPane === true)),
      };
      if (replace) window.history.replaceState(state, "", nextUrl);
      else window.history.pushState(state, "", nextUrl);
    }
    setShowWorksheet(false);
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
      setPendingProgressImport(parseProgress(await file.text()));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to read the progress file.");
    }
  }

  function confirmProgressImport() {
    if (!pendingProgressImport) return;
    browserState.set("progress", pendingProgressImport.progress);
    browserState.set("overrides", pendingProgressImport.overrides);
    browserState.set("sessions", pendingProgressImport.sessions);
    setPendingProgressImport(null);
    setNotice("Progress imported. Your bundled catalog and source PDFs were not changed.");
  }

  const sessionQuestions = route.sessionIds.flatMap(id => { const question = questions.find(q => q.id === id); return question ? [question] : []; });
  const routeQuestion = questions.find(q => q.id === route.questionId);
  const activeQueue = view === "practice" && sessionQuestions.length ? sessionQuestions : queue.length ? queue : routeQuestion ? [routeQuestion] : [];
  const activeIndex = view === "practice" && sessionQuestions.length ? Math.min(route.step, sessionQuestions.length - 1) : index;
  const current = view === "detail"
    ? routeQuestion
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
  useEffect(() => {
    if (bankView && !wasBankView.current && !phonePane) {
      mainRef.current?.focus({ preventScroll: true });
    }
    wasBankView.current = bankView;
  }, [bankView, phonePane]);
  const reviewQuestions = questions.filter(q => q.status === "review" || (!q.displayTopic && q.status!=="legacy"));
  const legacyQuestions = questions.filter(q=>q.status==="legacy");
  const reviewList = (reviewKind==="legacy"?legacyQuestions:reviewQuestions).filter(q=>!query || `${q.id} ${q.number} ${q.year} ${q.textPreview} ${q.reviewReason} ${q.legacyConcepts?.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const attempts = Object.values(progress).reduce((n, p) => n + p.attempts, 0);
  const misses = Object.values(progress).reduce((n, p) => n + p.wrong, 0);
  const mastered = Object.values(progress).filter(p => p.correct >= 3 && p.wrong === 0).length;
  const catalogFilters = {
    unit: selectedUnit, topic: selectedTopic, type: typeFilter === "Mixed" ? "all" : typeFilter,
    unitForTopic: (id: string | undefined) => topics.find(topic => topic.id === id)?.unit,
    include: (q: Question) => includeReview || q.status === "classified",
  };
  const filteredQuestions = filterQuestions(questions, {
    ...catalogFilters,
    search: { query, text: q => `${q.year} ${q.exam} ${q.number} ${q.textPreview} ${q.displayName}` },
  });

  const weakRows = useMemo(() => questions.filter(q => progress[q.id]?.wrong).sort((a,b) => (progress[b.id]?.wrong || 0) - (progress[a.id]?.wrong || 0)), [questions, progress]);
  const weakConcepts = useMemo(() => {
    const counts: Record<string, { id: string; name: string; wrong: number; attempts: number; ids: Set<string> }> = {};
    for (const q of questions) { const p = progress[q.id]; if (!p || !q.displayTopic) continue; const k=q.displayTopic; counts[k] ??= { id:k,name:q.displayName ?? q.topicName ?? "Needs classification",wrong:0,attempts:0,ids:new Set() }; counts[k].wrong += p.wrong; counts[k].attempts += p.attempts; counts[k].ids.add(q.id); }
    return Object.values(counts).filter(x=>x.wrong).sort((a,b)=>b.wrong-a.wrong);
  }, [questions, progress]);

  function topicFor(q: Question) { return overrides[q.id] ?? q.primaryTopic ?? undefined; }
  function startSession(focus?: string) {
    const pool = filterQuestions(questions, {
      ...catalogFilters,
      include: q => catalogFilters.include(q) &&
        (focus === "weak" ? (progress[q.id]?.wrong || 0) > 0 : !focus || !!q.relatedTopics?.includes(focus)),
    });
    const shuffled = [...pool].sort(() => Math.random() - .5).slice(0, sessionSize);
    setQueue(shuffled); setIndex(0); setPageIndex(0); setSelfResult(null); setWork(""); setSubmitted(false); browserState.set("sessions", s => s + (shuffled.length ? 1 : 0));
    if (!shuffled.length) setNotice("No matched questions fit those filters yet. Check Review or change the topic/type."); else { setNotice(""); navigate("practice", { questionId: shuffled[0].id, sessionIds: shuffled.map(q => q.id), step: 0 }); }
  }
  function markSelfCheck(result: "correct" | "missed" | "unsure") {
    if (!current || !submitted) return;
    const date = new Date().toISOString().slice(0,10);
    browserState.set("progress", old => { const p = old[current.id] || { attempts:0, wrong:0, correct:0, last:"", history:[] }; return { ...old, [current.id]: { attempts:p.attempts+1, wrong:p.wrong+(result === "missed" ? 1 : 0), correct:p.correct+(result === "correct" ? 1 : 0), last:date, history:[...p.history,{ date, result }] } }; });
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
      browserState.set("banks", old => [...old,bank]); setNewQuestionBank(id); setNotice(`${file.name} is saved. Add page references below to put its questions into your catalog.`);
    } catch { setNotice("The PDF could not be saved in this browser. Check available storage and try again."); }
    finally { setUploading(false); }
  }
  function addSourceQuestion() {
    const page = Number(newQuestionPage); const number = Number(newQuestionNumber); const bank = banks.find(b=>b.id===newQuestionBank);
    if (!bank || !Number.isInteger(page) || page < 1 || !Number.isInteger(number) || number < 1 || !newQuestionTopic) { setNotice("Add a valid source page, question number, and primary topic."); return; }
    const topic = topics.find(t=>t.id===newQuestionTopic)!; const id=`manual-${newQuestionBank}-${page}-${number}-${Date.now()}`;
    const q: Question = { id, type:newQuestionType, year:null, exam:"Added source bank", number, pages:[page], primaryUnit:topic.unit, unitName:topic.unitName, primaryTopic:topic.id, topicName:topic.name, secondaryTopics:[], secondaryTopicNames:[], multiConcept:false, classificationConfidence:1, status:"classified", textPreview:"Manually indexed source page. Open the page image to verify the question and topic.", source:bank.name, sourceBank:newQuestionBank };
    browserState.set("questions", old => [...old, q]); setShowAddQuestion(false); setNewQuestionPage(""); setNewQuestionNumber(""); setNotice("Question added. Progress and existing questions were preserved.");
  }
  function updateClassification(q: Question, value: string) { browserState.set("overrides", old=>({...old,[q.id]:value})); setNotice("Topic assignment saved."); }
  function addReviewItem(q: Question) { browserState.set("overrides", old=>({...old,[q.id]:old[q.id] || ""})); }
  function openQuestion(q: Question) { setQueue([q]); setIndex(0); setPageIndex(0); setSubmitted(false); setSelfResult(null); setWork(""); navigate("detail", { questionId: q.id }); }

  const bankName = (id?: string) => banks.find(b=>b.id===(id || "mega"))?.name || "AP Chemistry MEGA Compiled Test Bank.pdf";
  const originalPagesFor = (q?: Question) => q?.sourcePagesOriginal?.length ? q.sourcePagesOriginal : (q?.pages?.length?q.pages:[1]);
  const pagesFor = (q?: Question) => q?.sourceBank && q.sourceBank!=="mega" ? q.pages : originalPagesFor(q).map(p=>{const file=catalog.sourceFiles?.find(f=>p>=f.from&&p<=f.to);return file?p-file.from+1:p;});
  const sourceAssetFor = (q:Question,i:number) => q.sourceBank && q.sourceBank!=="mega" ? undefined : catalog.sourceFiles?.find(f=>originalPagesFor(q)[i]>=f.from&&originalPagesFor(q)[i]<=f.to)?.url;

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

  // Filters live in the URL. A selected question keeps the "detail" view so its id stays in the address.
  function bankFilters(updates: Pick<RouteUpdates, "unit" | "topic" | "type" | "query">) {
    if (view === "detail") updateFilters(updates); else navigate("library", updates, true);
  }
  function closeBankPane() {
    if (window.history.state?.bankPane === true) window.history.back();
    else navigate("library", {}, true);
  }
  function toggleWorksheetQuestion(id: string) {
    if (!backup || !activeDraft) return;
    const next = worksheetIds.includes(id)
      ? { ...activeDraft, entries: activeDraft.entries.filter(entry => entry.id !== id) }
      : addEntries(activeDraft, [id]);
    saveWorksheets({ ...backup, drafts: backup.drafts.map(draft => draft.id === activeDraft.id ? next : draft) });
  }
  // Preserve normal anchors (open in new tab, copy link), but ordinary in-app
  // navigation keeps the approved session, catalog and worksheet store mounted.
  function followStudentLink(event: React.MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[href]");
    if (!link || link.target || link.hasAttribute("download")) return;
    const target = new URL(link.href);
    if (target.origin !== location.origin || target.hash) return;
    const paths = [sitePath(), sitePath("practice-builder")].map(path => path.replace(/\/$/, ""));
    if (!paths.includes(target.pathname.replace(/\/$/, ""))) return;
    event.preventDefault();
    if (target.href === location.href) return;
    window.history.pushState({ chemAtlas: true }, "", target.href);
    setShowWorksheet(false);
    setResultPage(0);
    window.dispatchEvent(new Event("chematlas:navigate"));
    requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }

  return <div className="ca2" onClick={followStudentLink}>
    <dialog className="ca-progress-dialog" ref={progressImportDialog} role="alertdialog"
      aria-labelledby="progress-import-title" aria-describedby="progress-import-description"
      onClose={() => { setPendingProgressImport(null); progressImportButton.current?.focus(); }}>
      <h2 id="progress-import-title">Replace saved progress?</h2>
      <p id="progress-import-description">Replace this browser’s attempts, topic assignments, and session count with the imported copy. Worksheets and source PDFs stay in place. Export your current progress first if you want to keep it.</p>
      <div className="ca-progress-dialog-actions">
        <button type="button" className="outline" onClick={() => setPendingProgressImport(null)}>Cancel</button>
        <button type="button" className="primary" onClick={confirmProgressImport}>Replace progress</button>
      </div>
    </dialog>
    <a className="ca-skip" href="#main-content" inert={phonePane}>Skip to content</a>
    <AppTopBar current={worksheet ? "worksheet" : bankView ? "bank" : "other"} worksheetCount={worksheetIds.length}
      inert={phonePane} onSignOut={onSignOut}
      onBank={() => navigate("library")}
      search={bankView ? { value: query, onChange: value => bankFilters({ query: value }) } : undefined} />
    {notice && <div className="ca-notice" role="status" inert={phonePane}>{notice}<button type="button" aria-label="Dismiss message" onClick={()=>setNotice("")}>×</button></div>}
    {!phonePane && worksheetWarning}
    {bankView ? <main id="main-content" tabIndex={-1} ref={mainRef}>
      <QuestionBank catalog={catalog} topics={topics} questions={questions} loadFailed={catalogLoadFailed} wide={wideBank}
        unit={selectedUnit} topic={selectedTopic} type={typeFilter} query={query} selectedId={view === "detail" ? route.questionId : ""}
        onFilters={bankFilters} onSelect={(id, replace) => navigate("detail", { questionId: id }, replace, !replace)} onClosePane={closeBankPane}
        worksheetIds={worksheetIds} canEdit={!!backup && !!activeDraft} onToggle={toggleWorksheetQuestion} bankName={bankName}
        worksheetWarning={phonePane ? worksheetWarning : undefined} />
    </main> : worksheet ? <main id="main-content" tabIndex={-1} ref={mainRef}>
      {backup ? <PracticeBuilder questions={questions} topics={topics} progress={progress} onOpenBank={() => navigate("library")}
        files={catalog.sourceFiles ?? emptySourceFiles} backup={backup} save={saveWorksheets} openPdf={openWorksheetPdf}
        importDrafts={importDrafts} importDisabled={!!(importing || pendingImport)}
        renderSource={(question, region) => {
          const location = sourcePageLocation(region.page, catalog.sourceFiles ?? emptySourceFiles, question.sourceBank);
          return <PdfQuestionPage page={location.page} sourcePage={region.page} bankId={location.bankId}
            bankName={question.source} sourceAsset={location.url} cropView={!!region.rect.length} sourceRegions={region.rect.length ? [region] : []} />;
        }} /> : <p className="ca-empty" role="status">Loading Practice Builder…</p>}
    </main> : <div className="app-shell student-workspace">
    <main className="main" id="main-content" tabIndex={-1} ref={mainRef}>
      {view === "builder" && <div className="page builder-page"><section className="builder-intro"><span className="eyebrow">BUILD A FOCUSED PRACTICE SET</span><h1 className="page-title">Practice sessions</h1><p className="muted">Choose a unit, topic, and question type. ChemAtlas will draw a randomized set from the indexed source questions that match.</p></section><div className="builder-layout"><section className="panel builder-panel"><div className="panel-head"><div><span className="eyebrow">YOUR QUESTION SET</span><h2>Set the practice scope</h2></div><span className="builder-symbol"><FileText size={22}/></span></div><div className="builder-controls"><label>UNIT<select value={selectedUnit} onChange={e=>{updateFilters({ unit: e.target.value, topic: "all" });}}><option value="all">All units</option>{catalog.units.map(u=><option key={u.id} value={u.id}>{u.id.toUpperCase()} · {u.name}</option>)}</select></label><label>TOPIC<select value={selectedTopic} onChange={e=>updateFilters({ topic: e.target.value })}><option value="all">All topics</option>{topics.filter(t=>selectedUnit==="all"||t.unit===selectedUnit).map(t=><option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></label><label>QUESTION TYPE<select value={typeFilter} onChange={e=>updateFilters({ type: e.target.value })}><option>Mixed</option><option>MCQ</option><option>FRQ</option></select></label><label>QUESTION COUNT<select value={sessionSize} onChange={e=>setSessionSize(Number(e.target.value))}>{[5,10,15,20,30].map(n=><option key={n} value={n}>{n} questions</option>)}</select></label></div><div className="builder-summary"><span className="builder-summary-icon"><BookOpen size={21}/></span><div><b>{filteredQuestions.length.toLocaleString()} matching questions</b><small>Only classified records appear in this set. Original PDF pages open during practice.</small></div></div><button className="primary builder-start" disabled={!filteredQuestions.length} onClick={()=>startSession()}>{filteredQuestions.length?`Start ${Math.min(sessionSize,filteredQuestions.length)}-question practice`:"No questions match these filters"}<ArrowUpRight size={18}/></button></section><aside className="builder-side"><div className="builder-side-icon"><FlaskConical size={23}/></div><h2>Practice from the source</h2><p>Questions stay linked to their original PDF pages. Submit your response, then record a self-check to build your personal progress map.</p><button className="text-button" onClick={()=>navigate("library")}>Browse the question bank →</button></aside></div></div>}

      {view === "practice" && current && !showWorksheet && <div className="page practice-page"><div className="session-top"><button className="back" onClick={()=>navigate("desk")}>← Exit session</button><button className="outline compact" onClick={() => setShowWorksheet(true)}>Worksheet</button><div className="session-step-controls"><button className="outline compact" disabled={activeIndex <= 0} onClick={()=>goToPracticeIndex(activeIndex-1)}>← Previous</button><span className="session-count">QUESTION {activeIndex+1} <i>/</i> {activeQueue.length}</span></div></div><div className="progress-line"><i style={{width:`${((activeIndex+(submitted?1:0))/activeQueue.length)*100}%`}}/></div><div className="question-meta"><span className={`type-chip ${current.type.toLowerCase()}`}>{current.type==="MCQ"?"MULTIPLE CHOICE":"FREE RESPONSE"}</span><span>{current.displayTopic ? `${current.displayTopic} · ${current.displayName}` : "Needs topic review"}</span><span>·</span><span>{current.year || current.exam}</span></div>
        <div className="question-card source-question"><div className="source-question-head"><div><div className="eyebrow">ORIGINAL QUESTION PAGE</div><h2>{current.year || "Source bank"} · {current.type} {current.number}</h2><p>Exact page image from <b>{bankName(current.sourceBank)}</b></p></div><span className="source-page-count">{pageIndex+1} / {pagesFor(current).length} source page{pagesFor(current).length===1?"":"s"}</span></div>
        <div className="pdf-tabs">{pagesFor(current).map((pg,i)=><button key={originalPagesFor(current)[i]} className={pageIndex===i?"selected":""} onClick={()=>setPageIndex(i)}>Original page {originalPagesFor(current)[i]}</button>)}</div>
        <PdfQuestionPage page={pagesFor(current)[pageIndex]} sourcePage={originalPagesFor(current)[pageIndex]} bankId={current.sourceBank || "mega"} bankName={bankName(current.sourceBank)} sourceAsset={sourceAssetFor(current,pageIndex)} />
        {!submitted ? <div className="response-panel"><label htmlFor="work"><b>Your work / answer</b><span>Write your response here before submitting. The source image remains answer-free.</span></label><textarea id="work" value={work} onChange={e=>setWork(e.target.value)} placeholder={current.type==="FRQ"?"Show your reasoning, equations, units, and conclusion…":"Record your selected letter and a brief reason…"}/><div className="submit-row"><span>When ready, record your self-check. No answer is guessed or revealed.</span><button className="primary" onClick={()=>{if(!work.trim())setNotice("Add your answer or reasoning before submitting.");else setSubmitted(true);}}>Submit response <span>→</span></button></div></div> : <div className="feedback"><div className="eyebrow">SELF-CHECK & REFLECTION</div><div className="feedback-banner review-feedback"><b>Response saved</b><span>This source question is indexed to the PDF page. A verified answer key is not linked to this question record, so the site will not invent one.</span></div><div className="self-check-row"><span>How did it go?</span>{(["correct","missed","unsure"] as const).map(r=><button key={r} disabled={!!selfResult} className={`self-check ${selfResult===r?"selected":""}`} onClick={()=>markSelfCheck(r)}>{r==="correct"?"Got it":r==="missed"?"Missed it":"Not sure"}</button>)}</div>{selfResult==="missed"&&<div className="guided-review"><b>Step-by-step mistake review</b><ol><li>Restate what the prompt asks you to determine, explain, calculate, or represent.</li><li>Identify the AP Chemistry unit/topic and the rule, relationship, or representation it requires.</li><li>Check your setup: species and charges, balanced atoms, units, significant figures, and signs where relevant.</li><li>Compare each step with the official scoring guide in the source bank; mark the exact step where your reasoning changed.</li></ol><p>The compiled bank’s scoring guides are retained in the PDF, but are not yet linked to individual indexed questions.</p></div>}{selfResult&&<button className="primary submit-btn" onClick={nextQuestion}>{activeIndex+1===activeQueue.length?"Finish session":"Next question"}<span>→</span></button>}</div>}
        <div className="question-foot"><span>Primary topic: <b>{current.displayName}</b></span>{current.multiConcept&&<span className="multi-tag">MULTI-CONCEPT FRQ</span>}{current.secondaryTopicNames?.map(n=><span className="secondary-tag" key={n}>Also: {n}</span>)}<span className="source-note">Source: {bankName(current.sourceBank)} · original page {originalPagesFor(current)[pageIndex]}</span></div></div></div>}
      {(view === "practice" && showWorksheet) && <section className="page worksheet" ref={worksheetRef}>
        <div className="worksheet-actions">
          <button className="back" onClick={() => { setShowWorksheet(false); setNotice(""); }}>
            ← Back to session
          </button>
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

      {view === "progress" && <div className="page"><div className="eyebrow">YOUR LEARNING, OVER TIME</div><h1 className="page-title">Progress & patterns</h1><p className="muted">Attempts, missed questions, and repeated review needs are saved in this browser.</p><div className="panel" style={{marginBlock:"1rem"}}><div className="eyebrow">DOMAIN MIGRATION</div><h2>Export or import browser progress</h2><p className="muted">Transfer attempts, topic overrides, and session count between your old and new ChemAtlas addresses. Import replaces the current browser’s progress. Uploaded personal PDF files are stored separately in IndexedDB and are not included in this progress export.</p><div style={{display:"flex",gap:"0.75rem",alignItems:"center",flexWrap:"wrap"}}><button className="outline" onClick={exportBrowserProgress}>Export progress (.json)</button><button type="button" className="outline" ref={progressImportButton} onClick={() => progressImportInput.current?.click()}>Import progress (.json)</button><input ref={progressImportInput} type="file" accept=".json,application/json" style={{display:"none"}} onChange={e=>{void importBrowserProgress(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/></div></div><div className="stats progress-stats"><div className="stat"><span className="stat-icon peach">↗</span><div><small>TOTAL ATTEMPTS</small><b>{attempts}</b></div></div><div className="stat"><span className="stat-icon rose">⌁</span><div><small>MISSED ANSWERS</small><b>{misses}</b></div></div><div className="stat"><span className="stat-icon lavender">✦</span><div><small>CONCEPTS MASTERED</small><b>{mastered}</b></div></div></div><div className="panel"><div className="panel-head"><div><div className="eyebrow">FOCUS NEXT</div><h2>Concepts to revisit</h2></div><button className="outline" onClick={()=>reviewSession()}>Build review session →</button></div>{weakConcepts.length?weakConcepts.map(c=><div className="weak-row" key={c.id}><div className="weak-icon">⌁</div><div><b>{c.id} · {c.name}</b><small>{c.ids.size} question{c.ids.size===1?"":"s"} attempted</small></div><span className="missed-count">{c.wrong} missed · {c.attempts} attempts</span><button className="row-arrow" onClick={()=>reviewSession(c.id)}>Practice →</button></div>):<div className="empty-state"><span>✧</span><b>Your review map will grow as you practice</b><p>Mark a response as missed to focus future sessions on that question and topic.</p></div>}</div><div className="panel history-panel"><div className="eyebrow">MISSED QUESTIONS</div><h2>Question history</h2>{weakRows.length?weakRows.slice(0,60).map(q=><div className="history-row" key={q.id}><span className="history-x">↻</span><div><b>{q.type} {q.number} · {q.displayName}</b><small>{q.year || q.exam} · {q.source}</small></div><span>{progress[q.id]?.wrong} missed</span><button className="row-arrow" onClick={()=>{setQueue([q]);setIndex(0);setPageIndex(0);setSubmitted(false);setSelfResult(null);setWork("");navigate("practice",{questionId:q.id,sessionIds:[q.id],step:0});}}>Review →</button></div>):<div className="small-empty">No missed questions yet.</div>}</div></div>}

      {view === "audit" && <div className="page"><div className="eyebrow">CHECK EVERY SOURCE PAGE</div><h1 className="page-title">Source page audit</h1><p className="muted">These counts show which PDF pages currently have question records. Unlinked pages can be covers, directions, tables, answer material, or missed questions; the image must be checked before deciding.</p><div className="stats catalog-stats"><div className="stat"><div><small>ORIGINAL PDF PAGES</small><b>{catalog.audit?.totalPages || catalog.sourcePages}</b></div></div><div className="stat"><div><small>PAGES LINKED TO RECORDS</small><b>{catalog.audit?.pagesReferencedByQuestionRecords || 0}</b></div></div><div className="stat"><div><small>UNLINKED PAGES TO INSPECT</small><b>{catalog.audit?.unresolvedPages || 0}</b></div></div><div className="stat"><div><small>QUESTIONS NEEDING TOPIC REVIEW</small><b>{reviewQuestions.length}</b></div></div></div><div className="panel audit-panel"><div className="panel-head"><div><div className="eyebrow">ORIGINAL SOURCE IMAGE</div><h2>Unlinked page {auditPage} of {catalog.audit?.totalPages || catalog.sourcePages}</h2></div><label>GO TO PAGE<input type="number" min="1" max={catalog.audit?.totalPages || catalog.sourcePages} value={auditPage} onChange={e=>setAuditPage(Math.max(1,Math.min(catalog.audit?.totalPages || catalog.sourcePages,Number(e.target.value)||1)))}/></label></div><p className="muted">If this page contains a question that needs indexing, use “Add a question reference” under Manage test banks. Page images remain the compiled PDF exactly as provided.</p>{(()=>{const file=catalog.sourceFiles?.find(f=>auditPage>=f.from&&auditPage<=f.to);return file?<PdfQuestionPage page={auditPage-file.from+1} sourcePage={auditPage} bankName="AP Chemistry MEGA Compiled Test Bank.pdf" sourceAsset={file.url}/>:<div className="pdf-error">The source page file is unavailable.</div>;})()}<div className="catalog-pagination"><button className="outline" disabled={auditPage<=1} onClick={()=>setAuditPage(p=>p-1)}>← Previous page</button><span>Page {auditPage} · {catalog.audit?.unreferencedPages?.includes(auditPage)?"no question record linked":"question record linked"}</span><button className="outline" disabled={auditPage>=(catalog.audit?.totalPages || catalog.sourcePages)} onClick={()=>setAuditPage(p=>p+1)}>Next page →</button></div><div className="audit-note"><b>Classification status</b><p>{catalog.audit?.coverageNote}</p><ProtectedDocumentLink path="/student-page-audit.json">Open complete page list</ProtectedDocumentLink> · <ProtectedDocumentLink path="/classification-method.md">Read method and topic boundaries</ProtectedDocumentLink></div></div></div>}

      {view === "review" && <div className="page"><div className="eyebrow">KEEP UNCERTAIN MATCHES VISIBLE</div><h1 className="page-title">{reviewKind==="legacy"?"Legacy content":"Classification review"}</h1><p className="muted">The catalog does not guess a topic when the extracted question text is ambiguous. Assign a primary College Board topic below; the page image remains the authority.</p><div className="panel review-panel"><div className="panel-head"><div><h2>{reviewKind==="legacy"?"Outside the current AP framework":"Needs topic verification"}</h2><span className="muted">{reviewList.length} questions · {catalog.stats.multiConceptFrq || 0} multi-concept FRQs flagged</span></div><button className="outline" onClick={()=>navigate("library")}>Browse classified →</button></div><div className="review-controls"><button className={reviewKind==="review"?"primary":"outline"} onClick={()=>{setReviewKind("review");setResultPage(0);}}>Unresolved ({reviewQuestions.length})</button><button className={reviewKind==="legacy"?"primary":"outline"} onClick={()=>{setReviewKind("legacy");setResultPage(0);}}>Legacy ({legacyQuestions.length})</button><input value={query} onChange={e=>updateFilters({ query: e.target.value })} placeholder="Search these records" aria-label="Search review records"/></div>{reviewList.slice(resultPage*50,(resultPage+1)*50).map(q=><div className="review-row expanded-review" key={q.id}><span className="review-mark">?</span><div className="review-copy"><b>{q.year || "Source bank"} · {q.type} {q.number}</b><small>{q.reviewReason || q.classificationRationale || q.textPreview}</small><div className="review-source">Original PDF pages {originalPagesFor(q).join(", ")} · {q.source}</div></div><select value={overrides[q.id] ?? ""} onChange={e=>e.target.value?updateClassification(q,e.target.value):addReviewItem(q)}><option value="">Choose primary topic…</option>{catalog.units.map(u=><optgroup key={u.id} label={`${u.id.toUpperCase()} · ${u.name}`}>{u.topics.map(([tid,name])=><option key={tid} value={tid}>{tid} · {name}</option>)}</optgroup>)}</select><button className="outline compact" onClick={()=>openQuestion(q)}>View image</button></div>)}{reviewList.length>50&&<div className="catalog-pagination"><button className="outline" disabled={resultPage===0} onClick={()=>setResultPage(p=>p-1)}>← Previous</button><span>Page {resultPage+1} of {Math.ceil(reviewList.length/50)}</span><button className="outline" disabled={(resultPage+1)*50>=reviewList.length} onClick={()=>setResultPage(p=>p+1)}>Next →</button></div>}{!reviewList.length&&<div className="empty-state"><span>✓</span><b>No records in this view</b><p>Try another search or open the question catalog.</p></div>}</div></div>}

      {view === "banks" && <div className="page"><div className="eyebrow">SOURCE FILES & QUESTION INDEX</div><h1 className="page-title">Manage test banks</h1><p className="muted">Add a PDF without replacing existing banks or clearing progress. Then index its questions with page references and a primary College Board topic.</p><div className="bank-layout"><div className="panel import-panel"><div className="panel-head"><div><div className="eyebrow">ADD SOURCE PDF</div><h2>Bring in another test bank</h2></div><span className="import-icon">＋</span></div><label className="upload-zone"><input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(e:ChangeEvent<HTMLInputElement>)=>{void importPdf(e.target.files?.[0]);e.currentTarget.value=""}}/><span className="upload-icon">↑</span><b>{uploading?"Saving PDF…":"Choose a PDF to add"}</b><small>PDF is stored in this browser and kept alongside your current question bank. Add page references below to index its questions.</small><span className="upload-button">Browse files</span></label><div className="import-note"><b>Progress is preserved</b><p>New question records merge into this browser’s saved catalog. Existing question IDs, topic assignments, and attempt history remain intact.</p></div></div><div className="panel schema-panel"><div className="eyebrow">MANUAL SOURCE INDEX</div><h2>Add a question reference</h2><p>The question image will be rendered directly from the PDF page. Confirm its topic against the page before adding it.</p><label>Source bank<select value={newQuestionBank} onChange={e=>setNewQuestionBank(e.target.value)}>{banks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><div className="manual-fields"><label>PDF page<input value={newQuestionPage} onChange={e=>setNewQuestionPage(e.target.value)} type="number" min="1" placeholder="e.g. 12"/></label><label>Question #<input value={newQuestionNumber} onChange={e=>setNewQuestionNumber(e.target.value)} type="number" min="1" placeholder="e.g. 4"/></label></div><label>Question type<select value={newQuestionType} onChange={e=>setNewQuestionType(e.target.value as "MCQ"|"FRQ")}><option value="FRQ">Free response</option><option value="MCQ">Multiple choice</option></select></label><label>Primary topic<select value={newQuestionTopic} onChange={e=>setNewQuestionTopic(e.target.value)}><option value="">Choose topic…</option>{catalog.units.map(u=><optgroup key={u.id} label={`${u.id.toUpperCase()} · ${u.name}`}>{u.topics.map(([id,name])=><option key={id} value={id}>{id} · {name}</option>)}</optgroup>)}</select></label><button className="primary full" onClick={addSourceQuestion}>Add source question <span>→</span></button></div></div><div className="panel bank-list"><div className="panel-head"><div><div className="eyebrow">IN YOUR LIBRARY</div><h2>Source banks</h2></div><span className="bank-count">{banks.length} PDFs</span></div>{banks.map(b=><div className="bank-row" key={b.id}><span className="file-mark">PDF</span><div><b>{b.name}</b><small>{b.id==="mega"?`${catalog.sourcePages.toLocaleString()} pages · ${catalog.questions.length.toLocaleString()} indexed question records`: `${(b.size/1024/1024).toFixed(1)} MB · ${catalog.questions.filter(q=>q.sourceBank===b.id).length} indexed questions`}</small></div><span className="ready-label">Preserved</span></div>)}</div></div>}

      <footer className="footer">College Board unit/topic map <span>·</span> Original source pages <span>·</span> Progress saved locally</footer>
    </main>
    </div>}
  </div>;
}

