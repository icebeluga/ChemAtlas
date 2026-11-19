"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { sitePath } from "#student-content";

type Props = {
  current: "bank" | "worksheet" | "other";
  worksheetCount: number;
  inert: boolean;
  onSignOut?: () => void;
  onBank: () => void;
  search?: { value: string; onChange: (value: string) => void };
};

// Keep the primary student navigation to the two destinations in the design brief.
export function AppTopBar({ current, worksheetCount, inert, onBank, search, onSignOut }: Props) {
  const input = useRef<HTMLInputElement>(null);

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

  return <header className="ca-bar" inert={inert}>
    <span className="ca-mark">ChemAtlas</span>
    <nav className="ca-nav" aria-label="Main navigation">
      <button type="button" aria-current={current === "bank" ? "page" : undefined} onClick={onBank}>Question bank</button>
      <a href={sitePath("practice-builder")} aria-current={current === "worksheet" ? "page" : undefined}>
        Practice builder <span className="ca-count" aria-label={`${worksheetCount} selected`}>{worksheetCount}</span>
      </a>
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
