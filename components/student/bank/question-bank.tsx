"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, MoveHorizontal, Plus, Scan, TriangleAlert, X } from "lucide-react";
import { getStimuli, sitePath } from "#student-content";
import { planWorksheet } from "../../../lib/worksheet.mjs";
import { useExportData } from "@/components/student/hooks/use-export-data";
import type { Catalog, Question } from "@/components/student/hooks/use-catalog";
import { PdfQuestionPage } from "@/components/student/pdf-question-page";
import { filterQuestions } from "@/lib/question-filter";
import { sourcePageLocation } from "@/lib/question-source";
import { MAX_ZOOM, MIN_ZOOM, stepZoom, type ViewerZoom } from "@/lib/viewer-scale";

type Topic = { id: string; name: string; unit: string; unitName: string };
type Filters = { unit?: string; topic?: string; type?: string; query?: string };
type ImageMode = "full" | "crop";

type Props = {
  catalog: Catalog; topics: Topic[]; questions: Question[]; loadFailed: boolean; wide: boolean;
  unit: string; topic: string; type: string; query: string;
  /** Question named in the URL (`view=detail&question=`); empty when none. */
  selectedId: string;
  onFilters: (updates: Filters) => void;
  onSelect: (id: string, replace: boolean) => void;
  onClosePane: () => void;
  worksheetIds: string[]; canEdit: boolean; onToggle: (id: string) => void;
  worksheetWarning?: ReactNode;
  bankName: (id?: string) => string;
};

const PAGE = 100;
const emptyFiles: NonNullable<Catalog["sourceFiles"]> = [];
const originalPagesFor = (q: Question) => q.sourcePagesOriginal?.length ? q.sourcePagesOriginal : (q.pages?.length ? q.pages : [1]);
// four heat steps, by square root so sparse topics stay visible
const density = (count: number, max: number) => count ? [.15, .4, .7, 1][Math.min(3, Math.floor(Math.sqrt(count / max) * 4))] : 0;

