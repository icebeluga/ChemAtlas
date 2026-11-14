type Region = { page: number; rect: number[] };
type WorksheetQuestion = { sourceBank?: string; sourceRegions?: Region[]; stimulusIds?: string[] };
type Segment = { page: number; regions: Region[]; stimulusId?: string };

export function planWorksheet<Question extends WorksheetQuestion>(
  questions: Question[],
  stimuli: Record<string, { regions: Region[] }>,
  originalPagesFor: (question: Question) => number[],
): { question: Question; segments: Segment[] }[];
