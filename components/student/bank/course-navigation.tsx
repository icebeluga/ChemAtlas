"use client";

import { useId, useLayoutEffect, useRef, useState, useEffect } from "react";
import { Popover } from "@base-ui/react/popover";
import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronsDown, X } from "lucide-react";
import type { Catalog } from "@/components/student/hooks/use-catalog";
import { connectUnitAccordion, resetUnitAccordion } from "./unit-highlight";
import { UnitFocusControl } from "./unit-focus-control";

type Counts = { byTopic: Map<string, number>; byUnit: Map<string, number>; max: number };
type Props = {
  catalog: Catalog; counts: Counts; total: number; unit: string; topic: string;
  focused: boolean; disabled: boolean;
  onFocus: (focused: boolean) => void;
  onFilters: (filters: { unit?: string; topic?: string }) => void;
};
const density = (count: number, max: number) => count ? [.15, .4, .7, 1][Math.min(3, Math.floor(Math.sqrt(count / max) * 4))] : 0;

/** Visibility is independent of filtering. Only the shared selection callbacks
 * change the catalog view; opening/dismissing never touches the workspace. */
export function CourseNavigation(props: Props) {
  const { catalog, unit, topic, focused, disabled, onFocus, onFilters } = props;
  const [open, setOpen] = useState(false);
  const [movedToOverlay, setMovedToOverlay] = useState(false);
  const [triggerId, setTriggerId] = useState<string | null>(null);
  const reveal = useRef("units");
  const host = useRef<HTMLElement>(null), anchor = useRef<HTMLDivElement>(null), popup = useRef<HTMLDivElement>(null);
  const browse = useRef<HTMLButtonElement>(null);
  const id = useId();
  const activeUnit = catalog.units.find(u => u.id === unit)
    ?? catalog.units.find(u => u.topics.some(([key]) => key === topic));
  const number = activeUnit ? catalog.units.indexOf(activeUnit) + 1 : 0;
  const activeTopic = activeUnit?.topics.find(([key]) => key === topic);
  const overlayLocation = focused && movedToOverlay;

  function selectTopic(next: string) {
    if (overlayLocation || next === "all") onFocus(true);
    onFilters({ unit: activeUnit?.id ?? unit, topic: next });
    setOpen(false);
    // The selected inline topic may disappear during collapse. Keep focus on
    // a useful navigation control rather than dropping it to the document.
    requestAnimationFrame(() => browse.current?.focus({ preventScroll: true }));
  }
  const cards = <CourseCards {...props} unit={activeUnit?.id ?? unit} overlay={overlayLocation} tooltipContainer={host}
    onUnit={next => onFilters({ unit: !overlayLocation && unit === next ? "all" : next, topic: "all" })}
    onTopic={selectTopic} onCollapse={() => { onFocus(true); requestAnimationFrame(() => browse.current?.focus({ preventScroll: true })); }} />;

  return <nav className="ca-course ca-adaptive-navigation" ref={host} aria-label="Units and topics"
    data-focused={focused ? "" : undefined} data-u={activeUnit?.id} inert={disabled}>
    <Popover.Root open={open} triggerId={triggerId} modal={false} onOpenChange={(next, details) => {
      if (next) { onFocus(true); setMovedToOverlay(true); }
      setTriggerId(details.trigger?.id ?? triggerId);
      setOpen(next);
    }}>
      <Collapsible.Root open={!focused}>
        <Collapsible.Panel className="ca-navigation-inline" inert={focused}>
          {!overlayLocation && cards}
        </Collapsible.Panel>
      </Collapsible.Root>
      {focused && <div className="ca-focus-navigation" ref={anchor}>
        <Popover.Trigger id={`${id}-browse`} ref={browse} className="ca-browse-trigger" onClick={() => { reveal.current = "units"; }}>
          Browse <ChevronDown size={14} aria-hidden="true" />
        </Popover.Trigger>
        <span className="ca-crumb-divider" aria-hidden="true" />
        <div className="ca-breadcrumb" aria-label="Current unit and topic">
          <Popover.Trigger id={`${id}-unit`} className="ca-crumb-unit" onClick={() => { reveal.current = "units"; }}
            aria-label={activeUnit ? `Browse Unit ${number}: ${activeUnit.name}` : "Browse all units"} title={activeUnit?.name}>
            {activeUnit ? <>Unit {number}<span className="ca-crumb-unit-name"> / {activeUnit.name}</span></> : "All units"}
          </Popover.Trigger>
          {activeTopic && <><span aria-hidden="true">/</span>
            <Popover.Trigger id={`${id}-topic`} className="ca-crumb-topic" onClick={() => { reveal.current = "topics"; }}
              aria-label={`Browse topic ${activeTopic[0]} ${activeTopic[1]}`} title={`${activeTopic[0]} ${activeTopic[1]}`}>
              {activeTopic[0]} {activeTopic[1]}
            </Popover.Trigger></>}
        </div>
        <Popover.Trigger id={`${id}-handle`} className="ca-navigation-handle" aria-label={open ? "Hide navigation browser" : "Reveal navigation browser"}
          onClick={() => { reveal.current = "topics"; }}>
          <ChevronsDown size={15} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </Popover.Trigger>
      </div>}
      <Popover.Portal container={host}>
        <Popover.Positioner className="ca-course-positioner" anchor={anchor} side="bottom" align="start" sideOffset={4}
          positionMethod="fixed" collisionPadding={8} collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}>
          <Popover.Popup className="ca-course-browser" ref={popup} data-course-browser="" aria-label="Browse units and topics"
            finalFocus={() => document.getElementById(triggerId ?? "") ?? browse.current ?? true}
            initialFocus={() => (reveal.current === "topics"
              ? popup.current?.querySelector<HTMLElement>('.ca-topics .ca-topic[aria-pressed="true"]') ?? popup.current?.querySelector<HTMLElement>('.ca-topics .ca-topic')
              : popup.current?.querySelector<HTMLElement>('.ca-unit-select[aria-pressed="true"]')) ?? true}>
            <header className="ca-browser-header"><Popover.Title>Browse units and topics</Popover.Title>
              <div className="ca-browser-header-actions">
                <UnitFocusControl label={activeUnit ? `View all Unit ${number} questions` : "View all questions"}
                  onActivate={() => selectTopic("all")} container={host} unit={activeUnit?.id} placement={activeUnit ? "mobile" : "header"} />
                <Popover.Close className="ca-icon" aria-label="Close navigation browser"><X size={16} aria-hidden="true" /></Popover.Close>
              </div>
            </header>
            {overlayLocation && cards}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  </nav>;
}

