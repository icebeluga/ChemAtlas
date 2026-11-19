// The historical Worker keeps its original data and asset delivery path.
// The Pages build aliases #student-content to content-supabase.ts instead.
import stimuli from "../research/stimuli.json";
import type { StimulusDocument } from "./content-types";

export const sitePath = (path = "") => `/${path.replace(/^\//, "")}`;
export const pdfWorkerUrl = () => "/pdf.worker.min.mjs";
export const getStimuli = (): StimulusDocument => stimuli;
export const contentResponse = (path: string, signal?: AbortSignal) => fetch(path, { signal });
export const pdfSource = async (path: string) => ({ url: path });
