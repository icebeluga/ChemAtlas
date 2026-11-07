"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Topic = { id: string; name: string };
type Unit = { id: string; name: string; topics: [string, string][] };
type Question = {
  id: string; type: "MCQ" | "FRQ"; year: string | null; exam: string;
  number: number; pages: number[]; sourcePagesOriginal?: number[]; primaryUnit?: string; unitName?: string;
  primaryTopic?: string | null; topicName?: string | null; secondaryTopics: string[];
  secondaryTopicNames: string[]; multiConcept: boolean; classificationConfidence: number;
  status: "classified" | "review"; reviewReason?: string | null; textPreview: string;
  source: string; sourceBank?: string;
};
type Bank = { id: string; name: string; size: number; addedAt: string; pages?: number };
type Attempt = { attempts: number; wrong: number; correct: number; last: string; history: { date: string; result: "correct" | "missed" | "unsure" }[] };
type Saved = { progress: Record<string, Attempt>; overrides: Record<string, string>; banks: Bank[]; questions: Question[]; sessions: number; sourcePages?: number };
type Catalog = { units: Unit[]; questions: Question[]; sourcePages: number; stats: Record<string, number> };

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

function PdfQuestionPage({ page, sourcePage, bankId, bankName }: { page: number; sourcePage: number; bankId?: string; bankName: string }) {
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
        const docTask = pdfjs.getDocument(data ? { data } : { url: "/ap-chemistry-mega.pdf", rangeChunkSize: 65536 });
        task = docTask;
        const doc = await docTask.promise as PDFDocumentProxy;
        const pdfPage = await doc.getPage(page);
        if (cancelled || !canvas.current || !wrap.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(2, Math.max(0.6, (wrap.current.clientWidth - 24) / base.width));
        const viewport = pdfPage.getViewport({ scale });
        const context = canvas.current.getContext("2d");
        if (!context) throw new Error("Could not display this PDF page.");
        canvas.current.width = Math.ceil(viewport.width); canvas.current.height = Math.ceil(viewport.height);
        canvas.current.style.width = `${Math.ceil(viewport.width)}px`; canvas.current.style.height = `${Math.ceil(viewport.height)}px`;
        await pdfPage.render({ canvas: canvas.current, canvasContext: context, viewport }).promise;
        if (!cancelled) setBusy(false);
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : "Could not render this source page."); setBusy(false); } }
    }
    void render(); return () => { cancelled = true; task?.destroy(); };
  }, [page, bankId]);
  return <div className="pdf-frame" ref={wrap}>
    <div className="pdf-label"><span>PDF SOURCE IMAGE</span><span>{bankName} · original page {sourcePage}</span></div>
    {busy && <div className="pdf-wait">Rendering original page…</div>}
    {error ? <div className="pdf-error">{error}</div> : <canvas ref={canvas} aria-label={`${bankName}, page ${page}`} />}
  </div>;
}

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog>({ units: [], questions: [], sourcePages: 0, stats: {} });
  const [progress, setProgress] = useState<Record<string, Attempt>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [banks, setBanks] = useState<Bank[]>([{ id: "mega", name: "AP Chemistry MEGA Compiled Test Bank.pdf", size: 0, addedAt: "Bundled source" }]);
  const [sessions, setSessions] = useState(0);
  const [view, setView] = useState<"desk" | "library" | "practice" | "progress" | "review" | "banks">("desk");
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [selectedTopic, setSelectedTopic] = useState("all");
  const [typeFilter, setTypeFilter] = useState("Mixed");
  const [query, setQuery] = useState("");
  const [includeReview, setIncludeReview] = useState(false);
  const [queue, setQueue] = useState<Question[]>([]); const [index, setIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0); const [selfResult, setSelfResult] = useState<"correct" | "missed" | "unsure" | null>(null);
  const [work, setWork] = useState(""); const [submitted, setSubmitted] = useState(false);
  const [sessionSize, setSessionSize] = useState(10); const [notice, setNotice] = useState("");
  const [newQuestionPage, setNewQuestionPage] = useState(""); const [newQuestionType, setNewQuestionType] = useState<"MCQ" | "FRQ">("FRQ");
  const [newQuestionNumber, setNewQuestionNumber] = useState(""); const [newQuestionBank, setNewQuestionBank] = useState("mega");
  const [newQuestionTopic, setNewQuestionTopic] = useState(""); const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/questions.json").then(r => r.json()).then((data: Catalog) => setCatalog(data)).catch(() => setNotice("Question catalog could not be loaded."));
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<Saved>;
      setProgress(saved.progress || {}); setOverrides(saved.overrides || {}); setSessions(saved.sessions || 0);
      if (saved.banks?.length) setBanks([{ id: "mega", name: "AP Chemistry MEGA Compiled Test Bank.pdf", size: 0, addedAt: "Bundled source" }, ...saved.banks.filter(b => b.id !== "mega")]);
      if (saved.questions?.length) setCatalog(old => ({ ...old, questions: [...old.questions, ...saved.questions!.filter(q => q.sourceBank)] }));
    } catch { /* keep the bundled bank usable if browser storage is damaged */ }
  }, []);
  useEffect(() => { if (catalog.questions.length) localStorage.setItem(STORAGE_KEY, JSON.stringify({ progress, overrides, banks: banks.filter(b => b.id !== "mega"), questions: catalog.questions.filter(q => q.sourceBank), sessions } satisfies Saved)); }, [catalog.questions, progress, overrides, banks, sessions]);

  const current = queue[index];
  const topics = useMemo(() => catalog.units.flatMap(u => u.topics.map(([id, name]) => ({ id, name, unit: u.id, unitName: u.name }))), [catalog.units]);
  const questions = useMemo(() => catalog.questions.map(q => {
    const topic = overrides[q.id] ?? q.primaryTopic ?? undefined;
    return { ...q, status: overrides[q.id] ? "classified" as const : q.status, displayTopic: topic, displayName: topics.find(t => t.id === topic)?.name ?? q.topicName ?? "Needs classification" };
  }), [catalog.questions, overrides, topics]);
  const reviewQuestions = questions.filter(q => q.status === "review" || !q.displayTopic);
  const available = questions.filter(q => q.status === "classified" && !!q.displayTopic);
  const attempts = Object.values(progress).reduce((n, p) => n + p.attempts, 0);
  const misses = Object.values(progress).reduce((n, p) => n + p.wrong, 0);
  const mastered = Object.values(progress).filter(p => p.correct >= 3 && p.wrong === 0).length;
  const filteredQuestions = useMemo(() => questions.filter(q => {
    const t = topics.find(x => x.id === q.displayTopic);
    return (includeReview || q.status === "classified") && (selectedUnit === "all" || t?.unit === selectedUnit) &&
      (selectedTopic === "all" || q.displayTopic === selectedTopic) && (typeFilter === "Mixed" || q.type === typeFilter) &&
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
      const topicId=topicFor(q), topic=topics.find(t=>t.id===topicId);
      return (includeReview || q.status === "classified") &&
        (focus === "weak" ? (progress[q.id]?.wrong || 0) > 0 : !focus || topicId === focus) &&
        (selectedUnit === "all" || topic?.unit === selectedUnit) &&
        (selectedTopic === "all" || topicId === selectedTopic) &&
        (typeFilter === "Mixed" || q.type === typeFilter);
    });
    const shuffled = [...pool].sort(() => Math.random() - .5).slice(0, sessionSize);
    setQueue(shuffled); setIndex(0); setPageIndex(0); setSelfResult(null); setWork(""); setSubmitted(false); setView("practice"); setSessions(s => s + (shuffled.length ? 1 : 0));
    if (!shuffled.length) setNotice("No matched questions fit those filters yet. Check Review or change the topic/type."); else setNotice("");
  }
  function markSelfCheck(result: "correct" | "missed" | "unsure") {
    if (!current || !submitted) return;
    const date = new Date().toISOString().slice(0,10);
    setProgress(old => { const p = old[current.id] || { attempts:0, wrong:0, correct:0, last:"", history:[] }; return { ...old, [current.id]: { attempts:p.attempts+1, wrong:p.wrong+(result === "missed" ? 1 : 0), correct:p.correct+(result === "correct" ? 1 : 0), last:date, history:[...p.history,{ date, result }] } }; });
    setSelfResult(result);
  }
  function nextQuestion() { if (index + 1 >= queue.length) { setView("progress"); return; } setIndex(index+1); setPageIndex(0); setSelfResult(null); setWork(""); setSubmitted(false); }
  function reviewSession(topic?: string) { if (topic) { const ids = questions.filter(q => topicFor(q) === topic && progress[q.id]?.wrong).map(q=>q.id); setQueue(questions.filter(q=>ids.includes(q.id))); setIndex(0); setView("practice"); setPageIndex(0); setSubmitted(false); setSelfResult(null); setWork(""); } else startSession("weak"); }
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

  const bankName = (id?: string) => banks.find(b=>b.id===(id || "mega"))?.name || "AP Chemistry MEGA Compiled Test Bank.pdf";
  const pagesFor = (q?: Question) => q?.pages?.length ? q.pages : [1];
  const originalPagesFor = (q?: Question) => q?.sourcePagesOriginal?.length ? q.sourcePagesOriginal : pagesFor(q);
  const mainTopicQuestionCounts = (id: string) => available.filter(q => topicFor(q) === id).length;
  const pageTitle = view === "desk" ? "Study desk" : view === "library" ? "Browse the question bank" : view === "practice" ? "Practice session" : view === "progress" ? "Progress & patterns" : view === "review" ? "Classification review" : "Manage test banks";

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandmark">A<span>✦</span></div><div><strong>AP Chem Studio</strong><small>Practice with purpose</small></div></div>
      <div className="side-label">STUDY</div>
      <button className={`nav ${view === "desk" ? "active" : ""}`} onClick={()=>setView("desk")}><span>⌂</span>Study desk</button>
      <button className={`nav ${view === "library" ? "active" : ""}`} onClick={()=>setView("library")}><span>▤</span>Question bank</button>
      <button className={`nav ${view === "progress" ? "active" : ""}`} onClick={()=>setView("progress")}><span>↗</span>Progress</button>
      <button className={`nav ${view === "review" ? "active" : ""}`} onClick={()=>setView("review")}><span>⌕</span>Review queue<i>{reviewQuestions.length}</i></button>
      <div className="sidebar-bottom"><div className="library-mini"><span className="bank-dot"/><div><b>{banks.length} source bank{banks.length===1?"":"s"}</b><small>{questions.length.toLocaleString()} indexed questions</small></div></div><button className="add-bank" onClick={()=>setView("banks")}>＋ Add a test bank</button><div className="profile"><div className="avatar">J</div><div><b>Study profile</b><small>Progress saved here</small></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobile-brand" onClick={()=>setView("desk")}>AP Chem Studio</button><div className="crumb">Practice <span>›</span> {pageTitle}</div><div className="topright"><span className="streak">{sessions} session{sessions===1?"":"s"} completed</span><span className="eyedot"/></div></header>
      {notice && <div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}

      {view === "desk" && <div className="page">
        <section className="welcome"><div><div className="eyebrow"><span className="eyedot"/>YOUR AP CHEMISTRY WORKSPACE</div><h1>Make each question<br/><em>count.</em></h1><p>Practice from the compiled bank, organized by the College Board’s nine units and their topics.</p><button className="primary" onClick={()=>{setSelectedTopic("all");setSelectedUnit("all");startSession();}}>Build a practice session <span>→</span></button></div><div className="hero-art"><div className="orb orb-a"/><div className="orb orb-b"/><div className="hero-atom">e⁻</div><div className="hero-molecule">N≡N</div></div></section>
        <div className="stats"><div className="stat"><span className="stat-icon peach">▤</span><div><small>QUESTIONS INDEXED</small><b>{questions.length.toLocaleString()}</b></div></div><div className="stat"><span className="stat-icon rose">↻</span><div><small>ATTEMPTS LOGGED</small><b>{attempts}</b></div></div><div className="stat"><span className="stat-icon lavender">⌁</span><div><small>MISSED TO REVIEW</small><b>{misses}</b></div></div><div className="stat"><span className="stat-icon mint">✦</span><div><small>CONCEPTS MASTERED</small><b>{mastered}</b></div></div></div>
        <div className="section-head"><div><div className="eyebrow">PICK UP WHERE YOU NEED</div><h2>Choose a way to practice</h2></div><button className="text-button" onClick={()=>setView("progress")}>See progress →</button></div>
        <div className="cards"><button className="session-card" onClick={()=>{setSelectedUnit("all");setSelectedTopic("all");setView("library");}}><span className="card-icon green">⌘</span><span className="card-tag">BUILD A SESSION</span><h3>Mix questions across units</h3><p>Choose topics, FRQs, multiple choice, or a blend.</p><span className="card-link">{available.length.toLocaleString()} classified questions <b>↗</b></span></button><button className="session-card" onClick={()=>setView("review")}><span className="card-icon pink">⌕</span><span className="card-tag">CHECK THE INDEX</span><h3>Verify topic assignments</h3><p>Questions that need a human topic match stay visible here.</p><span className="card-link">{reviewQuestions.length} awaiting review <b>↗</b></span></button><button className="session-card" onClick={()=>reviewSession()}><span className="card-icon sand">⌁</span><span className="card-tag">YOUR WEAK AREAS</span><h3>Review missed questions</h3><p>Build a focused set from your recorded attempts.</p><span className="card-link">{weakRows.length ? `${weakRows.length} questions to revisit` : "Start after your first session"} <b>↗</b></span></button></div>
        <div className="section-head topic-head"><div><div className="eyebrow">COLLEGE BOARD COURSE FRAMEWORK</div><h2>Browse by unit</h2></div><button className="text-button" onClick={()=>setView("library")}>All topics →</button></div>
        <div className="unit-grid">{catalog.units.map((u,i)=><button className="unit-card" key={u.id} onClick={()=>{setSelectedUnit(u.id);setSelectedTopic("all");setView("library");}}><span className={`unit-no u${i+1}`}>UNIT {i+1}</span><b>{u.name}</b><small>{u.topics.length} topics · {available.filter(q=>q.primaryUnit===u.id).length} classified questions</small></button>)}</div>
        <div className="footnote">Question images are rendered from the original PDF pages. Automated topic matches are a first pass; use Classification review to correct or finish uncertain assignments.</div>
      </div>}

      {view === "library" && <div className="page">
        <div className="eyebrow">SOURCE PAGES · CURRICULUM INDEX</div><h1 className="page-title">Question bank</h1><p className="muted">Choose a topic, then open a source-page image. FRQs with more than one strong concept show a primary topic and highlighted secondary concepts.</p>
        <div className="library-filters"><label>UNIT<select value={selectedUnit} onChange={e=>{setSelectedUnit(e.target.value);setSelectedTopic("all");}}><option value="all">All units</option>{catalog.units.map(u=><option key={u.id} value={u.id}>{u.id.toUpperCase()} · {u.name}</option>)}</select></label><label>TOPIC<select value={selectedTopic} onChange={e=>setSelectedTopic(e.target.value)}><option value="all">All topics</option>{topics.filter(t=>selectedUnit==="all"||t.unit===selectedUnit).map(t=><option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></label><label>TYPE<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option>Mixed</option><option>MCQ</option><option>FRQ</option></select></label><label className="search-label">SEARCH<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Year, question number, keyword"/></label></div>
        <div className="topic-shortcuts">{topics.filter(t=>selectedUnit==="all"||t.unit===selectedUnit).map(t=><button key={t.id} className={selectedTopic===t.id?"topic-tag chosen":"topic-tag"} onClick={()=>setSelectedTopic(selectedTopic===t.id?"all":t.id)}><span>{t.id}</span>{t.name}<i>{mainTopicQuestionCounts(t.id)}</i></button>)}</div>
        <div className="library-results-head"><b>{filteredQuestions.length.toLocaleString()} question{filteredQuestions.length===1?"":"s"}</b><div className="library-actions"><label><input type="checkbox" checked={includeReview} onChange={e=>setIncludeReview(e.target.checked)}/> Include questions marked for review</label><select aria-label="Session length" value={sessionSize} onChange={e=>setSessionSize(Number(e.target.value))}>{[5,10,15,20].map(n=><option value={n} key={n}>{n} questions</option>)}</select><button className="primary" onClick={()=>startSession(selectedTopic!=="all"?selectedTopic:undefined)}>Start filtered session →</button></div></div>
        <div className="question-list">{filteredQuestions.slice(0,300).map(q=>{const t=topics.find(x=>x.id===q.displayTopic);const original=originalPagesFor(q);return <article className="catalog-row" key={q.id}><button className="catalog-main" onClick={()=>{setQueue([q]);setIndex(0);setPageIndex(0);setSubmitted(false);setSelfResult(null);setWork("");setView("practice");}}><span className={`type-chip ${q.type.toLowerCase()}`}>{q.type}</span><span className="catalog-info"><b>{q.year || "Added bank"} · Question {q.number}</b><small>{q.displayTopic ? `${q.displayTopic} ${q.displayName}` : "Needs classification"} · {original.length===1?`Original PDF page ${original[0]}`:`Original PDF pages ${original[0]}–${original[original.length-1]}`}</small><span className="preview-line">{q.textPreview}</span></span><span className="catalog-arrow">Open page ↗</span></button><div className="catalog-tags"><span className="curriculum-tag">{t ? t.unit.toUpperCase() : "REVIEW"}</span>{q.multiConcept && <span className="multi-tag">MULTI-CONCEPT FRQ</span>}{q.secondaryTopicNames?.slice(0,4).map((n,i)=><span className="secondary-tag" key={`${n}-${i}`}>Also: {n}</span>)}{q.status==="review"&&<span className="review-label">Check match</span>}</div></article>;})}{filteredQuestions.length>300&&<div className="small-empty">Showing the first 300 matches. Narrow by unit, topic, type, or search.</div>}{!filteredQuestions.length&&<div className="empty-state"><span>⌕</span><b>No questions match these filters</b><p>Try another topic, or review uncategorized questions.</p><button className="outline" onClick={()=>setView("review")}>Open classification review</button></div>}</div>
        <div className="curriculum-note"><b>Curriculum source</b> · AP Chemistry Course and Exam Description, College Board. Topic codes and names follow its nine-unit framework.</div>
      </div>}

      {view === "practice" && current && <div className="page practice-page"><div className="session-top"><button className="back" onClick={()=>setView("desk")}>← Exit session</button><span className="session-count">QUESTION {index+1} <i>/</i> {queue.length}</span></div><div className="progress-line"><i style={{width:`${((index+(submitted?1:0))/queue.length)*100}%`}}/></div><div className="question-meta"><span className={`type-chip ${current.type.toLowerCase()}`}>{current.type==="MCQ"?"MULTIPLE CHOICE":"FREE RESPONSE"}</span><span>{current.displayTopic ? `${current.displayTopic} · ${current.displayName}` : "Needs topic review"}</span><span>·</span><span>{current.year || current.exam}</span></div>
        <div className="question-card source-question"><div className="source-question-head"><div><div className="eyebrow">ORIGINAL QUESTION PAGE</div><h2>{current.year || "Source bank"} · {current.type} {current.number}</h2><p>Exact page image from <b>{bankName(current.sourceBank)}</b></p></div><span className="source-page-count">{pageIndex+1} / {pagesFor(current).length} source page{pagesFor(current).length===1?"":"s"}</span></div>
        <div className="pdf-tabs">{pagesFor(current).map((pg,i)=><button key={pg} className={pageIndex===i?"selected":""} onClick={()=>setPageIndex(i)}>Original page {originalPagesFor(current)[i]}</button>)}</div>
        <PdfQuestionPage page={pagesFor(current)[pageIndex]} sourcePage={originalPagesFor(current)[pageIndex]} bankId={current.sourceBank || "mega"} bankName={bankName(current.sourceBank)} />
        {!submitted ? <div className="response-panel"><label htmlFor="work"><b>Your work / answer</b><span>Write your response here before submitting. The source image remains answer-free.</span></label><textarea id="work" value={work} onChange={e=>setWork(e.target.value)} placeholder={current.type==="FRQ"?"Show your reasoning, equations, units, and conclusion…":"Record your selected letter and a brief reason…"}/><div className="submit-row"><span>When ready, record your self-check. No answer is guessed or revealed.</span><button className="primary" onClick={()=>{if(!work.trim())setNotice("Add your answer or reasoning before submitting.");else setSubmitted(true);}}>Submit response <span>→</span></button></div></div> : <div className="feedback"><div className="eyebrow">SELF-CHECK & REFLECTION</div><div className="feedback-banner review-feedback"><b>Response saved</b><span>This source question is indexed to the PDF page. A verified answer key is not linked to this question record, so the site will not invent one.</span></div><div className="self-check-row"><span>How did it go?</span>{(["correct","missed","unsure"] as const).map(r=><button key={r} disabled={!!selfResult} className={`self-check ${selfResult===r?"selected":""}`} onClick={()=>markSelfCheck(r)}>{r==="correct"?"Got it":r==="missed"?"Missed it":"Not sure"}</button>)}</div>{selfResult==="missed"&&<div className="guided-review"><b>Step-by-step mistake review</b><ol><li>Restate what the prompt asks you to determine, explain, calculate, or represent.</li><li>Identify the AP Chemistry unit/topic and the rule, relationship, or representation it requires.</li><li>Check your setup: species and charges, balanced atoms, units, significant figures, and signs where relevant.</li><li>Compare each step with the official scoring guide in the source bank; mark the exact step where your reasoning changed.</li></ol><p>The compiled bank’s scoring guides are retained in the PDF, but are not yet linked to individual indexed questions.</p></div>}{selfResult&&<button className="primary submit-btn" onClick={nextQuestion}>{index+1===queue.length?"Finish session":"Next question"}<span>→</span></button>}</div>}
        <div className="question-foot"><span>Primary topic: <b>{current.displayName}</b></span>{current.multiConcept&&<span className="multi-tag">MULTI-CONCEPT FRQ</span>}{current.secondaryTopicNames?.map(n=><span className="secondary-tag" key={n}>Also: {n}</span>)}<span className="source-note">Source: {bankName(current.sourceBank)} · original page {originalPagesFor(current)[pageIndex]}</span></div></div></div>}
      {view === "practice" && !current && <div className="page narrow"><div className="empty-state"><span>✦</span><b>No questions in this session</b><p>Choose a unit or topic with indexed questions.</p><button className="primary" onClick={()=>setView("library")}>Browse questions</button></div></div>}

      {view === "progress" && <div className="page"><div className="eyebrow">YOUR LEARNING, OVER TIME</div><h1 className="page-title">Progress & patterns</h1><p className="muted">Attempts, missed questions, and repeated review needs are saved in this browser.</p><div className="stats progress-stats"><div className="stat"><span className="stat-icon peach">↗</span><div><small>TOTAL ATTEMPTS</small><b>{attempts}</b></div></div><div className="stat"><span className="stat-icon rose">⌁</span><div><small>MISSED ANSWERS</small><b>{misses}</b></div></div><div className="stat"><span className="stat-icon lavender">✦</span><div><small>CONCEPTS MASTERED</small><b>{mastered}</b></div></div></div><div className="panel"><div className="panel-head"><div><div className="eyebrow">FOCUS NEXT</div><h2>Concepts to revisit</h2></div><button className="outline" onClick={()=>reviewSession()}>Build review session →</button></div>{weakConcepts.length?weakConcepts.map(c=><div className="weak-row" key={c.id}><div className="weak-icon">⌁</div><div><b>{c.id} · {c.name}</b><small>{c.ids.size} question{c.ids.size===1?"":"s"} attempted</small></div><span className="missed-count">{c.wrong} missed · {c.attempts} attempts</span><button className="row-arrow" onClick={()=>reviewSession(c.id)}>Practice →</button></div>):<div className="empty-state"><span>✧</span><b>Your review map will grow as you practice</b><p>Mark a response as missed to focus future sessions on that question and topic.</p></div>}</div><div className="panel history-panel"><div className="eyebrow">MISSED QUESTIONS</div><h2>Question history</h2>{weakRows.length?weakRows.slice(0,60).map(q=><div className="history-row" key={q.id}><span className="history-x">↻</span><div><b>{q.type} {q.number} · {q.displayName}</b><small>{q.year || q.exam} · {q.source}</small></div><span>{progress[q.id]?.wrong} missed</span><button className="row-arrow" onClick={()=>{setQueue([q]);setIndex(0);setPageIndex(0);setView("practice");setSubmitted(false);setSelfResult(null);}}>Review →</button></div>):<div className="small-empty">No missed questions yet.</div>}</div></div>}

      {view === "review" && <div className="page"><div className="eyebrow">KEEP UNCERTAIN MATCHES VISIBLE</div><h1 className="page-title">Classification review</h1><p className="muted">The catalog does not guess a topic when the extracted question text is ambiguous. Assign a primary College Board topic below; the page image remains the authority.</p><div className="panel review-panel"><div className="panel-head"><div><h2>Needs topic verification</h2><span className="muted">{reviewQuestions.length} questions · {catalog.stats.multiConceptFrq || 0} multi-concept FRQs flagged</span></div><button className="outline" onClick={()=>setView("library")}>Browse classified →</button></div>{reviewQuestions.slice(0,500).map(q=><div className="review-row expanded-review" key={q.id}><span className="review-mark">?</span><div className="review-copy"><b>{q.year || "Source bank"} · {q.type} {q.number}</b><small>{q.textPreview}</small><div className="review-source">Original PDF pages {originalPagesFor(q).join(", ")} · {q.source}</div></div><select value={overrides[q.id] ?? ""} onChange={e=>e.target.value?updateClassification(q,e.target.value):addReviewItem(q)}><option value="">Choose primary topic…</option>{catalog.units.map(u=><optgroup key={u.id} label={`${u.id.toUpperCase()} · ${u.name}`}>{u.topics.map(([tid,name])=><option key={tid} value={tid}>{tid} · {name}</option>)}</optgroup>)}</select><button className="outline compact" onClick={()=>{setQueue([q]);setIndex(0);setPageIndex(0);setView("practice");setSubmitted(false);setSelfResult(null);}}>View image</button></div>)}{reviewQuestions.length>500&&<div className="small-empty">Showing first 500 review items. Use Question bank search to narrow the full collection.</div>}{!reviewQuestions.length&&<div className="empty-state"><span>✓</span><b>All indexed questions have a primary topic</b><p>You can still change topic assignments from the bank list.</p></div>}</div></div>}

      {view === "banks" && <div className="page"><div className="eyebrow">SOURCE FILES & QUESTION INDEX</div><h1 className="page-title">Manage test banks</h1><p className="muted">Add a PDF without replacing existing banks or clearing progress. Then index its questions with page references and a primary College Board topic.</p><div className="bank-layout"><div className="panel import-panel"><div className="panel-head"><div><div className="eyebrow">ADD SOURCE PDF</div><h2>Bring in another test bank</h2></div><span className="import-icon">＋</span></div><label className="upload-zone"><input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(e:ChangeEvent<HTMLInputElement>)=>{void importPdf(e.target.files?.[0]);e.currentTarget.value=""}}/><span className="upload-icon">↑</span><b>{uploading?"Saving PDF…":"Choose a PDF to add"}</b><small>PDF is stored in this browser and kept alongside your current question bank. Add page references below to index its questions.</small><span className="upload-button">Browse files</span></label><div className="import-note"><b>Progress is preserved</b><p>New question records merge into this browser’s saved catalog. Existing question IDs, topic assignments, and attempt history remain intact.</p></div></div><div className="panel schema-panel"><div className="eyebrow">MANUAL SOURCE INDEX</div><h2>Add a question reference</h2><p>The question image will be rendered directly from the PDF page. Confirm its topic against the page before adding it.</p><label>Source bank<select value={newQuestionBank} onChange={e=>setNewQuestionBank(e.target.value)}>{banks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><div className="manual-fields"><label>PDF page<input value={newQuestionPage} onChange={e=>setNewQuestionPage(e.target.value)} type="number" min="1" placeholder="e.g. 12"/></label><label>Question #<input value={newQuestionNumber} onChange={e=>setNewQuestionNumber(e.target.value)} type="number" min="1" placeholder="e.g. 4"/></label></div><label>Question type<select value={newQuestionType} onChange={e=>setNewQuestionType(e.target.value as "MCQ"|"FRQ")}><option value="FRQ">Free response</option><option value="MCQ">Multiple choice</option></select></label><label>Primary topic<select value={newQuestionTopic} onChange={e=>setNewQuestionTopic(e.target.value)}><option value="">Choose topic…</option>{catalog.units.map(u=><optgroup key={u.id} label={`${u.id.toUpperCase()} · ${u.name}`}>{u.topics.map(([id,name])=><option key={id} value={id}>{id} · {name}</option>)}</optgroup>)}</select></label><button className="primary full" onClick={addSourceQuestion}>Add source question <span>→</span></button></div></div><div className="panel bank-list"><div className="panel-head"><div><div className="eyebrow">IN YOUR LIBRARY</div><h2>Source banks</h2></div><span className="bank-count">{banks.length} PDFs</span></div>{banks.map(b=><div className="bank-row" key={b.id}><span className="file-mark">PDF</span><div><b>{b.name}</b><small>{b.id==="mega"?`${catalog.sourcePages.toLocaleString()} pages · ${catalog.questions.length.toLocaleString()} indexed question records`: `${(b.size/1024/1024).toFixed(1)} MB · ${catalog.questions.filter(q=>q.sourceBank===b.id).length} indexed questions`}</small></div><span className="ready-label">Preserved</span></div>)}</div></div>}

      <footer className="footer">College Board unit/topic map <span>·</span> Original source pages <span>·</span> Progress saved locally</footer>
    </main>
  </div>;
}

