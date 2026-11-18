export type StimulusDocument = {
  stimuli: Record<string, { regions: { page: number; rect: number[] }[] }>;
};

export type PdfSource = { url: string; httpHeaders?: Record<string, string>; withCredentials?: boolean };
