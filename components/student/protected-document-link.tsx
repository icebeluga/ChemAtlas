"use client";

import { useState, type ReactNode } from "react";
import { contentResponse } from "#student-content";
import { onContentClear } from "@/lib/content-lifecycle";

export function ProtectedDocumentLink({ path, children }: { path: string; children: ReactNode }) {
  const [error, setError] = useState("");
  return <><a href={path} target="_blank" rel="noreferrer" onClick={async event => {
    event.preventDefault();
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const response = await contentResponse(path);
      if (!response.ok) throw new Error("Document unavailable");
      const url = URL.createObjectURL(await response.blob());
      const unregister = onContentClear(() => { URL.revokeObjectURL(url); popup?.close(); unregister(); });
      if (popup) popup.location.replace(url);
      else { URL.revokeObjectURL(url); unregister(); throw new Error("Allow popups to open this document."); }
      setError("");
    } catch (caught) {
      popup?.close();
      setError(caught instanceof Error ? caught.message : "Document unavailable");
    }
  }}>{children}</a>{error && <span role="alert"> {error}</span>}</>;
}