/** Unified Question Bank: course band, question list, printed-question pane and worksheet strip. */
export function QuestionBank(props: Props) {
  const { catalog, topics, questions, loadFailed, wide, unit, topic, type, query, selectedId, onFilters, onSelect, onClosePane, worksheetIds, canEdit, onToggle, bankName } = props;
  const paneOpen = !!selectedId && !wide;
  const { content } = useExportData();
  const [year, setYear] = useState("all");
  const [reviewedOnly, setReviewedOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [mode, setMode] = useState<ImageMode>("full");
  const [focusedId, setFocusedId] = useState("");
  const bank = useRef<HTMLDivElement>(null);
  const course = useRef<HTMLElement>(null);
  const dock = useRef<HTMLElement>(null);
  const pane = useRef<HTMLElement>(null);
  const rows = useRef<HTMLOListElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const paneHeading = useRef<HTMLHeadingElement>(null);
  const paneOpener = useRef<HTMLElement>(null);
  const restoreOnClose = useRef(false);
  const stepFocus = useRef<{ id: string; delta: number } | null>(null);

  const unitOf = useMemo(() => new Map(topics.map(t => [t.id, t.unit])), [topics]);
  const topicName = useMemo(() => new Map(topics.map(t => [t.id, t.name])), [topics]);
  const classified = useMemo(() => questions.filter(q => q.status === "classified"), [questions]);
  // Counts use the same rule as the list: a question counts under every topic it is filed under.
  const counts = useMemo(() => {
    const byTopic = new Map<string, number>(), byUnit = new Map<string, number>();
    for (const q of classified) {
      const units = new Set<string>();
      for (const id of q.relatedTopics ?? []) { byTopic.set(id, (byTopic.get(id) ?? 0) + 1); const u = unitOf.get(id); if (u) units.add(u); }
      for (const u of units) byUnit.set(u, (byUnit.get(u) ?? 0) + 1);
    }
    return { byTopic, byUnit, max: Math.max(1, ...byTopic.values()) };
  }, [classified, unitOf]);
  const years = useMemo(() => [...new Set(classified.map(q => q.year).filter((y): y is string => !!y))].sort().reverse(), [classified]);
  const hasLayout = useCallback((id: string) => !!content?.questions[id], [content]);

  const results = useMemo(() => filterQuestions(questions, {
    unit, topic, type: type === "Mixed" ? "all" : type,
    unitForTopic: id => id ? unitOf.get(id) : undefined,
    include: q => q.status === "classified" && (year === "all" || q.year === year) && (!reviewedOnly || hasLayout(q.id)),
    search: { query, text: q => `${q.year} ${q.exam} ${q.number} ${q.textPreview} ${q.displayName} ${(q.relatedTopics ?? []).join(" ")}` },
  }), [questions, unit, topic, type, query, year, reviewedOnly, unitOf, hasLayout]);

  const byId = useMemo(() => new Map(questions.map(q => [q.id, q])), [questions]);
  const current = (selectedId ? byId.get(selectedId) : undefined) ?? (wide ? results[0] : undefined);
  const paneQuestionId = current?.id;
  const currentIndex = current ? results.findIndex(q => q.id === current.id) : -1;
  const visibleResults = useMemo(() => results.slice(0, shown), [results, shown]);
  const focusedIndex = visibleResults.findIndex(q => q.id === focusedId);
  const tabIndexInResults = focusedIndex >= 0 ? focusedIndex : currentIndex >= 0 && currentIndex < shown ? currentIndex : 0;
  const activeUnit = catalog.units.find(u => u.id === unit);
  const topicBand = useRef<HTMLDivElement>(null);
  const [topicBreak, setTopicBreak] = useState(0);
  useLayoutEffect(() => {
    const band = topicBand.current;
    if (!band) return;
    const observer = new ResizeObserver(() => {
      const widths = [...band.querySelectorAll<HTMLElement>(".ca-topic")].map(button => button.getBoundingClientRect().width + 3);
      let best = 1, smallest = Infinity;
      for (let index = 1; index < widths.length; index++) {
        const widest = Math.max(widths.slice(0, index).reduce((sum, width) => sum + width, 0),
          widths.slice(index).reduce((sum, width) => sum + width, 0));
        if (widest < smallest) { best = index; smallest = widest; }
      }
      setTopicBreak(best);
    });
    observer.observe(band);
    return () => observer.disconnect();
  }, [activeUnit]);
  const activeUnitNumber = activeUnit ? catalog.units.indexOf(activeUnit) + 1 : 0;
  const activeTopic = topic !== "all" ? topic : "";
  const filtered = type !== "Mixed" || year !== "all" || reviewedOnly || !!query;
  const loading = !catalog.units.length && !loadFailed;

  useEffect(() => { rows.current?.scrollTo(0, 0); }, [unit, topic, type, query, year, reviewedOnly]);

  useLayoutEffect(() => {
    const container = bank.current;
    const strip = dock.current;
    if (wide || !container || !strip) return;
    const reserveStrip = () => container.style.setProperty("--ca-dock-height", `${Math.ceil(strip.getBoundingClientRect().height)}px`);
    reserveStrip();
    const observer = new ResizeObserver(reserveStrip);
    observer.observe(strip, { box: "border-box" });
    return () => observer.disconnect();
  }, [wide]);

  useEffect(() => {
    if (paneOpen) {
      restoreOnClose.current = true;
      paneHeading.current?.focus({ preventScroll: true });
    } else if (!selectedId && restoreOnClose.current) {
      restoreOnClose.current = false;
      const target = paneOpener.current?.isConnected ? paneOpener.current
        : rows.current?.querySelector<HTMLButtonElement>("button.ca-row-open") ?? listHeading.current;
      paneOpener.current = null;
      target?.focus({ preventScroll: true });
    }
  }, [paneOpen, paneQuestionId, selectedId]);

  useEffect(() => {
    const intent = stepFocus.current;
    if (!wide || !intent || intent.id !== paneQuestionId) return;
    stepFocus.current = null;
    const label = intent.delta > 0 ? "Next question" : "Previous question";
    const control = pane.current?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]:not(:disabled)`);
    (control ?? paneHeading.current)?.focus();
  }, [wide, paneQuestionId]);

  function openPane(id: string, opener: HTMLElement) {
    if (!wide && !paneOpen) paneOpener.current = opener;
    onSelect(id, wide || paneOpen);
  }

  const step = useCallback((delta: number) => {
    const next = results[Math.max(0, Math.min(results.length - 1, currentIndex + delta))];
    if (next && next.id !== current?.id) {
      if (wide) stepFocus.current = { id: next.id, delta };
      onSelect(next.id, true);
      if (wide) setFocusedId(next.id);
      rows.current?.querySelector(`[data-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }, [results, currentIndex, current, onSelect, wide]);

  const moveRowFocus = useCallback((from: number, delta: number) => {
    const next = visibleResults[from + delta];
    if (!next) return;
    const button = rows.current?.querySelector<HTMLButtonElement>(`[data-id="${CSS.escape(next.id)}"] .ca-row-open`);
    if (!button) return;
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: "nearest" });
    if (wide) onSelect(next.id, true);
  }, [visibleResults, wide, onSelect]);

  function onResultsKeyDown(event: ReactKeyboardEvent<HTMLOListElement>) {
    if (!isBankShortcut(event)) return;
    const key = event.key.toLowerCase();
    const target = event.target as Element;
    const arrow = key === "arrowdown" || key === "arrowup";
    if (!target.matches(arrow ? ".ca-row-open, .ca-add" : ".ca-row-open")) return;
    const item = target.closest<HTMLLIElement>(".ca-row[data-id]");
    if (!item?.dataset.id) return;
    if (["arrowdown", "arrowup", "j", "k"].includes(key)) {
      event.preventDefault();
      moveRowFocus(visibleResults.findIndex(q => q.id === item.dataset.id), key === "arrowdown" || key === "j" ? 1 : -1);
    } else if (key === "a" && canEdit && !event.repeat) {
      onToggle(item.dataset.id);
    } else if (key === "f" && wide && current && !event.repeat) {
      setMode(value => value === "full" ? "crop" : "full");
    }
  }

  function onPaneKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!current || event.target !== paneHeading.current || !isBankShortcut(event)) return;
    const key = event.key.toLowerCase();
    if ((key === "j" || key === "k") && currentIndex >= 0) {
      event.preventDefault();
      step(key === "j" ? 1 : -1);
    } else if (key === "a" && canEdit && !event.repeat) {
      onToggle(current.id);
    } else if (key === "f" && !event.repeat) {
      setMode(value => value === "full" ? "crop" : "full");
    }
  }

  useEffect(() => {
    if (!paneOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      const target = event.target;
      if (event.key === "Escape" && !event.defaultPrevented && !event.repeat && !document.fullscreenElement &&
        !(target instanceof Element && target.closest("dialog[open]"))) onClosePane();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [paneOpen, onClosePane]);

  function clearFilters() { setYear("all"); setReviewedOnly(false); setShown(PAGE); onFilters({ type: "Mixed", query: "" }); }
  function chooseTopic(id: string) { onFilters({ topic: id }); sheet.current?.close(); }

  return <div className="ca-bank" ref={bank} data-pane={paneOpen ? "" : undefined}>
    <nav className="ca-course" ref={course} aria-label="Units and topics" inert={paneOpen}>
      <h2 className="ca-sr">Browse by unit</h2>
      <div className="ca-units">
        <button type="button" className="ca-unit is-all" style={{ "--i": 0 } as React.CSSProperties} aria-pressed={unit === "all"} onClick={() => onFilters({ unit: "all", topic: "all" })}>
          <b>All</b><span>{classified.length ? classified.length.toLocaleString() : ""}</span><span className="ca-sr">units</span>
        </button>
        {catalog.units.map((u, i) => <button type="button" key={u.id} className="ca-unit" data-u={u.id} style={{ "--i": i + 1 } as React.CSSProperties}
          aria-pressed={unit === u.id} aria-label={`Unit ${i + 1}, ${u.name}, ${counts.byUnit.get(u.id) ?? 0} questions`}
          onClick={() => onFilters({ unit: unit === u.id ? "all" : u.id, topic: "all" })}>
          <b>{i + 1}<small>{counts.byUnit.get(u.id) ?? 0}</small></b>{unit === u.id && <span>{u.name}</span>}
          <i className="ca-heat" aria-hidden="true">{u.topics.map(([id]) => <i key={id} style={{ "--d": density(counts.byTopic.get(id) ?? 0, counts.max) } as React.CSSProperties} />)}</i>
        </button>)}
      </div>
      {/* phones: one line naming the open unit, and topics in a sheet instead of a sideways chip row */}
      <div className="ca-unit-line" data-u={activeUnit?.id}>
        <b>{activeUnit ? `Unit ${activeUnitNumber}: ${activeUnit.name}` : "All nine units"}</b>
        {activeUnit && <button type="button" className="ca-btn is-quiet ca-topic-open" aria-haspopup="dialog" onClick={() => sheet.current?.showModal()}>
          {activeTopic ? activeTopic : "All topics"} <ChevronDown size={15} aria-hidden="true" />
        </button>}
        {activeUnit && <button type="button" className="ca-btn is-quiet ca-topic-open" onClick={() => onFilters({ unit: "all", topic: "all" })}>All units</button>}
      </div>
      <div className="ca-topics-wrap" data-open={activeUnit ? "" : undefined}>
        <div className="ca-topics" ref={topicBand} data-u={activeUnit?.id}>
          {[activeUnit?.topics.slice(0, topicBreak || Math.ceil(activeUnit.topics.length / 2)), activeUnit?.topics.slice(topicBreak || Math.ceil(activeUnit.topics.length / 2))].map((row, rowIndex) => <div className="ca-topic-row" key={rowIndex}>
          {row?.map(([id, name]) => { const count = counts.byTopic.get(id) ?? 0;
            return <button type="button" key={id} className="ca-topic" style={{ "--d": density(count, counts.max) } as React.CSSProperties} data-empty={count ? undefined : ""}
              aria-pressed={topic === id} onClick={() => onFilters({ topic: topic === id ? "all" : id })}><b>{id}</b>{name}<i>{count}</i></button>; })}
          </div>)}
        </div>
      </div>
      <dialog className="ca-sheet" ref={sheet} aria-label="Topics" data-u={activeUnit?.id} onClick={event => { if (event.target === sheet.current) sheet.current?.close(); }}>
        <header><b>{activeUnit ? `Unit ${activeUnitNumber} topics` : "Topics"}</b><button type="button" className="ca-icon" aria-label="Close topics" onClick={() => sheet.current?.close()}><X size={16} aria-hidden="true" /></button></header>
        <ul>
          <li><button type="button" aria-pressed={topic === "all"} onClick={() => chooseTopic("all")}><span>All topics</span><i>{activeUnit ? counts.byUnit.get(activeUnit.id) ?? 0 : ""}</i></button></li>
          {activeUnit?.topics.map(([id, name]) => <li key={id}><button type="button" aria-pressed={topic === id} onClick={() => chooseTopic(id)}><b className="ca-code">{id}</b><span>{name}</span><i>{counts.byTopic.get(id) ?? 0}</i></button></li>)}
        </ul>
      </dialog>
    </nav>

    <div className="ca-work">
      <section className="ca-list" aria-label="Questions" inert={paneOpen}>
        <div className="ca-list-head">
          <div className="ca-list-title" data-u={activeUnit?.id}>
            {activeTopic ? <span className="ca-code">{activeTopic}</span> : activeUnit ? <span className="ca-code">Unit {activeUnitNumber}</span> : null}
            <h1 ref={listHeading} tabIndex={-1}>{activeTopic ? topicName.get(activeTopic) : activeUnit ? activeUnit.name : "Every unit"}</h1>
            <small role="status">{loading ? "Loading…" : `${results.length.toLocaleString()} question${results.length === 1 ? "" : "s"}`}</small>
          </div>
          {activeTopic && catalog.topicDetails?.[activeTopic] && <p>{catalog.topicDetails[activeTopic].description}</p>}
          <div className="ca-filters">
            <div className="ca-seg" role="group" aria-label="Question type">
              {([["Mixed", "All"], ["MCQ", "Multiple choice"], ["FRQ", "Free response"]] as const).map(([value, label]) =>
                <button type="button" key={value} aria-pressed={type === value} onClick={() => onFilters({ type: value })}>{label}</button>)}
            </div>
            <select aria-label="Exam year" value={year} onChange={event => { setYear(event.target.value); setShown(PAGE); }}>
              <option value="all">Any year</option>{years.map(y => <option key={y}>{y}</option>)}
            </select>
            <label className="ca-check"><input type="checkbox" checked={reviewedOnly} onChange={event => { setReviewedOnly(event.target.checked); setShown(PAGE); }} /> Reviewed print layout only</label>
            {filtered && <button type="button" className="ca-clear" onClick={clearFilters}>Clear filters</button>}
          </div>
        </div>
        <ol className="ca-rows" ref={rows} aria-label="Results" onKeyDown={onResultsKeyDown}>
          {loading && Array.from({ length: 8 }, (_, i) => <li key={i} className="ca-row catalog-row" aria-hidden="true"><span className="ca-row-open"><span /><span style={{ display: "grid", gap: 8, padding: "4px 0" }}><span className="ca-skel" style={{ width: "45%" }} /><span className="ca-skel" style={{ width: "85%" }} /></span></span></li>)}
          {visibleResults.map((q, rowIndex) => {
            const code = activeTopic || q.displayTopic || "";
            const on = worksheetIds.includes(q.id);
            const label = `${q.year ?? "Undated"} ${q.type} ${q.number}`;
            return <li key={q.id} className="ca-row catalog-row" data-id={q.id} data-u={unitOf.get(code)} data-current={q.id === current?.id ? "" : undefined}
              onFocus={() => setFocusedId(q.id)}>
              <button type="button" className="ca-row-open" tabIndex={rowIndex === tabIndexInResults ? 0 : -1}
                aria-current={q.id === current?.id ? "true" : undefined} onClick={event => openPane(q.id, event.currentTarget)}>
                <span className="ca-code">{code}</span>
                <span>
                  <span className="ca-row-line"><span className="ca-tag" data-t={q.type}>{q.type}</span><b>{q.year ?? "Undated"} · {q.number}</b>
                    {activeTopic ? (q.displayTopic && q.displayTopic !== activeTopic ? <em>Primary: {q.displayTopic}</em> : null) : <em>{q.displayName}</em>}
                    {hasLayout(q.id) && <span className="ca-ready" title="Reviewed print layout"><Check size={14} aria-hidden="true" /><span className="ca-sr">Reviewed print layout</span></span>}
                  </span>
                  <span className="ca-row-text">{(q.textPreview ?? "").replace(/^\d+\.\s*/, "")}</span>
                </span>
              </button>
              <button type="button" className="ca-icon ca-add" tabIndex={rowIndex === tabIndexInResults ? 0 : -1}
                aria-pressed={on} disabled={!canEdit || (!on && worksheetIds.length >= 500)}
                aria-label={`${on ? "Remove from" : "Add to"} worksheet: ${label}`} onClick={() => onToggle(q.id)}>
                {on ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
              </button>
            </li>;
          })}
          {!loading && !results.length && <li className="ca-empty"><b>{loadFailed ? "The catalog did not load" : "No questions match"}</b>
            {loadFailed ? "Check the connection and reload the page." : "Nothing in this view fits those filters. Try another topic, another year, or clear the search."}
            {!loadFailed && <><br /><button type="button" className="ca-btn" onClick={clearFilters}>Clear filters</button></>}</li>}
        </ol>
        <div className="ca-list-foot">
          <span className="ca-keys"><span className="ca-kbd">↑</span> <span className="ca-kbd">↓</span> move</span>
          <span className="ca-keys"><span className="ca-kbd">A</span> add or remove</span>
          <span className="ca-keys"><span className="ca-kbd">F</span> page or crop</span>
          <span className="ca-keys"><span className="ca-kbd">/</span> search</span>
          <a href={sitePath("?view=builder")}>Practice sessions</a><a href={sitePath("?view=progress")}>Progress</a>
          {results.length > shown && <button type="button" onClick={() => setShown(value => value + PAGE)}>Show {Math.min(PAGE, results.length - shown)} more</button>}
        </div>
      </section>

      <section className="ca-pane" ref={pane} aria-label="Printed question" onKeyDown={onPaneKeyDown}>
        {props.worksheetWarning}
        {current ? <QuestionPane key={current.id} question={current} index={currentIndex} total={results.length} activeTopic={activeTopic}
          heading={paneHeading}
          mode={mode} onMode={setMode} files={catalog.sourceFiles ?? emptyFiles} unitOf={unitOf} topicName={topicName} bankName={bankName}
          reviewed={content ? hasLayout(current.id) : undefined} reviewNote={content?.review?.[current.id]}
          onWorksheet={worksheetIds.includes(current.id)} canEdit={canEdit && (worksheetIds.includes(current.id) || worksheetIds.length < 500)}
          onToggle={() => onToggle(current.id)} onStep={step} onBack={onClosePane} />
          : paneOpen ? <div className="ca-pane-head">
            <button type="button" className="ca-icon ca-back" aria-label="Back to results" onClick={onClosePane}><ChevronLeft size={18} aria-hidden="true" /></button>
            <h2 ref={paneHeading} tabIndex={-1}>{loading ? "Loading the catalog…" : loadFailed ? "The catalog did not load" : "Question not found"}</h2>
          </div> : <div className="ca-empty"><b>{loading ? "Loading the catalog…" : "Pick a question"}</b>The printed question appears here, with what it tests.</div>}
      </section>

      <aside className="ca-dock" ref={dock} aria-label="Worksheet">
        <b>Worksheet</b>
        {worksheetIds.length ? <ol>{worksheetIds.map((id, i) => { const q = byId.get(id);
          return <li key={id}><button type="button" data-u={q ? unitOf.get(q.displayTopic ?? "") : undefined} aria-current={id === current?.id ? "true" : undefined}
            aria-label={`Worksheet question ${i + 1}${q ? `: ${q.year ?? "Undated"} ${q.type} ${q.number}` : ""}`} title={q ? `${q.year ?? "Undated"} ${q.type} ${q.number} · ${q.displayTopic ?? ""} ${q.displayName ?? ""}` : id}
            disabled={!q} onClick={event => q && openPane(q.id, event.currentTarget)}>{i + 1}</button></li>; })}</ol>
          : <span className="ca-hint">Empty. Add questions and they line up here in order.</span>}
        <a className={`ca-btn ${worksheetIds.length ? "is-primary" : "is-quiet"}`} href={sitePath("practice-builder")}>
          {worksheetIds.length ? <>Arrange {worksheetIds.length}<span className="ca-long">&nbsp;in Practice builder</span></> : "Practice builder"}<ChevronRight size={15} aria-hidden="true" />
        </a>
      </aside>
    </div>
  </div>;
}

function isBankShortcut(event: ReactKeyboardEvent) {
  return !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.altKey && !event.nativeEvent.isComposing &&
    event.target instanceof Element && !event.target.closest("input,select,textarea,dialog,[contenteditable]");
}

type PaneProps = {
  question: Question; index: number; total: number; activeTopic: string; mode: ImageMode; onMode: (mode: ImageMode) => void;
  heading: RefObject<HTMLHeadingElement | null>;
  files: NonNullable<Catalog["sourceFiles"]>; unitOf: Map<string, string>; topicName: Map<string, string>; bankName: (id?: string) => string;
  /** undefined while the print-layout data is still loading */
  reviewed: boolean | undefined; reviewNote?: string;
  onWorksheet: boolean; canEdit: boolean; onToggle: () => void; onStep: (delta: number) => void; onBack: () => void;
};

function QuestionPane({ question: q, index, total, activeTopic, mode, onMode, heading, files, unitOf, topicName, bankName, reviewed, reviewNote, onWorksheet, canEdit, onToggle, onStep, onBack }: PaneProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState<ViewerZoom>("width");
  const [scale, setScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const detailsBox = useRef<HTMLDivElement>(null);
  const detailsSummary = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!detailsOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !detailsBox.current?.contains(event.target)) setDetailsOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [detailsOpen]);
  const viewer = useRef<HTMLDivElement>(null);
  const onScale = useCallback((value: number) => setScale(value), []);

  useEffect(() => {
    const sync = () => setFullscreen(!!viewer.current && document.fullscreenElement === viewer.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  async function toggleFullscreen() {
    try { if (document.fullscreenElement === viewer.current) await document.exitFullscreen(); else await viewer.current?.requestFullscreen(); }
    catch { /* fullscreen is optional; the viewer stays usable without it */ }
  }

  const pages = originalPagesFor(q);
  const page = pages[pageIndex] ?? pages[0] ?? 1;
  const source = sourcePageLocation(page, files, q.sourceBank);
  const hasCrop = !!q.sourceRegions?.length;
  const view: ImageMode = mode === "crop" && hasCrop ? "crop" : "full";
  const related = q.relatedTopics ?? [];
  const partTopic = activeTopic && related.includes(activeTopic) ? activeTopic : undefined;
  const parts = (q.topicParts ?? []).filter(part => part.topics.length && (!partTopic || part.topics.includes(partTopic)));
  const highlights = partTopic ? parts.map(part => part.label) : [];
  const segments = view === "crop" ? planWorksheet([q], getStimuli().stimuli, originalPagesFor)[0].segments : [];
  const cropFit = segments.length > 1 && segments.every(segment => segment.regions.length) ? {
    width: Math.max(...segments.map(({ regions }) => Math.max(...regions.map(r => r.rect[2])) - Math.min(...regions.map(r => r.rect[0])))),
    height: segments.reduce((sum, { regions }) => sum + Math.max(...regions.map(r => r.rect[3])) - Math.min(...regions.map(r => r.rect[1])), 0),
  } : undefined;
  const others = related.filter(id => id !== q.displayTopic);

  return <>
    <div className="ca-pane-head" data-u={unitOf.get(q.displayTopic ?? "")}>
      <button type="button" className="ca-icon ca-back" aria-label="Back to results" onClick={onBack}><ChevronLeft size={18} aria-hidden="true" /></button>
      <div className="ca-grow">
        <h2 ref={heading} tabIndex={-1}><span className="ca-tag" data-t={q.type}>{q.type}</span>{q.year ?? "Undated"} · Question {q.number}</h2>
        <p>{q.exam} · source page{pages.length > 1 ? "s" : ""} {pages.join(", ")}{index >= 0 ? ` · ${index + 1} of ${total}` : ""}</p>
      </div>
      <button type="button" className="ca-icon" aria-label="Previous question" disabled={index <= 0} onClick={() => onStep(-1)}><ChevronLeft size={17} aria-hidden="true" /></button>
      <button type="button" className="ca-icon" aria-label="Next question" disabled={index < 0 || index >= total - 1} onClick={() => onStep(1)}><ChevronRight size={17} aria-hidden="true" /></button>
      <div className="ca-seg" role="group" aria-label="Image mode">
        <button type="button" aria-pressed={view === "full"} onClick={() => onMode("full")}>Full page</button>
        <button type="button" aria-pressed={view === "crop"} disabled={!hasCrop} onClick={() => onMode("crop")}>Question crop</button>
      </div>
      <button type="button" className={`ca-btn ${onWorksheet ? "" : "is-primary"}`} aria-pressed={onWorksheet} disabled={!canEdit} onClick={onToggle}>
        {onWorksheet ? <><Check size={15} aria-hidden="true" />On worksheet</> : <><Plus size={15} aria-hidden="true" />Add to worksheet</>}
      </button>
      <div className="ca-question-details" ref={detailsBox} onKeyDown={event => {
        if (event.key === "Escape" && detailsOpen) {
          event.preventDefault(); setDetailsOpen(false); detailsSummary.current?.focus();
        }
      }}>
        {reviewed === false && <button type="button" className="ca-print-status" aria-expanded={detailsOpen} aria-controls={detailsId}
          onClick={() => setDetailsOpen(value => !value)}><TriangleAlert size={14} aria-hidden="true" />Print unreviewed</button>}
        <details className="ca-details" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
          <summary ref={detailsSummary}>Details <ChevronDown size={14} aria-hidden="true" /></summary>
          <div className="ca-details-panel" id={detailsId}>
            {reviewed !== undefined && <div className="ca-status" data-s={reviewed ? "ready" : "draft"}>
              {reviewed ? <Check size={15} aria-hidden="true" /> : <TriangleAlert size={15} aria-hidden="true" />}
              <span>{reviewed
                ? <><b>Reviewed print layout.</b> Check the worksheet PDF for the final layout.</>
                : <><b>No reviewed print layout yet.</b> {reviewNote ? `${reviewNote} ` : ""}Verify all subparts, figures, and continuation pages. In a worksheet this prints as its full source page.</>}</span>
            </div>}
            <div className="ca-meta">
              <div className="ca-chips" aria-label="Topics">
                {q.displayTopic && <span className="ca-chip" data-u={unitOf.get(q.displayTopic)}><b>{q.displayTopic}</b> {q.displayName}<small>Primary topic</small></span>}
                {others.map(id => <span className="ca-chip" key={id} data-u={unitOf.get(id)}><b>{id}</b> {topicName.get(id)}{id === activeTopic && <small>Listed here</small>}</span>)}
              </div>
              {!!parts.length && <details className="ca-parts-box">
                <summary>{partTopic ? `${parts.length} part${parts.length === 1 ? "" : "s"} test${parts.length === 1 ? "s" : ""} ${partTopic}, highlighted on the page` : `What each of the ${parts.length} parts tests`}</summary>
                <dl className="ca-parts">{parts.map((part, i) => [
                  <dt key={`t${i}`}>{part.label}</dt>,
                  <dd key={`d${i}`}>{part.rationale || part.textPreview || part.topicNames.join(", ")}</dd>,
                  <dd key={`c${i}`} className="ca-code" data-u={unitOf.get(part.topics[0])}>{part.topics.join(" · ")}</dd>,
                ])}</dl>
              </details>}
            </div>
          </div>
        </details>
      </div>
    </div>
    <div className="ca-pane-body">
      <div className="ca-viewer" ref={viewer} data-fit-page={zoom === "page" ? "" : undefined}>
        <div className="ca-viewer-bar" role="toolbar" aria-label="Image zoom">
          <button type="button" className="ca-icon" aria-label="Zoom out" disabled={scale <= MIN_ZOOM} onClick={() => setZoom(stepZoom(scale, -1))}><Minus size={15} aria-hidden="true" /></button>
          <output aria-live="polite" aria-label="Zoom level">{Math.round(scale * 100)}%</output>
          <button type="button" className="ca-icon" aria-label="Zoom in" disabled={scale >= MAX_ZOOM} onClick={() => setZoom(stepZoom(scale, 1))}><Plus size={15} aria-hidden="true" /></button>
          <button type="button" className="ca-icon" aria-label="Fit width" title="Fit width" aria-pressed={zoom === "width"} onClick={() => setZoom("width")}><MoveHorizontal size={15} aria-hidden="true" /></button>
          <button type="button" className="ca-icon" aria-label="Fit page" title="Fit page" aria-pressed={zoom === "page"} onClick={() => setZoom("page")}><Scan size={15} aria-hidden="true" /></button>
          <button type="button" className="ca-icon" aria-label="Actual size (1:1)" title="Actual size" aria-pressed={zoom === 1} onClick={() => setZoom(1)}>1:1</button>
          <button type="button" className="ca-icon" aria-label={fullscreen ? "Exit full screen" : "Full screen"} title="Full screen" aria-pressed={fullscreen} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
          </button>
          {view === "full" && pages.length > 1 && <div className="ca-pages" role="group" aria-label="Source page">
            {pages.map((p, i) => <button type="button" key={p} aria-pressed={page === p} onClick={() => setPageIndex(i)}>Page {p}</button>)}
          </div>}
        </div>
        <div className="ca-viewport" data-pdf-viewport key={`${view}:${page}`}>
          {view === "crop" ? segments.map(({ page: segmentPage, regions, stimulusId }, i) => {
            const location = sourcePageLocation(segmentPage, files, q.sourceBank);
            return <div key={`${stimulusId ?? "question"}:${segmentPage}:${i}`}>
              {stimulusId && <div className="ca-segment-label" data-viewer-chrome>Shared with neighbouring questions</div>}
              <PdfQuestionPage page={location.page} sourcePage={segmentPage} bankId={location.bankId} bankName={bankName(q.sourceBank)}
                sourceAsset={location.url} sourceRegions={regions} questionNumber={q.number} cropView
                highlightLabels={stimulusId ? [] : highlights} zoom={zoom} fitBox={cropFit} onScale={i === 0 ? onScale : undefined} />
            </div>;
          }) : <PdfQuestionPage page={source.page} sourcePage={page} bankId={source.bankId} bankName={bankName(q.sourceBank)}
            sourceAsset={source.url} sourceRegions={q.sourceRegions} questionNumber={q.number}
            highlightLabels={highlights} zoom={zoom} onScale={onScale} />}
        </div>
      </div>
    </div>
  </>;
}
