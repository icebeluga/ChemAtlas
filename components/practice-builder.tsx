"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { defaultFormat, backupSchema, addEntries, newDraft, newWorksheetId, presets, worksheetSource } from "@/lib/worksheet";
import { filterQuestions } from "@/lib/question-filter";
import { moveEntry, replaceEntry } from "@/lib/worksheet-edits";
import type { Backup, Draft, ExportMode, Format, Region, SourceFile } from "@/lib/worksheet";
import { useExportData } from "@/components/student/hooks/use-export-data";
import type { WorksheetQuestion } from "@/lib/worksheet-pdf";
import { ArrowDown, ArrowUp, Check, ChevronDown, GripVertical, Plus, TriangleAlert, Undo2, X } from "lucide-react";
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
  /** Leave the builder for the Question Bank. */
  onOpenBank: () => void;
};
const filterDefaults = { unit: "all", topic: "all", type: "all", year: "all", source: "all", history: "all", print: "all", search: "" };
const resultSize = 20;
const wideQuery = "(min-width: 701px)";
const subscribeWide = (callback: () => void) => { const media = matchMedia(wideQuery); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); };

function outlineSections(draft: Draft, questions: Map<string, Candidate>) {
  const { grouping, mcqTitle, frqTitle } = draft.format;
  const sections = new Map<string, { key: string; label: string; rows: { entry: Draft["entries"][number]; index: number }[] }>();
  draft.entries.forEach((entry, index) => {
    const question = questions.get(entry.id);
    // Match the composer's type and topic order without loading the PDF bundle.
    const key = grouping === "type" ? question?.type === "MCQ" ? "0" : "1"
      : grouping === "topic" ? question?.displayTopic ?? "~" : "";
    const label = grouping === "type" ? key === "0" ? mcqTitle || "Multiple choice" : frqTitle || "Free response"
      : grouping === "topic" ? [question?.displayTopic, question?.displayName].filter(Boolean).join(" · ") || "Other topics" : "";
    const section = sections.get(key) ?? { key, label, rows: [] };
    section.rows.push({ entry, index });
    sections.set(key, section);
  });
  return [...sections.values()].sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }));
}

