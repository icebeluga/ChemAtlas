"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { sitePath } from "#student-content";

export type TopBarDestination = "builder" | "progress" | "review" | "audit" | "legacy" | "banks";

type Props = {
  current: "bank" | "worksheet" | "other";
  worksheetCount: number;
  reviewCount: number;
  inert: boolean;
  onSignOut?: () => void;
  onBank: () => void;
  onOpen: (destination: TopBarDestination) => void;
  search?: { value: string; onChange: (value: string) => void };
};

// Shared top bar for every student screen: two primary destinations plus the older tools under "More".
export function AppTopBar({ current, worksheetCount, reviewCount, inert, onBank, onOpen, search, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const destinationsId = useId();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !more.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => {
    if (!search || inert) return;
    function focusSearch(event: KeyboardEvent) {
      const target = event.target;
      if (event.key !== "/" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing ||
        !(target instanceof Element) || !target.matches(".ca-rows .ca-row-open, .ca-list-title h1") ||
        target.closest("dialog,[contenteditable]")) return;
      event.preventDefault();
      input.current?.focus();
    }
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, [search, inert]);

  const item = (destination: TopBarDestination, label: string, extra?: string) =>
    <button type="button" onClick={() => { setOpen(false); moreButton.current?.focus(); onOpen(destination); }}>{label}{extra && <span>{extra}</span>}</button>;

  return <header className="ca-bar" inert={inert}>
    <span className="ca-mark">ChemAtlas</span>
    <nav className="ca-nav" aria-label="Main navigation">
      <button type="button" aria-current={current === "bank" ? "page" : undefined} onClick={onBank}>Question bank</button>
      <a href={sitePath("practice-builder")} aria-current={current === "worksheet" ? "page" : undefined}>
        Practice builder <span className="ca-count" aria-label={`${worksheetCount} selected`}>{worksheetCount}</span>
      </a>
      <div className="ca-more" ref={more} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }} onKeyDown={event => {
        if (!open || event.key !== "Escape") return;
        event.preventDefault();
        setOpen(false);
        moreButton.current?.focus();
      }}>
        <button ref={moreButton} type="button" aria-controls={destinationsId} aria-expanded={open} aria-current={current === "other" ? "page" : undefined} onClick={() => setOpen(value => !value)}>
          More <ChevronDown size={15} aria-hidden="true" />
        </button>
        <div className="ca-menu" id={destinationsId} hidden={!open}>
          <b>Study</b>
          {item("builder", "Practice sessions")}
          {item("progress", "Progress")}
          <b>Catalog tools</b>
          {item("review", "Review queue", String(reviewCount))}
          {item("audit", "Source page audit")}
          {item("legacy", "Legacy content")}
          {item("banks", "Manage test banks")}
        </div>
      </div>
    </nav>
    {search && <label className="ca-search">
      <Search size={15} aria-hidden="true" />
      <input ref={input} type="search" value={search.value} placeholder="Search year, number, topic or wording" aria-label="Search questions"
        onChange={event => search.onChange(event.target.value)} onKeyDown={event => { if (event.key === "Escape") event.currentTarget.blur(); }} />
      <span className="ca-kbd" aria-hidden="true">/</span>
    </label>}
    {onSignOut && <button type="button" className="ca-sign-out" onClick={onSignOut}>Log out</button>}
  </header>;
}
