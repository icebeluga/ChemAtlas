export type ReviewEntityType = "question" | "stimulus";
export function sha256Hex(bytes: Uint8Array): Promise<string>;
export function createFileReviewStore(options: { manifestPath: string; imageRoot: string }): any;
export function createD1ReviewStore(db: D1Database): {
  readManifest(ownerId: string): Promise<any>;
  saveRecord(input: { ownerId: string; entityType: ReviewEntityType; entityId: string; review: any; cropRevision?: { revision: string; regions: any[]; notes?: string }; linkedStimuli?: string[] }): Promise<string>;
  recordImage(input: { ownerId: string; entityType: ReviewEntityType; entityId: string; revision: string; segment: number; objectKey: string; byteLength: number; sha256: string }): Promise<any>;
  getStimulusLinks(ownerId: string, questionId: string): Promise<string[]>;
  listStimulusLinks(ownerId: string): Promise<Array<{ questionId: string; stimulusId: string }>>;
  saveManifest(ownerId: string, manifest: any): Promise<any>;
};
export function createR2ImageStore(bucket: R2Bucket): any;
export function reviewImageUrl(entityType: ReviewEntityType, entityId: string, filename: string): string;
export const encoder: TextEncoder;