export function PracticeBuilder({ questions, topics, files, progress, backup, save, openPdf, renderSource, onOpenBank }: Props) {
  const draft = backup.drafts.find(d => d.id === backup.active)!;
  // step doubles as the visible tab: 1 outline (phones only), 3 preview, 2 layout, 0 add questions
  const [step, setStep] = useState(() => draft.entries.length ? 3 : 0);
  const wide = useSyncExternalStore(subscribeWide, () => matchMedia(wideQuery).matches, () => true);
  const pane = step === 1 && wide ? 3 : step;
  const [filters, setFilters] = useState(filterDefaults);
  const [page, setPage] = useState(0);
  const [amount, setAmount] = useState(5);
  const { registry, content, contentError } = useExportData();
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<Draft>();
  const [replacement, setReplacement] = useState("");
  const [dragged, setDragged] = useState("");
  const [source, setSource] = useState<{ id: string; part: number }>();
  const [mode, setMode] = useState<ExportMode>("questions");
  const outlineItems = useRef<HTMLDivElement>(null);
  const movedEntry = useRef("");
  const hasAnswers = draft.entries.some(e => registry?.questions[e.id]?.answer);
  if (!hasAnswers && mode !== "questions") setMode("questions");

  const request = useMemo(() => pane === 3 && registry && content && draft.entries.length
    ? { draft, questions, registry, mode, files, openPdf, content }
    : undefined, [pane, draft, questions, registry, mode, files, openPdf, content]);
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
  const sections = useMemo(() => outlineSections(draft, byId), [draft, byId]);
  const outlinePositions = useMemo(() => new Map(sections.flatMap(section => section.rows)
    .map(({ entry }, index) => [entry.id, index + 1])), [sections]);
  useLayoutEffect(() => {
    if (!movedEntry.current) return;
    outlineItems.current?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(movedEntry.current)}"]`)?.focus();
    movedEntry.current = "";
  }, [draft.entries]);
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
      update(replaceEntry(draft, replacement, eligible[0]), true);
      setReplacement(""); setStep(3); setNotice("Question replaced."); return;
    }
    const next = addEntries(draft, eligible);
    const added = next.entries.length - draft.entries.length;
    if (added) update(next, true);
    setNotice(added ? `Added ${added} ${added === 1 ? "question" : "questions"}.` : "No eligible questions to add.");
  }
  function move(from: number, to: number, restoreFocus = false) {
    if (from === to) return;
    const entry = draft.entries[from];
    const target = draft.entries[to];
    if (!entry || !target) return;
    let next: Draft;
    if (draft.format.grouping === "none") {
      next = moveEntry(draft, from, to);
    } else {
      const entries = [...draft.entries];
      entries[from] = target;
      entries[to] = entry;
      next = { ...draft, entries };
    }
    if (restoreFocus) movedEntry.current = entry.id;
    update(next, true);
    setNotice(`Question ${outlinePositions.get(entry.id)} moved to position ${outlinePositions.get(target.id)} of ${draft.entries.length}.`);
  }
  function changeFormat<K extends keyof Format>(key: K, value: Format[K]) {
    update({ ...draft, format: { ...draft.format, [key]: value } });
  }
  function backupDownload() {
    const link = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = link; a.download = "chematlas-worksheets.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(link), 1000);
  }
  const f = draft.format;
  const tabs = [[1, "Outline"], [3, "Preview"], [2, "Layout"], [0, "Add questions"]] as const;
  const fallbackCount = content ? draft.entries.filter(entry => !content.questions[entry.id]).length : 0;
  const frqCount = draft.entries.filter(entry => byId.get(entry.id)?.type === "FRQ").length;
  function switchDraft(id: string) {
    const next = backup.drafts.find(item => item.id === id);
    save({ ...backup, active: id }); setStep(next?.entries.length ? 3 : 0); setUndo(undefined); setReplacement(""); setMode("questions");
  }

  // The outline is the editing surface; the Preview tab shows the PDF the real generator produces.
  return <div className="ca-build student-workspace" data-tab={step}>
    <header className="ca-b-head">
      <div className="ca-b-title">
        <h1>Practice Builder</h1>
        <span className="ca-b-count" aria-live="polite">{draft.entries.length} selected</span>
      </div>
      <label className="ca-b-field ca-b-name">Worksheet title<input maxLength={100} value={draft.name} onChange={e => update({ ...draft, name: e.target.value })} /></label>
      <label className="ca-b-field">Saved worksheets<select value={draft.id} onChange={e => switchDraft(e.target.value)}>
        {backup.drafts.map(d => <option key={d.id} value={d.id}>{d.name || "Untitled worksheet"}</option>)}
      </select></label>
      <div className="ca-b-actions">
        <button type="button" className="ca-btn is-quiet" onClick={() => open(newDraft())}>New worksheet</button>
        <details className="ca-b-more"><summary className="ca-btn is-quiet">Drafts <ChevronDown size={15} aria-hidden="true" /></summary><div className="ca-b-menu">
          <button type="button" onClick={e => { open({ ...draft, id: newWorksheetId(), name: `${draft.name.slice(0, 93)} (copy)` }); e.currentTarget.closest("details")?.removeAttribute("open"); }}>Duplicate this worksheet</button>
          <button type="button" onClick={backupDownload}>Download drafts</button>
          <label>Import drafts<input type="file" accept=".json,application/json" onChange={async e => {
            const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
            try {
              if (file.size > 2_000_000) throw new Error();
              const parsed = backupSchema.parse(JSON.parse(await file.text()));
              if (backup.drafts.length + parsed.drafts.length > 100) { setNotice("Import would exceed the 100-worksheet limit."); return; }
              const restored = parsed.drafts.map(d => ({ ...d, id: newWorksheetId() }));
              save({ ...backup, drafts: [...backup.drafts, ...restored], active: restored[parsed.drafts.findIndex(d => d.id === parsed.active)].id });
              setStep(3); setUndo(undefined); setReplacement(""); setNotice("Worksheet drafts imported.");
            } catch { setNotice("Could not import that worksheet backup."); }
          }} /></label>
        </div></details>
      </div>
      <p className="ca-b-status" role="status">{notice || "Drafts save in this browser. Download drafts to move them to another device."}</p>
    </header>
    {error && <p className="ca-b-error" role="alert">{error}</p>}

    <div className="ca-b-tabs" role="group" aria-label="Builder view">
      {tabs.map(([value, label]) => <button type="button" key={value} className={value === 1 ? "ca-b-tab-outline" : undefined} aria-pressed={pane === value} onClick={() => { setStep(value); if (value !== 0) setReplacement(""); }}>{label}</button>)}
    </div>

    <div className="ca-b-body">
      <section className="ca-b-outline" aria-label="Worksheet outline">
        <div className="ca-b-outline-head">
          <p>{draft.entries.length
            ? <><b>{draft.entries.length} question{draft.entries.length === 1 ? "" : "s"}</b>: {draft.entries.length - frqCount} multiple choice, {frqCount} free response.{fallbackCount > 0 && <span className="ca-b-warn"> {fallbackCount} without a reviewed print layout.</span>}</>
            : "No questions yet."}</p>
          <button type="button" className="ca-btn is-quiet" disabled={!undo || undo.id !== draft.id} onClick={() => { if (undo) { update(undo); setUndo(undefined); setNotice("Last worksheet change undone."); } }}><Undo2 size={15} aria-hidden="true" />Undo</button>
        </div>
        <div className="ca-b-items" ref={outlineItems}>
          {sections.map(({ key, label, rows }, sectionIndex) => {
            const headingId = `worksheet-section-${sectionIndex}`;
            const sourceInSection = rows.find(row => row.entry.id === dragged);
            return <section key={key} aria-labelledby={label ? headingId : undefined}>
              {label && <h3 className="ca-b-section" id={headingId}>{label}</h3>}
              <ol start={outlinePositions.get(rows[0].entry.id)}>
                {rows.map(({ entry, index }, i) => {
                  const q = byId.get(entry.id);
                  const position = outlinePositions.get(entry.id);
                  const previous = rows[i - 1];
                  const next = rows[i + 1];
                  const unit = q?.displayTopic ? `u${q.displayTopic.split(".")[0]}` : undefined;
                  const title = q ? `${registry?.questions[q.id]?.exam?.match(/^\d{4}/)?.[0] ?? q.year ?? "Undated"} · ${q.number}` : entry.id;
                  return <li key={entry.id} className="ca-b-item" data-entry-id={entry.id} data-u={unit} data-dragging={dragged === entry.id ? "" : undefined}
                    tabIndex={0} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                    onKeyDown={event => {
                      if (!event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest("input,select,textarea")) return;
                      const destination = event.key === "ArrowUp" ? previous : event.key === "ArrowDown" ? next : undefined;
                      if (destination) { event.preventDefault(); move(index, destination.index, true); }
                    }}
                    onDragOver={e => { if (sourceInSection) e.preventDefault(); }}
                    onDrop={e => { if (sourceInSection) { e.preventDefault(); move(sourceInSection.index, index); } setDragged(""); }}>
                    <span className="ca-b-grip" aria-hidden="true" draggable onDragStart={e => { e.dataTransfer.setData("text/plain", entry.id); setDragged(entry.id); }} onDragEnd={() => setDragged("")}><GripVertical size={16} /></span>
                    <span className="ca-b-num" aria-hidden="true">{position}</span>
                    <span className="ca-b-what">
                      <b>{q && <span className="ca-tag" data-t={q.type}>{q.type}</span>}{title}</b>
                      <small>{q ? <><span className="ca-code">{q.displayTopic}</span> {q.displayName}</> : "Missing catalog record"}</small>
                      {content && !content.questions[entry.id] && <small className="ca-b-warn"><TriangleAlert size={13} aria-hidden="true" /> Prints as its full source page</small>}
                      {content?.review?.[entry.id] && <small>{content.review[entry.id]}</small>}
                    </span>
                    <span className="ca-b-tools">
                      <button type="button" className="ca-icon" disabled={!previous} aria-label={`Move question ${position} up`} onClick={() => previous && move(index, previous.index, true)}><ArrowUp size={16} aria-hidden="true" /></button>
                      <button type="button" className="ca-icon" disabled={!next} aria-label={`Move question ${position} down`} onClick={() => next && move(index, next.index, true)}><ArrowDown size={16} aria-hidden="true" /></button>
                      <button type="button" className="ca-icon ca-b-remove" aria-label={`Remove question ${position}`} onClick={() => { update({ ...draft, entries: draft.entries.filter(e => e.id !== entry.id) }, true); setNotice("Question removed. Use Undo to bring it back."); }}><X size={16} aria-hidden="true" /></button>
                    </span>
                    <details className="ca-b-options">
                      <summary>Options{entry.breakBefore ? " · page break before" : ""}{entry.lines !== undefined ? ` · ${entry.lines} lines` : ""}</summary>
                      <div>
                        <label className="ca-check"><input type="checkbox" checked={entry.breakBefore} onChange={e => update({ ...draft, entries: draft.entries.map(item => item.id === entry.id ? { ...item, breakBefore: e.target.checked } : item) }, true)} /> Page break before</label>
                        {q?.type === "FRQ" && <label className="ca-b-inline">Response lines<input type="number" min={0} max={12} value={entry.lines ?? f.lines} onChange={e => {
                          const lines = Math.min(12, Math.max(0, Number(e.target.value) || 0));
                          update({ ...draft, entries: draft.entries.map(item => item.id === entry.id ? { ...item, lines } : item) }, true);
                        }} /></label>}
                        <button type="button" className="ca-btn is-quiet" onClick={() => { setReplacement(entry.id); setStep(0); }}>Replace…</button>
                      </div>
                    </details>
                  </li>;
                })}
              </ol>
            </section>;
          })}
          {!draft.entries.length && <div className="ca-empty"><b>No questions yet</b>Pick questions in the Question bank and they arrive here in the order you added them.<br /><button type="button" className="ca-btn" onClick={onOpenBank}>Open the Question bank</button></div>}
        </div>
        <div className="ca-b-outline-foot"><button type="button" className="ca-btn is-quiet" onClick={onOpenBank}><Plus size={15} aria-hidden="true" />Add from the Question bank</button></div>
      </section>

      <section className="ca-b-side" aria-label={pane === 3 ? "Worksheet preview" : pane === 2 ? "Layout" : "Add questions"}>
        {pane === 3 && <div className="ca-b-preview">
          <div className="ca-b-export">
            <label className="ca-b-inline">PDF contents<select value={mode} onChange={e => setMode(e.target.value as ExportMode)}>
              <option value="questions">Questions only</option><option value="answers" disabled={!hasAnswers}>Separate answer key</option><option value="combined" disabled={!hasAnswers}>Questions and answer key</option>
            </select></label>
            {bytes && url && !generating && <>
              <a className="ca-btn is-primary" href={url} download={`${(f.title || draft.name).replace(/[^\w -]/g, "").trim() || "worksheet"}${mode === "answers" ? " - answer key" : ""}.pdf`}>Download PDF</a>
              <a className="ca-btn is-quiet" href={url} target="_blank" rel="noreferrer">Open PDF to print</a>
            </>}
            <span className="ca-b-state" role="status">{!draft.entries.length ? "" : generating ? "Generating the PDF…" : bytes ? `PDF ready${count > 0 ? ` · ${count} ${count === 1 ? "page" : "pages"}` : ""}` : ""}</span>
          </div>
          {!!draft.entries.length && <p className="ca-b-note">This is the PDF itself, made by the same generator as the download.{fallbackCount > 0 && <> {fallbackCount} of {draft.entries.length} question{draft.entries.length === 1 ? "" : "s"} print{fallbackCount === 1 && draft.entries.length === 1 ? "s" : ""} as full source pages, which can include neighbouring questions or printed answers. Check before sharing.</>}{!hasAnswers && " This worksheet has no verified answer key."}</p>}
          {!draft.entries.length && <div className="ca-empty"><b>Nothing to preview yet</b>Add questions and the worksheet PDF appears here.</div>}
          {generating && <div className="ca-b-generating" aria-hidden="true"><span className="ca-skel" /><span className="ca-skel" /><span className="ca-skel" /></div>}
          {bytes && <WorksheetPreview bytes={bytes} count={count} onCount={setCount} />}
        </div>}

        {pane === 2 && <div className="ca-b-form">
          <label className="ca-b-field ca-b-preset">Apply a preset<select value="" onChange={e => {
            const preset = presets[Number(e.target.value)]; if (!preset) return;
            update({ ...draft, format: { ...defaultFormat, ...preset.format } }, true);
            setFilter("type", preset.type); setNotice(`Applied ${preset.name}.`);
          }}><option value="" disabled>Choose a preset</option>{presets.map((preset, i) => <option value={i} key={preset.name}>{preset.name}</option>)}</select></label>
          <fieldset className="ca-b-form-group"><legend>Document details</legend><div className="ca-b-fields">
            <label className="ca-b-field">Title<input maxLength={100} value={f.title} onChange={e => changeFormat("title", e.target.value)} /></label>
            <label className="ca-b-field">Subtitle<input maxLength={120} value={f.subtitle} onChange={e => changeFormat("subtitle", e.target.value)} /></label>
          </div><label className="ca-b-field">Worksheet instructions<textarea rows={3} maxLength={320} value={f.instructions} onChange={e => changeFormat("instructions", e.target.value)} /></label></fieldset>
          <fieldset className="ca-b-form-group"><legend>Page layout</legend><div className="ca-b-fields">
            <label className="ca-b-field">Paper size<select value={f.paper} onChange={e => changeFormat("paper", e.target.value as Format["paper"])}><option>Letter</option><option>A4</option></select></label>
            <label className="ca-b-field">Orientation<select value={f.landscape ? "Landscape" : "Portrait"} onChange={e => changeFormat("landscape", e.target.value === "Landscape")}><option>Portrait</option><option>Landscape</option></select></label>
            {([["margin", "Margins (pt)", 24, 72], ["font", "Document text (pt)", 9, 16], ["gap", "Question spacing (pt)", 4, 36], ["lines", "FRQ response lines", 0, 12]] as const).map(([key, label, min, max]) =>
              <label className="ca-b-field" key={key}>{label}<input type="range" min={min} max={max} value={f[key]} onChange={e => changeFormat(key, Number(e.target.value))} /><output>{f[key]}</output></label>)}
          </div></fieldset>
          <fieldset className="ca-b-form-group"><legend>Question sections</legend><div className="ca-b-fields">
            <label className="ca-b-field">Group by<select value={f.grouping} onChange={e => changeFormat("grouping", e.target.value as Format["grouping"])}><option value="none">Custom order</option><option value="type">MCQ and FRQ</option><option value="topic">Topic</option></select></label>
            <label className="ca-b-field">MCQ section heading<input maxLength={80} value={f.mcqTitle} onChange={e => changeFormat("mcqTitle", e.target.value)} /></label>
            <label className="ca-b-field">FRQ section heading<input maxLength={80} value={f.frqTitle} onChange={e => changeFormat("frqTitle", e.target.value)} /></label>
          </div>
          {f.grouping === "type" && <div className="ca-b-fields">
            <label className="ca-b-field">MCQ section instructions<textarea rows={2} maxLength={240} value={f.mcqInstructions} onChange={e => changeFormat("mcqInstructions", e.target.value)} /></label>
            <label className="ca-b-field">FRQ section instructions<textarea rows={2} maxLength={240} value={f.frqInstructions} onChange={e => changeFormat("frqInstructions", e.target.value)} /></label>
          </div>}</fieldset>
          <fieldset className="ca-b-form-group"><legend>Printed fields and references</legend><div className="ca-b-form-actions">{([["name", "Name field"], ["date", "Date field"], ["classField", "Class field"], ["pageNumbers", "Page numbers"], ["numbering", "Worksheet numbering"], ["citations", "Original source citations"], ["references", "AP reference tables"]] as const).map(([key, label]) =>
            <label key={key} className="ca-check"><input type="checkbox" checked={f[key]} onChange={e => changeFormat(key, e.target.checked)} /> {label}</label>)}</div></fieldset>
          <p className="ca-b-help">Grouping sets the section order and keeps your order within each section. Original question labels and answer-choice spacing are preserved inside the source image.</p>
          <button type="button" className="ca-btn is-primary" onClick={() => setStep(3)}>Preview the PDF</button>
        </div>}

        {pane === 0 && <div className="ca-b-form">
          <p className="ca-b-help">{replacement ? "Choose an unselected question to replace the current item." : "Any question can be added here, including ones awaiting classification. The Question bank is the faster way to browse by unit and topic."}</p>
          <div className="ca-b-fields">
            <label className="ca-b-field">Search<input value={filters.search} onChange={e => setFilter("search", e.target.value)} placeholder="Question, year, or keyword" /></label>
            <label className="ca-b-field">Unit<select value={filters.unit} onChange={e => setFilter("unit", e.target.value)}><option value="all">All units</option>{units.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label className="ca-b-field">Topic<select value={filters.topic} onChange={e => setFilter("topic", e.target.value)}><option value="all">All topics</option>{topics.filter(t => filters.unit === "all" || t.unit === filters.unit).map(t => <option key={t.id} value={t.id}>{t.id} · {t.name}</option>)}</select></label>
            <label className="ca-b-field">Type<select value={filters.type} onChange={e => setFilter("type", e.target.value)}><option value="all">All types</option><option>MCQ</option><option>FRQ</option></select></label>
          </div>
          <details className="ca-b-filters"><summary>Additional filters{[filters.year, filters.source, filters.print, filters.history].some(value => value !== "all") && " · active"}</summary><div className="ca-b-fields">
            <label className="ca-b-field">Exam year<select value={filters.year} onChange={e => setFilter("year", e.target.value)}><option value="all">All years</option>{[...new Set([...years, "2008"])].sort().reverse().map(y => <option key={y}>{y}</option>)}</select></label>
            <label className="ca-b-field">Original source<select value={filters.source} onChange={e => setFilter("source", e.target.value)}><option value="all">All sources</option>{sources.map(s => <option key={s}>{s}</option>)}</select></label>
            <label className="ca-b-field">Print status<select value={filters.print} onChange={e => setFilter("print", e.target.value)}><option value="all">All questions</option><option value="ready">Reviewed print layout</option></select></label>
            <label className="ca-b-field">Practice history<select value={filters.history} onChange={e => setFilter("history", e.target.value)}><option value="all">Any history</option><option value="attempted">Previously attempted</option><option value="missed">Previously missed</option></select></label>
          </div></details>
          <div className="ca-b-form-actions">
            <button type="button" className="ca-btn is-quiet" onClick={() => { setFilters(filterDefaults); setPage(0); }}>Clear filters</button>
            {!replacement && <><label className="ca-b-inline">Auto-add count<input type="number" min={1} max={50} value={amount} onChange={e => setAmount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} /></label>
            <button type="button" className="ca-btn is-quiet" onClick={() => add(candidates.filter(q => !selected.has(q.id)).slice(0, amount).map(q => q.id))}>Auto-add from matches</button></>}
          </div>
          <div className="ca-b-form-actions"><b role="status">{candidates.length.toLocaleString()} matches</b>{replacement && <button type="button" className="ca-btn is-quiet" onClick={() => { setReplacement(""); setStep(3); }}>Cancel replacement</button>}</div>
          {candidates.slice(page * resultSize, (page + 1) * resultSize).map(q => {
            const original = worksheetSource(q, registry);
            const reviewed = content?.questions[q.id];
            const previewRegions = [...(reviewed?.context ? content?.contexts[reviewed.context] ?? [] : []), ...(reviewed?.blocks ?? [])]
              .filter(block => block.kind === "region");
            const print = { ...original, pages: previewRegions.length ? previewRegions : original.pages };
            return <article className="ca-b-result" key={q.id} data-selected={selected.has(q.id)}>
              <div><b className="ca-b-result-title"><span className="ca-tag" data-t={q.type}>{q.type}</span> {q.number} · {print.exam ?? q.exam}</b>
                <small>{q.displayTopic} {q.displayName}{print.answer ? " · Verified answer" : ""}</small>
                {content && <small className="ca-b-result-status" data-reviewed={!!reviewed}>{reviewed ? "Reviewed print layout" : "Full source page fallback"}</small>}
                {content?.review?.[q.id] && <small>{content.review[q.id]}</small>}
              </div>
              <div className="ca-b-form-actions">
                {print.pages.length > 0 && <button type="button" className="ca-btn is-quiet" aria-expanded={source?.id === q.id} onClick={() => setSource(source?.id === q.id ? undefined : { id: q.id, part: 0 })}>{source?.id === q.id ? "Close preview" : "Preview"}</button>}
                <button type="button" className="ca-btn" disabled={selected.has(q.id)} onClick={() => add([q.id])}>{selected.has(q.id) ? <><Check size={16} aria-hidden="true" /> Added</> : replacement ? "Use replacement" : "Add to Worksheet"}</button>
              </div>
              {source?.id === q.id && print.pages.length > 0 && <div className="ca-b-source">
                {print.pages.length > 1 && <div className="ca-b-form-actions">{print.pages.map((p, i) => <button key={i} className="outline" aria-pressed={source.part === i} onClick={() => setSource({ id: q.id, part: i })}>Source page {p.page}{print.pages.some((other, j) => j !== i && other.page === p.page) ? ` · region ${i + 1}` : ""}</button>)}</div>}
                {renderSource(q, print.pages[source.part] ?? print.pages[0])}
              </div>}
            </article>;
          })}
          <div className="ca-b-form-actions"><button type="button" className="ca-btn is-quiet" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous results</button>
            <span>Page {page + 1} of {Math.max(1, Math.ceil(candidates.length / resultSize))}</span>
            <button type="button" className="ca-btn is-quiet" disabled={(page + 1) * resultSize >= candidates.length} onClick={() => setPage(page + 1)}>Next results</button></div>
        </div>}
      </section>
    </div>
  </div>;
}
