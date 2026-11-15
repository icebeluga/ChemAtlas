"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { defaultFormat, backupSchema, addEntries, newDraft, newWorksheetId, presets, steps, worksheetSource } from "@/lib/worksheet";
import { filterQuestions } from "@/lib/question-filter";
import type { Backup, Draft, ExportMode, Format, Region, Registry, SourceFile } from "@/lib/worksheet";
import type { WorksheetContent } from "@/lib/worksheet-content";
import type { WorksheetQuestion } from "@/lib/worksheet-pdf";
import { ArrowDown, ArrowUp, Check, ChevronDown, GripVertical } from "lucide-react";
import { AtlasButton } from "./ui/atlas-controls";
import { WorksheetPreview } from "./worksheet-preview";

type Candidate = WorksheetQuestion & { year: string | null; relatedTopics?: (string | undefined)[]; textPreview: string };
type Props = {
  questions: Candidate[];
  topics: { id: string; name: string; unit: string; unitName: string }[];
  files: SourceFile[];
  progress: Record<string, { attempts: number; wrong: number }>;
  backup: Backup;
  save: (next: Backup) => void;
  openPdf: (url?: string, bankId?: string) => Promise<PDFDocumentProxy>;
  renderSource: (question: Candidate, region: Region) => ReactNode;
};
const filterDefaults = { unit: "all", topic: "all", type: "all", year: "all", source: "all", history: "all", print: "all", search: "" };
const resultSize = 20;
const emptyRegistry: Registry = { questions: {}, references: [], answerKeyPage: 0 };

