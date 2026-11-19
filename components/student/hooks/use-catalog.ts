"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type SetStateAction } from "react";
import type { Region as SourceRegion } from "@/lib/question-source";
type Unit = { id: string; name: string; topics: [string, string][] };
export type Question = {
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
export type Catalog = { sourceFiles?: {url:string;from:number;to:number}[]; units: Unit[]; questions: Question[]; sourcePages: number; includedSourcePages?: number[]; topicDetails?: Record<string, { description: string; learningObjectives?: string[]; pdfPages?: number[] }>; audit?: { totalPages: number; pagesReferencedByQuestionRecords: number; unreferencedPages: number[]; unresolvedPages: number; classified: number; legacy: number; review: number; coverageNote: string }; stats: Record<string, number> };

const STORAGE_KEY = "apchem-studio-v2";

type BrowserState = Omit<Saved, "sourcePages">;

function restoreBrowserState(initial: BrowserState): BrowserState {
  const state = { ...initial };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<Saved>;
    const prior = JSON.parse(localStorage.getItem("apchem-studio-v1") || "{}") as { progress?: Record<string, { attempts?: number; wrong?: number; correct?: number; last?: string; history?: { date: string; correct: boolean }[] }> };
    const migrated = Object.fromEntries(Object.entries(prior.progress || {}).map(([id,p]) => [id, {
      attempts:p.attempts || 0, wrong:p.wrong || 0, correct:p.correct || 0, last:p.last || "",
      history:(p.history || []).map(h=>({date:h.date,result:h.correct ? "correct" as const : "missed" as const}))
    }]));
    state.progress = { ...migrated, ...(saved.progress || {}) };
    state.overrides = saved.overrides || {};
    state.sessions = saved.sessions || 0;
    if (saved.banks?.length) state.banks = [...initial.banks, ...saved.banks.filter(b => b.id !== "mega")];
    if (saved.questions?.length) state.questions = saved.questions.filter(q => q.sourceBank);
  } catch { /* Keep the bundled bank usable if browser storage is damaged. */ }
  return state;
}

function createBrowserState() {
  const initial: BrowserState = {
    progress: {}, overrides: {}, sessions: 0, questions: [],
    banks: [{ id: "mega", name: "AP Chemistry MEGA Compiled Test Bank.pdf", size: 0, addedAt: "Bundled source" }],
  };
  let snapshot = initial;
  const listeners = new Set<() => void>();
  function publish(state: BrowserState) {
    snapshot = state;
    listeners.forEach(listener => listener());
  }
  return {
    getServerSnapshot: () => initial,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      // Subscriptions begin after hydration, when browser storage is available.
      listeners.add(listener);
      if (snapshot === initial) publish(restoreBrowserState(initial));
      return () => { listeners.delete(listener); };
    },
    set<Key extends keyof BrowserState>(key: Key, update: SetStateAction<BrowserState[Key]>) {
      const value = typeof update === "function" ? update(snapshot[key]) : update;
      if (!Object.is(value, snapshot[key])) publish({ ...snapshot, [key]: value });
    },
  };
}

type Topic = { id: string; name: string; unit: string; unitName: string };

export function deriveCatalogQuestions(questions: Question[], overrides: Saved["overrides"], topics: Topic[]): Question[] {
  return questions.map(q => {
    const topic = overrides[q.id] ?? q.primaryTopic ?? undefined;
    const related: string[] = overrides[q.id] ? [overrides[q.id],...(q.relatedTopics || []).filter(id=>id!==q.primaryTopic && id!==overrides[q.id])] : (q.relatedTopics?.length ? q.relatedTopics : (topic?[topic]:[]));
    return { ...q, status: overrides[q.id] ? "classified" as const : q.status, displayTopic: topic, relatedTopics:related, displayName: topics.find(t => t.id === topic)?.name ?? q.topicName ?? "Needs classification" };
  });
}

export function useCatalog(onCatalogError: (message: string) => void) {
  const [bundledCatalog, setBundledCatalog] = useState<Catalog>({ units: [], questions: [], sourcePages: 0, stats: {} });
  const [browserState] = useState(createBrowserState);
  const { progress, overrides, banks, sessions, questions: userQuestions } = useSyncExternalStore(browserState.subscribe, browserState.getSnapshot, browserState.getServerSnapshot);
  const catalog = useMemo(() => userQuestions.length
    ? { ...bundledCatalog, questions: [...bundledCatalog.questions, ...userQuestions] }
    : bundledCatalog, [bundledCatalog, userQuestions]);
  useEffect(() => {
    fetch("/student-questions.json").then(r => r.json()).then(data => setBundledCatalog(data as Catalog)).catch(() => onCatalogError("Question catalog could not be loaded."));
  }, [onCatalogError]);
  useEffect(() => { if (catalog.questions.length) localStorage.setItem(STORAGE_KEY, JSON.stringify({ progress, overrides, banks: banks.filter(b => b.id !== "mega"), questions: catalog.questions.filter(q => q.sourceBank), sessions } satisfies Saved)); }, [catalog.questions, progress, overrides, banks, sessions]);

  const topics = useMemo(() => catalog.units.flatMap(u => u.topics.map(([id, name]) => ({ id, name, unit: u.id, unitName: u.name }))), [catalog.units]);
  const questions = useMemo(() => deriveCatalogQuestions(catalog.questions, overrides, topics), [catalog.questions, overrides, topics]);
  return { catalog, topics, questions, browserState, progress, overrides, banks, sessions };
}
