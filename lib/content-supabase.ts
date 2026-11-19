import { createClient, type Session } from "@supabase/supabase-js";
import { validateSupabaseConfig, protectedObjectPath } from "./supabase-config.mjs";
import type { PdfSource, StimulusDocument } from "./content-types";
import { clearContent } from "./content-lifecycle";

const config = validateSupabaseConfig(import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, import.meta.env.VITE_CHEMATLAS_CONTENT_PREFIX);
export const passwordSetupRequested = /(?:^|[&#])type=(?:invite|recovery)(?:&|$)/.test(location.hash);
export const supabase = createClient(config.url, config.key, {
  auth: { storageKey: "chematlas-supabase-auth-v1", persistSession: true, autoRefreshToken: true,
    detectSessionInUrl: true, flowType: "implicit" },
});
let authorizedUser: string | undefined;
let stimuli: StimulusDocument | undefined;
let lifetime = new AbortController();
export function resetAuthorization() {
  authorizedUser = undefined;
  stimuli = undefined;
  lifetime.abort();
  lifetime = new AbortController();
  clearContent();
}
export function authorizeSession(session: Session) { authorizedUser = session.user.id; }
export function setStimuli(value: StimulusDocument) { stimuli = value; }
export function getStimuli(): StimulusDocument {
  if (!authorizedUser || !stimuli) throw new Error("Sign in with an approved account to load content.");
  return stimuli;
}
export const sitePath = (path = "") => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}${path === "practice-builder" ? "/" : ""}`;
export const pdfWorkerUrl = () => `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

export async function isApproved(session: Session, signal?: AbortSignal) {
  // This is a presentation check. Storage RLS independently checks the current row.
  const query = supabase.from("approved_users").select("user_id").eq("user_id", session.user.id).is("revoked_at", null);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  if (error) throw error;
  return !!data;
}
export async function pdfSource(path: string): Promise<PdfSource> {
  const object = protectedObjectPath(path, config.prefix);
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session || session.user.id !== authorizedUser) throw new Error("Sign in with an approved account to load content.");
  return {
    url: `${config.url}/storage/v1/object/authenticated/chematlas-content/${object}`,
    httpHeaders: { Authorization: `Bearer ${session.access_token}`, apikey: config.key, "Cache-Control": "no-cache" },
    withCredentials: false,
  };
}
export async function contentResponse(path: string, signal?: AbortSignal) {
  const generation = lifetime.signal;
  const source = await pdfSource(path);
  generation.throwIfAborted();
  const response = await fetch(source.url, { headers: source.httpHeaders, cache: "no-store",
    signal: signal ? AbortSignal.any([signal, generation]) : generation });
  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) window.dispatchEvent(new Event("chematlas:access-denied"));
    throw new Error("Protected content is unavailable. Check your access or contact the owner.");
  }
  return response;
}