export function PracticeBuilder({ questions, topics, files, progress, backup, save, openPdf, renderSource }: Props) {
  const draft = backup.drafts.find(d => d.id === backup.active)!;
  const [step, setStep] = useState(0);
  const [filters, setFilters] = useState(filterDefaults);
  const [page, setPage] = useState(0);
  const [amount, setAmount] = useState(5);
  const [registry, setRegistry] = useState<Registry>();
  const [content, setContent] = useState<WorksheetContent>();
  const [contentError, setContentError] = useState("");
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<Draft>();
  const [replacement, setReplacement] = useState("");
  const [dragged, setDragged] = useState("");
  const [source, setSource] = useState<{ id: string; part: number }>();
  const [mode, setMode] = useState<ExportMode>("questions");
  const hasAnswers = draft.entries.some(e => registry?.questions[e.id]?.answer);
  if (!hasAnswers && mode !== "questions") setMode("questions");

  const request = useMemo(() => step === 3 && registry && content && draft.entries.length
    ? { draft, questions, registry, mode, files, openPdf, content }
    : undefined, [step, draft, questions, registry, mode, files, openPdf, content]);
  type PreviewResult = { request: NonNullable<typeof request> } & (
    { bytes: Uint8Array; url: string; count: number } | { error: string }
  );
  const [result, setResult] = useState<PreviewResult>();
  if (result && result.request !== request) setResult(undefined);
  const current = result?.request === request ? result : undefined;
  const { bytes, url, count = 0 } = current && "bytes" in current ? current : {};
  const generating = !!request && !current;
  const error = current && "error" in current ? current.error : contentError;
  const setCount = useCallback((count: number) => {
    setResult(previous => previous && previous.request === request && "bytes" in previous
      ? { ...previous, count }
      : previous);
  }, [request]);

  useEffect(() => {
    const controller = new AbortController();
    async function getJson<T>(path: string): Promise<T> {
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) throw new Error(`Could not load ${path}.`);
      return response.json();
    }
    getJson<Registry>("/worksheet-sources.json").then(setRegistry).catch(() => {
      if (!controller.signal.aborted) setRegistry(emptyRegistry);
    });
    getJson<WorksheetContent>("/worksheet-content.json").then(setContent).catch(() => {
      if (!controller.signal.aborted) setContentError("The reviewed worksheet content could not be loaded. Refresh and try again.");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!request) return;
    const { draft, questions, registry, mode, files, openPdf, content } = request;
    const controller = new AbortController();
    let previewUrl: string | undefined;
    const timer = setTimeout(async () => {
      try {
        const { renderWorksheet } = await import("@/lib/worksheet-render");
        if (controller.signal.aborted) return;
        const bytes = await renderWorksheet(draft, questions, registry, mode, files, openPdf, controller.signal, content);
        if (controller.signal.aborted) return;
        previewUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
        setResult({ request, bytes, url: previewUrl, count: 0 });
      } catch (e) {
        if (!controller.signal.aborted) setResult({ request, error: e instanceof Error ? e.message : "PDF generation failed." });
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [request]);

  const selected = useMemo(() => new Set(draft.entries.map(e => e.id)), [draft.entries]);
  const byId = useMemo(() => new Map(questions.map(q => [q.id, q])), [questions]);
  const years = useMemo(() => [...new Set(questions.map(q => q.year).filter((y): y is string => !!y))].sort().reverse(), [questions]);
  const sources = useMemo(() => [...new Set(questions.map(q => q.source))].sort(), [questions]);
  const units = useMemo(() => [...new Map(topics.map(t => [t.unit, t.unitName]))], [topics]);
  const candidates = useMemo(() => filterQuestions(questions, {
    unit: filters.unit.replace(/^U/i, ""), topic: filters.topic, type: filters.type,
    unitForTopic: id => id?.split(".")[0],
    topicsFor: q => q.relatedTopics?.length ? q.relatedTopics : [q.displayTopic],
    include: q => {
      const year = registry?.questions[q.id]?.exam?.match(/^\d{4}/)?.[0] ?? q.year;
      return (filters.print !== "ready" || !!content?.questions[q.id])
        && (filters.year === "all" || year === filters.year)
        && (filters.source === "all" || q.source === filters.source)
        && (filters.history === "all" || (filters.history === "attempted" ? !!progress[q.id]?.attempts : !!progress[q.id]?.wrong));
    },
    search: { query: filters.search.trim(), text: q => `${registry?.questions[q.id]?.exam ?? q.exam} ${q.number} ${q.displayName} ${q.textPreview}` },
  }), [questions, filters, registry, progress, content]);

  function update(next: Draft, remember = false) {
    if (remember) setUndo(draft);
    save({ ...backup, drafts: backup.drafts.map(d => d.id === draft.id ? next : d) });
  }
  function open(next: Draft) {
    if (backup.drafts.length >= 100) { setNotice("This browser has reached the 100-worksheet limit. Download a backup to keep a portable copy."); return; }
    save({ ...backup, active: next.id, drafts: [...backup.drafts, next] });
    setUndo(undefined); setReplacement(""); setStep(0); setMode("questions");
  }
  function setFilter<K extends keyof typeof filters>(key: K, value: typeof filters[K]) {
    setFilters(old => ({ ...old, [key]: value, ...(key === "unit" ? { topic: "all" } : {}) })); setPage(0);
  }
  function add(ids: string[]) {
    const eligible = ids.filter(id => !selected.has(id));
    if (replacement && eligible[0]) {
      update({ ...draft, entries: draft.entries.map(e => e.id === replacement ? { ...e, id: eligible[0], lines: undefined } : e) }, true);
      setReplacement(""); setStep(1); setNotice("Question replaced."); return;
    }
    const next = addEntries(draft, eligible);
    const added = next.entries.length - draft.entries.length;
    if (added) update(next, true);
    setNotice(added ? `Added ${added} ${added === 1 ? "question" : "questions"}.` : "No eligible questions to add.");
  }
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= draft.entries.length) return;
    const entries = [...draft.entries];
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    update({ ...draft, entries }, true);
  }
  function changeFormat<K extends keyof Format>(key: K, value: Format[K]) {
    update({ ...draft, format: { ...draft.format, [key]: value } });
  }
  function backupDownload() {
    const link = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = link; a.download = "chematlas-worksheets.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(link), 1000);
  }
  const labels = ["Select questions", "Arrange worksheet", "Format document", "Preview and export"];
  const f = draft.format;

  return <div className="page worksheet-page">
    <header className="worksheet-heading">
      <div><h1 className="page-title">Practice Builder</h1><p className="muted">Build a printable AP Chemistry worksheet from original exam questions.</p></div>
      <span className="worksheet-count" aria-live="polite">{draft.entries.length} selected</span>
    </header>
    <section className="panel worksheet-drafts" aria-label="Saved worksheets">
      <label className="worksheet-title-field">Worksheet title<input maxLength={100} value={draft.name} onChange={e => update({ ...draft, name: e.target.value })} /></label>
      <label>Saved worksheets<select value={draft.id} onChange={e => { save({ ...backup, active: e.target.value }); setStep(0); setUndo(undefined); setReplacement(""); setMode("questions"); }}>
        {backup.drafts.map(d => <option key={d.id} value={d.id}>{d.name || "Untitled worksheet"}</option>)}
      </select></label>
      <div className="worksheet-actions">
        <AtlasButton onClick={() => open(newDraft())}>New worksheet</AtlasButton>
        <details className="worksheet-backup"><summary>Worksheet actions <ChevronDown size={16} aria-hidden="true" /></summary><div className="panel">
          <AtlasButton onClick={e => { open({ ...draft, id: newWorksheetId(), name: `${draft.name.slice(0, 93)} (copy)` }); e.currentTarget.closest("details")?.removeAttribute("open"); }}>Duplicate</AtlasButton>
          <button className="outline" onClick={backupDownload}>Download drafts</button>
          <label>Import drafts<input type="file" accept=".json,application/json" onChange={async e => {
            const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
            try {
              if (file.size > 2_000_000) throw new Error();
              const parsed = backupSchema.parse(JSON.parse(await file.text()));
              if (backup.drafts.length + parsed.drafts.length > 100) { setNotice("Import would exceed the 100-worksheet limit."); return; }
              const restored = parsed.drafts.map(d => ({ ...d, id: newWorksheetId() }));
              save({ ...backup, drafts: [...backup.drafts, ...restored], active: restored[parsed.drafts.findIndex(d => d.id === parsed.active)].id });
              setStep(0); setUndo(undefined); setReplacement(""); setNotice("Worksheet drafts imported.");
            } catch { setNotice("Could not import that worksheet backup."); }
          }} /></label>
        </div></details>
      </div>
    </section>
    <nav className="worksheet-steps" aria-label="Worksheet steps">
      {steps.map((name, i) => <button key={name} className="worksheet-step" aria-current={i === step ? "step" : undefined} onClick={() => { setStep(i); if (i !== 0) setReplacement(""); }}><span>{i + 1}</span> {name}</button>)}
    </nav>
    <div className="worksheet-status muted" role="status">{notice || "Drafts autosave in this browser. Download a backup to move them to another device."}</div>
    {error && <p className="worksheet-error atlas-alert atlas-tone-error" role="alert">{error}</p>}

    <section className="panel worksheet-workspace" data-step={step} aria-labelledby="worksheet-step-title">
      <h2 id="worksheet-step-title">{labels[step]}</h2>
      {step === 0 && <>
        <p className="muted">{replacement ? "Choose an unselected question to replace the current item." : "Any question can be added. PDF export uses reviewed question content where available and original source pages for other entries."}</p>
        <div className="worksheet-fields worksheet-filters">
          <label>Search<input value={filters.search} onChange={e => setFilter("search", e.target.value)} placeholder="Question, year, or keyword" /></label>
          <label>Unit<select value={filters.unit} onChange={e => setFilter("unit", e.target.value)}><option value="all">All units</option>{units.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Topic<select value={filters.topic} onChange={e => setFilter("topic", e.target.value)}><option value="all">All topics</option>{topics.filter(t => filters.unit === "all" || t.unit === filters.unit).map(t => <option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></label>
          <label>Type<select value={filters.type} onChange={e => setFilter("type", e.target.value)}><option value="all">All types</option><option>MCQ</option><option>FRQ</option></select></label>
        </div>
        <details className="worksheet-more-filters"><summary>Additional filters{[filters.year, filters.source, filters.print, filters.history].some(value=>value!=="all") && " · active"}</summary><div className="worksheet-fields">
          <label>Exam year<select value={filters.year} onChange={e => setFilter("year", e.target.value)}><option value="all">All years</option>{[...new Set([...years, "2008"])].sort().reverse().map(y => <option key={y}>{y}</option>)}</select></label>
          <label>Original source<select value={filters.source} onChange={e => setFilter("source", e.target.value)}><option value="all">All sources</option>{sources.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Print status<select value={filters.print} onChange={e => setFilter("print", e.target.value)}><option value="all">All questions</option><option value="ready">Reviewed print layout</option></select></label>
          <label>Practice history<select value={filters.history} onChange={e => setFilter("history", e.target.value)}><option value="all">Any history</option><option value="attempted">Previously attempted</option><option value="missed">Previously missed</option></select></label>
        </div></details>
        <div className="worksheet-actions worksheet-filter-actions">
          <AtlasButton variant="ghost" onClick={() => { setFilters(filterDefaults); setPage(0); }}>Clear filters</AtlasButton>
          {!replacement && <><label className="worksheet-inline">Auto-add count<input type="number" min={1} max={50} value={amount} onChange={e => setAmount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} /></label>
          <button className="outline" onClick={() => add(candidates.filter(q => !selected.has(q.id)).slice(0, amount).map(q => q.id))}>Auto-add from matches</button></>}
        </div>
        <div className="worksheet-actions"><b role="status">{candidates.length.toLocaleString()} matches</b>{replacement && <button className="outline" onClick={() => { setReplacement(""); setStep(1); }}>Cancel replacement</button>}</div>
        {candidates.slice(page * resultSize, (page + 1) * resultSize).map(q => {
          const original = worksheetSource(q, registry);
          const reviewed = content?.questions[q.id];
          const previewRegions = [...(reviewed?.context ? content?.contexts[reviewed.context] ?? [] : []), ...(reviewed?.blocks ?? [])]
            .filter(block => block.kind === "region");
          const print = { ...original, pages: previewRegions.length ? previewRegions : original.pages };
          return <article className="worksheet-row" key={q.id} data-selected={selected.has(q.id)}>
            <div><b className="worksheet-question-title"><span className={`type-chip ${q.type.toLowerCase()}`}>{q.type}</span> {q.number} · {print.exam ?? q.exam}</b>
              <small>{q.displayTopic} {q.displayName}{print.answer ? " · Verified answer" : ""}</small>
              {content && <small className={`atlas-chip atlas-tone-${reviewed ? "success" : "review"}`}>{reviewed ? "Export ready" : "Full source page fallback"}</small>}
              {content?.review?.[q.id] && <small>{content.review[q.id]}</small>}
            </div>
            <div className="worksheet-actions">
              {print.pages.length > 0 && <button className="outline" aria-expanded={source?.id === q.id} onClick={() => setSource(source?.id === q.id ? undefined : { id: q.id, part: 0 })}>{source?.id === q.id ? "Close preview" : "Preview"}</button>}
              <AtlasButton variant={selected.has(q.id) ? "tertiary" : "secondary"} disabled={selected.has(q.id)} onClick={() => add([q.id])}>{selected.has(q.id) ? <><Check size={16} aria-hidden="true" /> Added</> : replacement ? "Use replacement" : "Add to Worksheet"}</AtlasButton>
            </div>
            {source?.id === q.id && print.pages.length > 0 && <div className="worksheet-source">
              {print.pages.length > 1 && <div className="worksheet-actions">{print.pages.map((p, i) => <button key={i} className="outline" aria-pressed={source.part === i} onClick={() => setSource({ id: q.id, part: i })}>Source page {p.page}{print.pages.some((other, j) => j !== i && other.page === p.page) ? ` · region ${i + 1}` : ""}</button>)}</div>}
              {renderSource(q, print.pages[source.part] ?? print.pages[0])}
            </div>}
          </article>;
        })}
        <div className="worksheet-actions"><button className="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous results</button>
          <span>Page {page + 1} of {Math.max(1, Math.ceil(candidates.length / resultSize))}</span>
          <button className="outline" disabled={(page + 1) * resultSize >= candidates.length} onClick={() => setPage(page + 1)}>Next results</button>
          <button className="primary" onClick={() => setStep(1)}>Arrange worksheet →</button></div>
      </>}

      {step === 1 && <>
        <p className="muted">Drag using the handle or use the move buttons. Grouping in Format sets section order while preserving your order within each section.</p>
        <div className="worksheet-actions"><button className="outline" disabled={!undo || undo.id !== draft.id} onClick={() => { if (undo) { update(undo); setUndo(undefined); setNotice("Last worksheet change undone."); } }}>Undo last change</button></div>
        {!draft.entries.length && <p>No questions selected. Open Select to add questions.</p>}
        {draft.entries.map((entry, i) => {
          const q = byId.get(entry.id);
          return <article key={entry.id} className="worksheet-row" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (dragged) move(draft.entries.findIndex(item => item.id === dragged), i); setDragged(""); }}>
            <div><span className="worksheet-handle" aria-hidden="true" draggable onDragStart={e => { e.dataTransfer.setData("text/plain", entry.id); setDragged(entry.id); }} onDragEnd={() => setDragged("")}><GripVertical size={16} /></span>
              <b>{i + 1}. {q ? `${q.type} ${q.number} · ${registry?.questions[q.id]?.exam ?? q.exam}` : entry.id}{content && !content.questions[entry.id] ? " · Full source page fallback" : ""}</b>
              <small>{q ? q.displayName : "Missing catalog record"}</small>
              {content?.review?.[entry.id] && <small>{content.review[entry.id]}</small>}
            </div>
            <div className="worksheet-actions">
              <label className="worksheet-check"><input type="checkbox" checked={entry.breakBefore} onChange={e => update({ ...draft, entries: draft.entries.map(item => item.id === entry.id ? { ...item, breakBefore: e.target.checked } : item) }, true)} /> Page break before</label>
              {q?.type === "FRQ" && <label className="worksheet-inline">Response lines<input type="number" min={0} max={12} value={entry.lines ?? f.lines} onChange={e => {
                const lines = Math.min(12, Math.max(0, Number(e.target.value) || 0));
                update({ ...draft, entries: draft.entries.map(item => item.id === entry.id ? { ...item, lines } : item) }, true);
              }} /></label>}
              <AtlasButton variant="icon" disabled={i === 0} aria-label={`Move item ${i + 1} up`} onClick={() => move(i, i - 1)}><ArrowUp size={16} aria-hidden="true" /></AtlasButton>
              <AtlasButton variant="icon" disabled={i === draft.entries.length - 1} aria-label={`Move item ${i + 1} down`} onClick={() => move(i, i + 1)}><ArrowDown size={16} aria-hidden="true" /></AtlasButton>
              <button className="outline" onClick={() => { setReplacement(entry.id); setStep(0); }}>Replace</button>
              <AtlasButton variant="destructive" onClick={() => { update({ ...draft, entries: draft.entries.filter(e => e.id !== entry.id) }, true); setNotice("Question removed from worksheet."); }}>Remove</AtlasButton>
            </div>
          </article>;
        })}
        <button className="primary" onClick={() => setStep(2)}>Format document →</button>
      </>}

      {step === 2 && <>
        <label className="worksheet-preset">Apply a preset<select value="" onChange={e => {
          const preset = presets[Number(e.target.value)]; if (!preset) return;
          update({ ...draft, format: { ...defaultFormat, ...preset.format } }, true);
          setFilter("type", preset.type); setNotice(`Applied ${preset.name}.`);
        }}><option value="" disabled>Choose a preset</option>{presets.map((preset, i) => <option value={i} key={preset.name}>{preset.name}</option>)}</select></label>
        <fieldset className="worksheet-format-group"><legend>Document details</legend><div className="worksheet-fields">
          <label>Title<input maxLength={100} value={f.title} onChange={e => changeFormat("title", e.target.value)} /></label>
          <label>Subtitle<input maxLength={120} value={f.subtitle} onChange={e => changeFormat("subtitle", e.target.value)} /></label>
        </div><label>Worksheet instructions<textarea rows={3} maxLength={320} value={f.instructions} onChange={e => changeFormat("instructions", e.target.value)} /></label></fieldset>
        <fieldset className="worksheet-format-group"><legend>Page layout</legend><div className="worksheet-fields">
          <label>Paper size<select value={f.paper} onChange={e => changeFormat("paper", e.target.value as Format["paper"])}><option>Letter</option><option>A4</option></select></label>
          <label>Orientation<select value={f.landscape ? "Landscape" : "Portrait"} onChange={e => changeFormat("landscape", e.target.value === "Landscape")}><option>Portrait</option><option>Landscape</option></select></label>
          {([["margin", "Margins (pt)", 24, 72], ["font", "Document text (pt)", 9, 16], ["gap", "Question spacing (pt)", 4, 36], ["lines", "FRQ response lines", 0, 12]] as const).map(([key, label, min, max]) =>
            <label key={key}>{label}<input type="range" min={min} max={max} value={f[key]} onChange={e => changeFormat(key, Number(e.target.value))} /><output>{f[key]}</output></label>)}
        </div></fieldset>
        <fieldset className="worksheet-format-group"><legend>Question sections</legend><div className="worksheet-fields">
          <label>Group by<select value={f.grouping} onChange={e => changeFormat("grouping", e.target.value as Format["grouping"])}><option value="none">Custom order</option><option value="type">MCQ and FRQ</option><option value="topic">Topic</option></select></label>
          <label>MCQ section heading<input maxLength={80} value={f.mcqTitle} onChange={e => changeFormat("mcqTitle", e.target.value)} /></label>
          <label>FRQ section heading<input maxLength={80} value={f.frqTitle} onChange={e => changeFormat("frqTitle", e.target.value)} /></label>
        </div>
        {f.grouping === "type" && <div className="worksheet-fields">
          <label>MCQ section instructions<textarea rows={2} maxLength={240} value={f.mcqInstructions} onChange={e => changeFormat("mcqInstructions", e.target.value)} /></label>
          <label>FRQ section instructions<textarea rows={2} maxLength={240} value={f.frqInstructions} onChange={e => changeFormat("frqInstructions", e.target.value)} /></label>
        </div>}</fieldset>
        <fieldset className="worksheet-format-group"><legend>Printed fields and references</legend><div className="worksheet-actions">{([["name", "Name field"], ["date", "Date field"], ["classField", "Class field"], ["pageNumbers", "Page numbers"], ["numbering", "Worksheet numbering"], ["citations", "Original source citations"], ["references", "AP reference tables"]] as const).map(([key, label]) =>
          <label key={key} className="worksheet-check"><input type="checkbox" checked={f[key]} onChange={e => changeFormat(key, e.target.checked)} /> {label}</label>)}</div></fieldset>
        <p className="muted">Original question labels and answer-choice spacing are preserved inside the source image.</p>
        <button className="primary" onClick={() => setStep(3)}>Preview PDF →</button>
      </>}

      {step === 3 && <>
        <div className="worksheet-actions">
          <label className="worksheet-inline">PDF contents<select value={mode} onChange={e => setMode(e.target.value as ExportMode)}>
            <option value="questions">Questions only</option><option value="answers" disabled={!hasAnswers}>Separate answer key</option><option value="combined" disabled={!hasAnswers}>Questions and answer key</option>
          </select></label>
          {bytes && url && !generating && <><a className="primary" href={url} download={`${(f.title || draft.name).replace(/[^\w -]/g, "").trim() || "worksheet"}${mode === "answers" ? " - answer key" : ""}.pdf`}>Download PDF</a>
            <a className="outline" href={url} target="_blank" rel="noreferrer">Open PDF to print</a></>}
        </div>
        {mode !== "answers" && <p className="muted">Full source pages can include adjacent questions or printed answers. Inspect the preview before sharing.</p>}
        {!hasAnswers && <p className="muted">This worksheet has no verified answer key.</p>}
        {!draft.entries.length && <p>Add questions before exporting.</p>}
        {generating && <p className="atlas-alert atlas-tone-info" role="status">Generating print-quality PDF…</p>}
        {bytes && !generating && <p className="atlas-alert atlas-tone-success" role="status">PDF ready{count > 0 ? ` · ${count} ${count === 1 ? "page" : "pages"}` : ""}.</p>}
        {bytes && <WorksheetPreview bytes={bytes} count={count} onCount={setCount} />}
      </>}
    </section>
  </div>;
}
