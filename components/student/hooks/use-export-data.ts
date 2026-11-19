"use client";

import { useEffect, useState } from "react";
import type { Registry } from "@/lib/worksheet";
import type { WorksheetContent } from "@/lib/worksheet-content";

const emptyRegistry: Registry = { questions: {}, references: [], answerKeyPage: 0 };

export function useExportData() {
  const [registry, setRegistry] = useState<Registry>();
  const [content, setContent] = useState<WorksheetContent>();
  const [contentError, setContentError] = useState("");

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
  return { registry, content, contentError };
}