type CardsProps = Props & { overlay: boolean; onUnit: (unit: string) => void; onTopic: (topic: string) => void; onCollapse: () => void; tooltipContainer: React.RefObject<HTMLElement | null> };
function CourseCards({ catalog, counts, total, unit, topic, overlay, onUnit, onTopic, onCollapse, tooltipContainer }: CardsProps) {
  const activeUnit = catalog.units.find(u => u.id === unit);
  const number = activeUnit ? catalog.units.indexOf(activeUnit) + 1 : 0;
  const units = useRef<HTMLDivElement>(null), band = useRef<HTMLDivElement>(null), sheet = useRef<HTMLDialogElement>(null);
  const [split, setSplit] = useState(0);
  useEffect(() => units.current ? connectUnitAccordion(units.current) : undefined, [unit, catalog.units, total]);
  useLayoutEffect(() => {
    const element = band.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (!element.clientWidth) return;
      const measure = element.cloneNode(true) as HTMLDivElement;
      measure.setAttribute("aria-hidden", "true"); measure.inert = true;
      Object.assign(measure.style, { position: "fixed", top: "0", left: "0", width: "max-content", visibility: "hidden", pointerEvents: "none" });
      measure.querySelectorAll<HTMLElement>(".ca-topic-row").forEach(row => { row.style.width = "max-content"; });
      measure.querySelectorAll<HTMLElement>(".ca-topic").forEach(button => Object.assign(button.style, { flex: "none", width: "max-content", maxWidth: "none", whiteSpace: "nowrap" }));
      element.parentElement?.appendChild(measure);
      const widths = [...measure.querySelectorAll<HTMLElement>(".ca-topic")].map(button => button.getBoundingClientRect().width + 3);
      measure.remove();
      let best = 1, smallest = Infinity;
      for (let i = 1; i < widths.length; i++) {
        const largest = Math.max(widths.slice(0, i).reduce((sum, w) => sum + w, 0), widths.slice(i).reduce((sum, w) => sum + w, 0));
        if (largest < smallest) { best = i; smallest = largest; }
      }
      setSplit(best);
    });
    observer.observe(element); return () => observer.disconnect();
  }, [activeUnit]);
  function chooseTopic(id: string) { sheet.current?.close(); onTopic(id); }
  const focusLabel = overlay ? `View all Unit ${number} questions` : "Focus on this unit";
  const focusUnit = overlay ? () => onTopic("all") : onCollapse;
  return <div className="ca-navigation-cards" data-overlay={overlay ? "" : undefined}>
    <h2 className="ca-sr">Browse by unit</h2>
    <div className="ca-units" ref={units}>
      <div className="ca-unit is-all" style={{ "--i": 0 } as React.CSSProperties} data-selected={unit === "all" ? "" : undefined}>
        <button type="button" className="ca-unit-select" aria-pressed={unit === "all"} aria-label={`All units, ${total} questions`}
          onClick={() => { resetUnitAccordion(units.current); onUnit("all"); }}>
        <b>All</b><span>{total ? total.toLocaleString() : ""}</span><span className="ca-sr">units</span>
        <i className="ca-unit-highlight" aria-hidden="true"><b><span className="ca-unit-number">All</span></b><span>{total ? total.toLocaleString() : ""}</span></i>
        </button>
      </div>
      {catalog.units.map((u, i) => <div key={u.id} className="ca-unit" data-u={u.id} data-selected={unit === u.id ? "" : undefined} style={{ "--i": i + 1 } as React.CSSProperties}>
        <button type="button" className="ca-unit-select" aria-pressed={unit === u.id} aria-label={`Unit ${i + 1}, ${u.name}, ${counts.byUnit.get(u.id) ?? 0} questions`}
        onClick={() => { resetUnitAccordion(units.current); onUnit(u.id); }}>
        <b>{i + 1}<small>{counts.byUnit.get(u.id) ?? 0}</small></b>{unit === u.id && <span>{u.name}</span>}
        <i className="ca-heat" aria-hidden="true">{u.topics.map(([key]) => <i key={key} style={{ "--d": density(counts.byTopic.get(key) ?? 0, counts.max) } as React.CSSProperties} />)}</i>
        <i className="ca-unit-highlight" aria-hidden="true"><b><span className="ca-unit-number">{i + 1}</span><small>{counts.byUnit.get(u.id) ?? 0}</small></b><span>{u.name}</span>
          <i className="ca-heat">{u.topics.map(([key]) => <i key={key} style={{ "--d": density(counts.byTopic.get(key) ?? 0, counts.max) } as React.CSSProperties} />)}</i>
        </i>
        </button>
        {unit === u.id && <UnitFocusControl label={focusLabel} onActivate={focusUnit} container={tooltipContainer} />}
      </div>)}
    </div>
    <div className="ca-unit-line" data-u={activeUnit?.id}>
      <b>{activeUnit ? `Unit ${number}: ${activeUnit.name}` : "All nine units"}</b>
      {activeUnit && !overlay && <UnitFocusControl label={focusLabel} onActivate={focusUnit} container={tooltipContainer} unit={activeUnit.id} placement="mobile" />}
      {activeUnit && <button type="button" className="ca-btn is-quiet ca-topic-open" aria-haspopup="dialog" onClick={() => sheet.current?.showModal()}>All topics <ChevronDown size={15} aria-hidden="true" /></button>}
    </div>
    <div className="ca-topics-wrap" data-open={activeUnit ? "" : undefined}>
      <div className="ca-topics" ref={band} data-u={activeUnit?.id}>
        {[activeUnit?.topics.slice(0, split || Math.ceil(activeUnit.topics.length / 2)), activeUnit?.topics.slice(split || Math.ceil(activeUnit.topics.length / 2))].map((row, index) => <div className="ca-topic-row" key={index}>
          {row?.map(([key, name]) => { const count = counts.byTopic.get(key) ?? 0;
            return <button type="button" key={key} className="ca-topic" style={{ "--d": density(count, counts.max) } as React.CSSProperties}
              data-empty={count ? undefined : ""} aria-pressed={topic === key} onClick={() => onTopic(key)}><b>{key}</b><span className="ca-topic-name">{name}</span><i>{count}</i></button>;
          })}
        </div>)}
      </div>
    </div>
    <dialog className="ca-sheet" ref={sheet} aria-label="Topics" data-u={activeUnit?.id} onClick={event => { if (event.target === sheet.current) sheet.current?.close(); }}>
      <header><b>{activeUnit ? `Unit ${number} topics` : "Topics"}</b><button type="button" className="ca-icon" aria-label="Close topics" onClick={() => sheet.current?.close()}><X size={16} aria-hidden="true" /></button></header>
      <ul><li><button type="button" aria-pressed={topic === "all"} onClick={() => chooseTopic("all")}><span>All topics</span><i>{activeUnit ? counts.byUnit.get(activeUnit.id) ?? 0 : ""}</i></button></li>
        {activeUnit?.topics.map(([key, name]) => <li key={key}><button type="button" aria-pressed={topic === key} onClick={() => chooseTopic(key)}><b className="ca-code">{key}</b><span>{name}</span><i>{counts.byTopic.get(key) ?? 0}</i></button></li>)}
      </ul>
    </dialog>
  </div>;
}
