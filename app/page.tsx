"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Topic = { id: string; name: string };
type Unit = { id: string; name: string; topics: [string, string][] };
type Question = {
  id: string; type: "MCQ" | "FRQ"; year: string | null; exam: string;
  number: number; pages: number[]; sourcePagesOriginal?: number[]; primaryUnit?: string; unitName?: string;
  primaryTopic?: string | null; topicName?: string | null; secondaryTopics: string[]; relatedTopics?: string[];
  topicParts?: { label: string; topics: string[]; topicNames: string[]; textPreview: string; confidence: number }[];
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

function PdfQuestionPage({ page, sourcePage, bankId, bankName, questionNumber=0, cropView=false, highlightLabels=[] }: { page: number; sourcePage: number; bankId?: string; bankName: string; questionNumber?: number; cropView?: boolean; highlightLabels?: string[] }) {
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
        if (cropView) {
          const anchor=anchors.find(a=>new RegExp(`^${questionNumber}\\.`).test(a.text));
          if (anchor) {
            const mid=viewport.width/2; const left=anchor.x<mid?18:mid+8; const width=mid-28;
            const top=Math.max(0,anchor.y-72);
            const next=anchors.filter(a=>a.x<(mid?left+width:viewport.width+1)&&a.x>=left-2&&a.y>anchor.y+12&&/^\\d{1,2}\\./.test(a.text)).sort((a,b)=>a.y-b.y)[0];
            const bottom=next?next.y-8:Math.min(viewport.height,top+Math.min(700,viewport.height-top));
            crop={x:left,y:top,width,height:Math.max(1,Math.min(viewport.height-top,bottom-top))};
          }
        }
        canvas.current.width=Math.ceil(crop.width); canvas.current.height=Math.ceil(crop.height);
        canvas.current.style.width=`${Math.ceil(crop.width)}px`; canvas.current.style.height=`${Math.ceil(crop.height)}px`;
        context.drawImage(scratch,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
        for (const label of highlightLabels) {
          const marker=anchors.find(a=>a.text.includes(label) && a.y>=crop.y && a.y<=crop.y+crop.height && a.x>=crop.x && a.x<=crop.x+crop.width);
          if (marker) { context.fillStyle="rgba(250, 197, 90, .48)"; context.fillRect(marker.x-crop.x-3,marker.y-crop.y-marker.item.height,marker.item.width+7,marker.item.height+5); }
        }
        if (!cancelled) setBusy(false);
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : "Could not render this source page."); setBusy(false); } }
    }
    void render(); return () => { cancelled = true; task?.destroy(); };
  }, [page, bankId, questionNumber, cropView, highlightLabels.join("|")]);
  return <div className="pdf-frame" ref={wrap}>
    <div className="pdf-label"><span>PDF SOURCE IMAGE</span><span>{bankName} · original page {sourcePage}</span></div>
    {busy && <div className="pdf-wait">Rendering original page…</div>}
    {cropView && !error && <div className="pdf-crop-note">Question crop · check the full-page view if shared instructions or a figure sit above it.</div>}
    {error ? <div className="pdf-error">{error}</div> : <canvas ref={canvas} aria-label={`${bankName}, page ${sourcePage}`} />}
  </div>;
}

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog>({ units: [], questions: [], sourcePages: 0, stats: {} });
  const [progress, setProgress] = useState<Record<string, Attempt>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [banks, setBanks] = useState<Bank[]>([{ id: "mega", name: "AP Chemistry MEGA Compiled Test Bank.pdf", size: 0, addedAt: "Bundled source" }]);
  const [sessions, setSessions] = useState(0);
  const [view, setView] = useState<"desk" | "library" | "detail" | "practice" | "progress" | "review" | "banks">("desk");
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [selectedTopic, setSelectedTopic] = useState("all");
  const [typeFilter, setTypeFilter] = useState("Mixed");
  const [query, setQuery] = useState("");
  const [includeReview, setIncludeReview] = useState(false);
  const [queue, setQueue] = useState<Question[]>([]); const [index, setIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0); const [selfResult, setSelfResult] = useState<"correct" | "missed" | "unsure" | null>(null);
  const [imageMode, setImageMode] = useState<"full" | "crop">("full");
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
  const reviewQuestions = questions.filter(q => q.status === "review" || !q.displayTopic);
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
  function openQuestion(q: Question) { setQueue([q]); setIndex(0); setPageIndex(0); setImageMode("full"); setSubmitted(false); setSelfResult(null); setWork(""); setView("detail"); }
  function partsForTopic(q: Question, topicId?: string) { return (q.topicParts||[]).filter(part=>!topicId || part.topics.includes(topicId)); }

  const bankName = (id?: string) => banks.find(b=>b.id===(id || "mega"))?.name || "AP Chemistry MEGA Compiled Test Bank.pdf";
  const pagesFor = (q?: Question) => q?.pages?.length ? q.pages : [1];
  const originalPagesFor = (q?: Question) => q?.sourcePagesOriginal?.length ? q.sourcePagesOriginal : pagesFor(q);
  const mainTopicQuestionCounts = (id: string) => available.filter(q => (q.relatedTopics||[]).includes(id)).length;
  const pageTitle = view === "desk" ? "Browse by unit" : view === "library" ? "Browse by topic" : view === "detail" ? "Question details" : view === "practice" ? "Practice session" : view === "progress" ? "Progress & patterns" : view === "review" ? "Classification review" : "Manage test banks";

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandmark">A<span>✦</span></div><div><strong>AP Chem Studio</strong><small>Practice with purpose</small></div></div>
      <div className="side-label">QUESTION LIBRARY</div>
      <button className={`nav ${view === "desk" ? "active" : ""}`} onClick={()=>setView("desk")}><span>⌂</span>Browse by unit</button>
      <button className={`nav ${view === "library" ? "active" : ""}`} onClick={()=>setView("library")}><span>▤</span>Question bank</button>
      <button className={`nav ${view === "progress" ? "active" : ""}`} onClick={()=>setView("progress")}><span>↗</span>Progress</button>
      <button className={`nav ${view === "review" ? "active" : ""}`} onClick={()=>setView("review")}><span>⌕</span>Review queue<i>{reviewQuestions.length}</i></button>
      <div className="sidebar-bottom"><div className="library-mini"><span className="bank-dot"/><div><b>{banks.length} source bank{banks.length===1?"":"s"}</b><small>{questions.length.toLocaleString()} indexed questions</small></div></div><button className="add-bank" onClick={()=>setView("banks")}>＋ Add a test bank</button><div className="profile"><div className="avatar">J</div><div><b>Study profile</b><small>Progress saved here</small></div></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobile-brand" onClick={()=>setView("desk")}>AP Chem Studio</button><div className="crumb">Catalog <span>›</span> {pageTitle}</div><div className="topright"><span className="streak">{questions.length.toLocaleString()} indexed questions</span><span className="eyedot"/></div></header>
      {notice && <div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}

      {view === "desk" && <div className="page">
        <section className="welcome"><div><div className="eyebrow"><span className="eyedot"/>AP CHEMISTRY QUESTION CATALOG</div><h1>Browse chemistry<br/><em>by concept.</em></h1><p>Start with a College Board unit, open a topic, then explore the original questions filed there.</p><button className="primary" onClick={()=>{setSelectedTopic("all");setSelectedUnit("all");setView("library");}}>Browse all units <span>→</span></button></div><div className="hero-art"><div className="orb orb-a"/><div className="orb orb-b"/><div className="hero-atom">e⁻</div><div className="hero-molecule">N≡N</div></div></section>
        <div className="stats catalog-stats"><div className="stat"><span className="stat-icon peach">▤</span><div><small>QUESTION RECORDS</small><b>{questions.length.toLocaleString()}</b></div></div><div className="stat"><span className="stat-icon rose">⌕</span><div><small>CURRICULUM TOPICS</small><b>{topics.length}</b></div></div><div className="stat"><span className="stat-icon lavender">⌁</span><div><small>NEEDS TOPIC REVIEW</small><b>{reviewQuestions.length}</b></div></div><div className="stat"><span className="stat-icon mint">▧</span><div><small>QUESTION PAGES</small><b>{catalog.includedSourcePages?.length || 0}</b></div></div></div>
        <div className="section-head"><div><div className="eyebrow">BROWSE THE COURSE FRAMEWORK</div><h2>Choose a unit</h2></div><button className="text-button" onClick={()=>setView("review")}>Review uncertain matches · {reviewQuestions.length} →</button></div>
        <div className="catalog-cards"><button className="catalog-action" onClick={()=>{setSelectedUnit("all");setSelectedTopic("all");setView("library");}}><span className="card-icon green">⌘</span><span className="card-tag">ALL UNITS</span><h3>Open the full topic map</h3><p>Navigate the official unit and topic hierarchy.</p><span className="card-link">{topics.length} topics <b>↗</b></span></button><button className="catalog-action" onClick={()=>setView("review")}><span className="card-icon pink">⌕</span><span className="card-tag">NEEDS REVIEW</span><h3>Check uncertain matches</h3><p>Keep ambiguous items separate until their topic is confirmed.</p><span className="card-link">{reviewQuestions.length} questions <b>↗</b></span></button><button className="catalog-action" onClick={()=>setView("banks")}><span className="card-icon sand">＋</span><span className="card-tag">SOURCE BANKS</span><h3>Add another test bank</h3><p>Preserve current question records and progress as the catalog grows.</p><span className="card-link">{banks.length} source bank{banks.length===1?"":"s"} <b>↗</b></span></button></div>
        <div className="section-head topic-head"><div><div className="eyebrow">COLLEGE BOARD COURSE FRAMEWORK</div><h2>Browse by unit</h2></div><button className="text-button" onClick={()=>setView("library")}>All topics →</button></div>
        <div className="unit-grid">{catalog.units.map((u,i)=><button className="unit-card" key={u.id} onClick={()=>{setSelectedUnit(u.id);setSelectedTopic("all");setView("library");}}><span className={`unit-no u${i+1}`}>UNIT {i+1}</span><b>{u.name}</b><small>{u.topics.length} topics · {available.filter(q=>(q.relatedTopics||[]).some(id=>topics.find(t=>t.id===id)?.unit===u.id)).length} classified questions</small></button>)}</div>
        <div className="footnote">Question images are rendered from the original PDF pages. Automated topic matches are a first pass; use Classification review to correct or finish uncertain assignments.</div>
      </div>}

      {view === "library" && <div className="page">
        <div className="eyebrow">COLLEGE BOARD UNIT → TOPIC → QUESTION</div><h1 className="page-title">Question catalog</h1><p className="muted">Choose a unit, then a topic. Multi-concept FRQs appear under every matched topic, with the related subpart called out for that topic.</p>
        <div className="library-filters"><label>UNIT<select value={selectedUnit} onChange={e=>{setSelectedUnit(e.target.value);setSelectedTopic("all");}}><option value="all">All units</option>{catalog.units.map(u=><option key={u.id} value={u.id}>{u.id.toUpperCase()} · {u.name}</option>)}</select></label><label>TOPIC<select value={selectedTopic} onChange={e=>setSelectedTopic(e.target.value)}><option value="all">All topics</option>{topics.filter(t=>selectedUnit==="all"||t.unit===selectedUnit).map(t=><option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></label><label>TYPE<select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option>Mixed</option><option>MCQ</option><option>FRQ</option></select></label><label className="search-label">SEARCH<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Year, question number, keyword"/></label></div>
        <div className="topic-shortcuts">{topics.filter(t=>selectedUnit==="all"||t.unit===selectedUnit).map(t=><button key={t.id} className={selectedTopic===t.id?"topic-tag chosen":"topic-tag"} onClick={()=>setSelectedTopic(selectedTopic===t.id?"all":t.id)}><span>{t.id}</span>{t.name}<i>{mainTopicQuestionCounts(t.id)}</i></button>)}</div>
        <div className="library-results-head"><b>{selectedTopic==="all"?(selectedUnit==="all"?"All classified questions":`${catalog.units.find(u=>u.id===selectedUnit)?.name} · all topics`):`${selectedTopic} · ${topics.find(t=>t.id===selectedTopic)?.name}`}</b><span>{filteredQuestions.length.toLocaleString()} catalog entries · uncertain matches are in Review</span></div>
        <div className="question-list">{filteredQuestions.slice(0,300).map(q=>{const contextId=selectedTopic!=="all"?selectedTopic:q.displayTopic;const t=topics.find(x=>x.id===contextId);const original=originalPagesFor(q);const relevantParts=partsForTopic(q,selectedTopic!=="all"?selectedTopic:undefined);const primaryMatch=contextId===q.displayTopic;return <article className="catalog-row" key={q.id}><button className="catalog-main" onClick={()=>openQuestion(q)}><span className={`type-chip ${q.type.toLowerCase()}`}>{q.type}</span><span className="catalog-info"><b>{q.year || "Added bank"} · Question {q.number}</b><small>{q.exam} · Original PDF {original.length===1?`page ${original[0]}`:`pages ${original[0]}–${original[original.length-1]}`}</small><span className="topic-context"><b>{primaryMatch?"Primary topic":"Also filed under"}:</b> {t?.id} · {t?.name}</span>{relevantParts.length?<span className="part-matches">{relevantParts.slice(0,3).map((part,i)=><span className="part-match" key={`${part.label}-${i}`}><mark>{part.label}</mark><span>{part.textPreview}</span></span>)}</span>:<span className="preview-line">{q.textPreview}</span>}</span><span className="catalog-arrow">Open details ↗</span></button><div className="catalog-tags">{t&&<span className="curriculum-tag">{t.unit.toUpperCase()} · {t.id}</span>}{q.multiConcept&&<span className="multi-tag">MULTI-CONCEPT FRQ</span>}{(q.relatedTopics||[]).filter(id=>id!==q.displayTopic).map(id=>topics.find(x=>x.id===id)).filter(Boolean).map(topic=><span className="secondary-tag" key={topic!.id}>{topic!.id} · {topic!.name}</span>)}<span className="ready-label">Topic assigned</span></div></article>;})}{filteredQuestions.length>300&&<div className="small-empty">Showing the first 300 matches. Narrow by unit, topic, type, or search.</div>}{!filteredQuestions.length&&<div className="empty-state"><span>⌕</span><b>No classified questions in this view</b><p>Try another topic, or see uncertain matches in the Review section.</p><button className="outline" onClick={()=>setView("review")}>Open classification review</button></div>}</div>
        <div className="curriculum-note"><b>Curriculum source</b> · AP Chemistry Course and Exam Description, College Board. Topic codes and names follow its nine-unit framework.</div>
      </div>}

      {view === "detail" && current && <div className="page detail-page"><button className="back" onClick={()=>setView("library")}>← Back to catalog</button><div className="detail-heading"><div><div className="eyebrow">{current.exam}</div><h1 className="page-title">{current.type} {current.number}{current.year?` · ${current.year}`:""}</h1></div><span className={current.status==="review"?"review-label":"ready-label"}>{current.status==="review"?"Needs topic review":"Classified"}</span></div><p className="muted">{bankName(current.sourceBank)} · original PDF page{originalPagesFor(current).length===1?"":"s"} {originalPagesFor(current).join(", ")}</p>
        <div className="detail-topic-map"><div className="primary-topic-callout"><span>PRIMARY TOPIC</span><b>{current.displayTopic?`${current.displayTopic} · ${current.displayName}`:"Needs classification"}</b></div><div className="related-topic-list"><span>ALSO FILED UNDER</span>{(current.relatedTopics||[]).filter(id=>id!==current.displayTopic).length?(current.relatedTopics||[]).filter(id=>id!==current.displayTopic).map(id=>{const t=topics.find(x=>x.id===id);return t?<span className="secondary-tag" key={id}>{t.unit.toUpperCase()} · {t.id} · {t.name}</span>:null;}):<small>No additional topic matches recorded.</small>}</div></div>
        <section className="panel detail-match-panel"><div className="panel-head"><div><div className="eyebrow">WHY THIS QUESTION APPEARS HERE</div><h2>{selectedTopic!=="all"&&current.relatedTopics?.includes(selectedTopic)?`${selectedTopic} · ${topics.find(t=>t.id===selectedTopic)?.name}`:"Topic mapping"}</h2></div><span className="multi-tag">{current.multiConcept?"MULTI-CONCEPT FRQ":"SOURCE QUESTION"}</span></div>{partsForTopic(current,selectedTopic!=="all"&&current.relatedTopics?.includes(selectedTopic)?selectedTopic:undefined).length?<div className="detail-parts">{partsForTopic(current,selectedTopic!=="all"&&current.relatedTopics?.includes(selectedTopic)?selectedTopic:undefined).map((part,i)=><div className="detail-part" key={`${part.label}-${i}`}><mark>{part.label}</mark><p>{part.textPreview}</p><small>{part.topicNames.map((n,j)=><span key={`${n}-${j}`}>{n}</span>)}</small></div>)}</div>:<p className="muted detail-whole-match">This item is indexed as a whole-question match. The source image below lets you inspect the original prompt before changing its topic assignment.</p>}</section>
        <div className="detail-meta-grid"><div><small>QUESTION TYPE</small><b>{current.type==="FRQ"?"Free response":"Multiple choice"}</b></div><div><small>YEAR</small><b>{current.year||"Not identified"}</b></div><div><small>QUESTION NUMBER</small><b>{current.number}</b></div><div><small>EXAM / VERSION</small><b>{current.exam}</b></div><div><small>SOURCE PAGES</small><b>{originalPagesFor(current).join(", ")}</b></div><div><small>TOPIC MATCH CONFIDENCE</small><b>{Math.round((current.classificationConfidence||0)*100)}% · {current.status}</b></div></div>
        <section className="panel detail-image-panel"><div className="panel-head"><div><div className="eyebrow">SOURCE IMAGE</div><h2>Question as printed</h2></div><div className="image-mode-tabs"><button className={imageMode==="full"?"selected":""} onClick={()=>setImageMode("full")}>Full page</button><button className={imageMode==="crop"?"selected":""} onClick={()=>setImageMode("crop")}>Question crop</button></div></div><p className="muted">Yellow marks indicate the FRQ parts linked to the topic shown above. Use Full page to see shared instructions, diagrams, and surrounding context.</p><div className="pdf-tabs">{pagesFor(current).map((pg,i)=><button key={pg} className={pageIndex===i?"selected":""} onClick={()=>setPageIndex(i)}>Original page {originalPagesFor(current)[i]}</button>)}</div><PdfQuestionPage page={pagesFor(current)[pageIndex]} sourcePage={originalPagesFor(current)[pageIndex]} bankId={current.sourceBank||"mega"} bankName={bankName(current.sourceBank)} questionNumber={current.number} cropView={imageMode==="crop"} highlightLabels={partsForTopic(current,selectedTopic!=="all"&&current.relatedTopics?.includes(selectedTopic)?selectedTopic:undefined).map(p=>p.label)} /></section>
      </div>}

      {view === "practice" && current && <div className="page practice-page"><div className="session-top"><button className="back" onClick={()=>setView("desk")}>← Exit session</button><span className="session-count">QUESTION {index+1} <i>/</i> {queue.length}</span></div><div className="progress-line"><i style={{width:`${((index+(submitted?1:0))/queue.length)*100}%`}}/></div><div className="question-meta"><span className={`type-chip ${current.type.toLowerCase()}`}>{current.type==="MCQ"?"MULTIPLE CHOICE":"FREE RESPONSE"}</span><span>{current.displayTopic ? `${current.displayTopic} · ${current.displayName}` : "Needs topic review"}</span><span>·</span><span>{current.year || current.exam}</span></div>
        <div className="question-card source-question"><div className="source-question-head"><div><div className="eyebrow">ORIGINAL QUESTION PAGE</div><h2>{current.year || "Source bank"} · {current.type} {current.number}</h2><p>Exact page image from <b>{bankName(current.sourceBank)}</b></p></div><span className="source-page-count">{pageIndex+1} / {pagesFor(current).length} source page{pagesFor(current).length===1?"":"s"}</span></div>
        <div className="pdf-tabs">{pagesFor(current).map((pg,i)=><button key={pg} className={pageIndex===i?"selected":""} onClick={()=>setPageIndex(i)}>Original page {originalPagesFor(current)[i]}</button>)}</div>
        <PdfQuestionPage page={pagesFor(current)[pageIndex]} sourcePage={originalPagesFor(current)[pageIndex]} bankId={current.sourceBank || "mega"} bankName={bankName(current.sourceBank)} />
        {!submitted ? <div className="response-panel"><label htmlFor="work"><b>Your work / answer</b><span>Write your response here before submitting. The source image remains answer-free.</span></label><textarea id="work" value={work} onChange={e=>setWork(e.target.value)} placeholder={current.type==="FRQ"?"Show your reasoning, equations, units, and conclusion…":"Record your selected letter and a brief reason…"}/><div className="submit-row"><span>When ready, record your self-check. No answer is guessed or revealed.</span><button className="primary" onClick={()=>{if(!work.trim())setNotice("Add your answer or reasoning before submitting.");else setSubmitted(true);}}>Submit response <span>→</span></button></div></div> : <div className="feedback"><div className="eyebrow">SELF-CHECK & REFLECTION</div><div className="feedback-banner review-feedback"><b>Response saved</b><span>This source question is indexed to the PDF page. A verified answer key is not linked to this question record, so the site will not invent one.</span></div><div className="self-check-row"><span>How did it go?</span>{(["correct","missed","unsure"] as const).map(r=><button key={r} disabled={!!selfResult} className={`self-check ${selfResult===r?"selected":""}`} onClick={()=>markSelfCheck(r)}>{r==="correct"?"Got it":r==="missed"?"Missed it":"Not sure"}</button>)}</div>{selfResult==="missed"&&<div className="guided-review"><b>Step-by-step mistake review</b><ol><li>Restate what the prompt asks you to determine, explain, calculate, or represent.</li><li>Identify the AP Chemistry unit/topic and the rule, relationship, or representation it requires.</li><li>Check your setup: species and charges, balanced atoms, units, significant figures, and signs where relevant.</li><li>Compare each step with the official scoring guide in the source bank; mark the exact step where your reasoning changed.</li></ol><p>The compiled bank’s scoring guides are retained in the PDF, but are not yet linked to individual indexed questions.</p></div>}{selfResult&&<button className="primary submit-btn" onClick={nextQuestion}>{index+1===queue.length?"Finish session":"Next question"}<span>→</span></button>}</div>}
        <div className="question-foot"><span>Primary topic: <b>{current.displayName}</b></span>{current.multiConcept&&<span className="multi-tag">MULTI-CONCEPT FRQ</span>}{current.secondaryTopicNames?.map(n=><span className="secondary-tag" key={n}>Also: {n}</span>)}<span className="source-note">Source: {bankName(current.sourceBank)} · original page {originalPagesFor(current)[pageIndex]}</span></div></div></div>}
      {view === "practice" && !current && <div className="page narrow"><div className="empty-state"><span>✦</span><b>No questions in this session</b><p>Choose a unit or topic with indexed questions.</p><button className="primary" onClick={()=>setView("library")}>Browse questions</button></div></div>}

      {view === "progress" && <div className="page"><div className="eyebrow">YOUR LEARNING, OVER TIME</div><h1 className="page-title">Progress & patterns</h1><p className="muted">Attempts, missed questions, and repeated review needs are saved in this browser.</p><div className="stats progress-stats"><div className="stat"><span className="stat-icon peach">↗</span><div><small>TOTAL ATTEMPTS</small><b>{attempts}</b></div></div><div className="stat"><span className="stat-icon rose">⌁</span><div><small>MISSED ANSWERS</small><b>{misses}</b></div></div><div className="stat"><span className="stat-icon lavender">✦</span><div><small>CONCEPTS MASTERED</small><b>{mastered}</b></div></div></div><div className="panel"><div className="panel-head"><div><div className="eyebrow">FOCUS NEXT</div><h2>Concepts to revisit</h2></div><button className="outline" onClick={()=>reviewSession()}>Build review session →</button></div>{weakConcepts.length?weakConcepts.map(c=><div className="weak-row" key={c.id}><div className="weak-icon">⌁</div><div><b>{c.id} · {c.name}</b><small>{c.ids.size} question{c.ids.size===1?"":"s"} attempted</small></div><span className="missed-count">{c.wrong} missed · {c.attempts} attempts</span><button className="row-arrow" onClick={()=>reviewSession(c.id)}>Practice →</button></div>):<div className="empty-state"><span>✧</span><b>Your review map will grow as you practice</b><p>Mark a response as missed to focus future sessions on that question and topic.</p></div>}</div><div className="panel history-panel"><div className="eyebrow">MISSED QUESTIONS</div><h2>Question history</h2>{weakRows.length?weakRows.slice(0,60).map(q=><div className="history-row" key={q.id}><span className="history-x">↻</span><div><b>{q.type} {q.number} · {q.displayName}</b><small>{q.year || q.exam} · {q.source}</small></div><span>{progress[q.id]?.wrong} missed</span><button className="row-arrow" onClick={()=>{setQueue([q]);setIndex(0);setPageIndex(0);setView("practice");setSubmitted(false);setSelfResult(null);}}>Review →</button></div>):<div className="small-empty">No missed questions yet.</div>}</div></div>}

      {view === "review" && <div className="page"><div className="eyebrow">KEEP UNCERTAIN MATCHES VISIBLE</div><h1 className="page-title">Classification review</h1><p className="muted">The catalog does not guess a topic when the extracted question text is ambiguous. Assign a primary College Board topic below; the page image remains the authority.</p><div className="panel review-panel"><div className="panel-head"><div><h2>Needs topic verification</h2><span className="muted">{reviewQuestions.length} questions · {catalog.stats.multiConceptFrq || 0} multi-concept FRQs flagged</span></div><button className="outline" onClick={()=>setView("library")}>Browse classified →</button></div>{reviewQuestions.slice(0,500).map(q=><div className="review-row expanded-review" key={q.id}><span className="review-mark">?</span><div className="review-copy"><b>{q.year || "Source bank"} · {q.type} {q.number}</b><small>{q.textPreview}</small><div className="review-source">Original PDF pages {originalPagesFor(q).join(", ")} · {q.source}</div></div><select value={overrides[q.id] ?? ""} onChange={e=>e.target.value?updateClassification(q,e.target.value):addReviewItem(q)}><option value="">Choose primary topic…</option>{catalog.units.map(u=><optgroup key={u.id} label={`${u.id.toUpperCase()} · ${u.name}`}>{u.topics.map(([tid,name])=><option key={tid} value={tid}>{tid} · {name}</option>)}</optgroup>)}</select><button className="outline compact" onClick={()=>openQuestion(q)}>View image</button></div>)}{reviewQuestions.length>500&&<div className="small-empty">Showing first 500 review items. Use Question bank search to narrow the full collection.</div>}{!reviewQuestions.length&&<div className="empty-state"><span>✓</span><b>All indexed questions have a primary topic</b><p>You can still change topic assignments from the bank list.</p></div>}</div></div>}

      {view === "banks" && <div className="page"><div className="eyebrow">SOURCE FILES & QUESTION INDEX</div><h1 className="page-title">Manage test banks</h1><p className="muted">Add a PDF without replacing existing banks or clearing progress. Then index its questions with page references and a primary College Board topic.</p><div className="bank-layout"><div className="panel import-panel"><div className="panel-head"><div><div className="eyebrow">ADD SOURCE PDF</div><h2>Bring in another test bank</h2></div><span className="import-icon">＋</span></div><label className="upload-zone"><input type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={(e:ChangeEvent<HTMLInputElement>)=>{void importPdf(e.target.files?.[0]);e.currentTarget.value=""}}/><span className="upload-icon">↑</span><b>{uploading?"Saving PDF…":"Choose a PDF to add"}</b><small>PDF is stored in this browser and kept alongside your current question bank. Add page references below to index its questions.</small><span className="upload-button">Browse files</span></label><div className="import-note"><b>Progress is preserved</b><p>New question records merge into this browser’s saved catalog. Existing question IDs, topic assignments, and attempt history remain intact.</p></div></div><div className="panel schema-panel"><div className="eyebrow">MANUAL SOURCE INDEX</div><h2>Add a question reference</h2><p>The question image will be rendered directly from the PDF page. Confirm its topic against the page before adding it.</p><label>Source bank<select value={newQuestionBank} onChange={e=>setNewQuestionBank(e.target.value)}>{banks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><div className="manual-fields"><label>PDF page<input value={newQuestionPage} onChange={e=>setNewQuestionPage(e.target.value)} type="number" min="1" placeholder="e.g. 12"/></label><label>Question #<input value={newQuestionNumber} onChange={e=>setNewQuestionNumber(e.target.value)} type="number" min="1" placeholder="e.g. 4"/></label></div><label>Question type<select value={newQuestionType} onChange={e=>setNewQuestionType(e.target.value as "MCQ"|"FRQ")}><option value="FRQ">Free response</option><option value="MCQ">Multiple choice</option></select></label><label>Primary topic<select value={newQuestionTopic} onChange={e=>setNewQuestionTopic(e.target.value)}><option value="">Choose topic…</option>{catalog.units.map(u=><optgroup key={u.id} label={`${u.id.toUpperCase()} · ${u.name}`}>{u.topics.map(([id,name])=><option key={id} value={id}>{id} · {name}</option>)}</optgroup>)}</select></label><button className="primary full" onClick={addSourceQuestion}>Add source question <span>→</span></button></div></div><div className="panel bank-list"><div className="panel-head"><div><div className="eyebrow">IN YOUR LIBRARY</div><h2>Source banks</h2></div><span className="bank-count">{banks.length} PDFs</span></div>{banks.map(b=><div className="bank-row" key={b.id}><span className="file-mark">PDF</span><div><b>{b.name}</b><small>{b.id==="mega"?`${catalog.sourcePages.toLocaleString()} pages · ${catalog.questions.length.toLocaleString()} indexed question records`: `${(b.size/1024/1024).toFixed(1)} MB · ${catalog.questions.filter(q=>q.sourceBank===b.id).length} indexed questions`}</small></div><span className="ready-label">Preserved</span></div>)}</div></div>}

      <footer className="footer">College Board unit/topic map <span>·</span> Original source pages <span>·</span> Progress saved locally</footer>
    </main>
  </div>;
}

