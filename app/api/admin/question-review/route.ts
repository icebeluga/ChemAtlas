/* eslint-disable @typescript-eslint/no-explicit-any -- Cloudflare bindings are injected dynamically and JSON records are validated at this API boundary. */
import { env } from "cloudflare:workers";
import { authenticateReviewRequest } from "@/lib/cloudflare-access.mjs";
import { createD1ReviewStore, createR2ImageStore } from "@/lib/question-review-storage.mjs";
import stimulusDocument from "../../../../research/stimuli.json";

export const runtime = "edge";

const statuses = new Set(["not_generated", "pending_review", "accepted", "rejected", "corrected_pending_review", "missing_source"]);
const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const canonicalStimulusIdsByQuestion: Record<string, string[]> = {};
for (const [stimulusId, stimulus] of Object.entries((stimulusDocument as any).stimuli || {}) as Array<[string, any]>) {
  for (const questionId of stimulus.questionIds || []) {
    const ids = canonicalStimulusIdsByQuestion[questionId] ||= [];
    if (!ids.includes(stimulusId)) ids.push(stimulusId);
  }
}
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
const cloudEnv = () => env as unknown as Record<string, any>;
const identity = async (request: Request) => authenticateReviewRequest(request, cloudEnv());

function stores() {
  const runtimeEnv = cloudEnv();
  if (!runtimeEnv.DB || !runtimeEnv.REVIEW_IMAGES) throw new Error("Persistent D1 and R2 bindings are not configured.");
  return { reviews: createD1ReviewStore(runtimeEnv.DB), images: createR2ImageStore(runtimeEnv.REVIEW_IMAGES) };
}

function validRegion(region: any) {
  return region && Number.isInteger(region.page) && region.page > 0 && Array.isArray(region.rect) && region.rect.length === 4 && region.rect.every(Number.isFinite) && region.rect[0] >= 0 && region.rect[1] >= 0 && region.rect[2] > region.rect[0] && region.rect[3] > region.rect[1] && region.rect[2] <= 1440 && region.rect[3] <= 2000;
}

function imageInput(path: string, ownerId: string, entityType: "question" | "stimulus", entityId: string) {
  const match = path.match(/^\/api\/admin\/question-review\/image\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)-segment-([1-9][0-9]*)\.png$/);
  const folder = entityType === "stimulus" ? `_stimulus-${entityId}` : entityId;
  if (!match || match[1] !== folder) return null;
  return { ownerId, entityType, entityId, revision: match[2], segment: Number(match[3]) - 1, filename: match[0].split("/").pop()! };
}

async function imagesCurrent(images: ReturnType<typeof createR2ImageStore>, ownerId: string, entityType: "question" | "stimulus", entityId: string, review: any, segmentCount?: number) {
  if (!Array.isArray(review?.imagePaths) || !review.imagePaths.length || typeof review.imageRevision !== "string") return false;
  if (segmentCount && review.imagePaths.length !== segmentCount) return false;
  for (const [index, path] of review.imagePaths.entries()) {
    const input = imageInput(path, ownerId, entityType, entityId);
    if (!input || input.revision !== review.imageRevision || input.segment !== index || !(await images.imageExists(input))) return false;
  }
  return true;
}

export async function GET(request: Request) {
  const auth = await identity(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  try {
    const { reviews, images } = stores();
    const manifest: any = await reviews.readManifest(auth.user.id);
    const stimuli: Record<string, any> = (stimulusDocument as any).stimuli || {};
    const approvedImages: Record<string, string[]> = {};
    for (const [questionId, review] of Object.entries(manifest.reviews) as Array<[string, any]>) {
      if (review.status !== "accepted" || !review.imageRevision || review.imageRevision !== review.sourceRegionsRevision || !(await imagesCurrent(images, auth.user.id, "question", questionId, review))) continue;
      const linked = canonicalStimulusIdsByQuestion[questionId] || [];
      let valid = true;
      const stimulusPaths: string[] = [];
      for (const id of linked) {
        const stimulusReview = manifest.stimuli[id];
        if (!stimuli[id] || !stimulusReview || stimulusReview.status !== "accepted" || stimulusReview.imageRevision !== stimulusReview.sourceRegionsRevision || !(await imagesCurrent(images, auth.user.id, "stimulus", id, stimulusReview))) { valid = false; break; }
        stimulusPaths.push(...stimulusReview.imagePaths);
      }
      if (valid) approvedImages[questionId] = [...stimulusPaths, ...review.imagePaths];
    }
    return json({ manifest, stimuli: stimulusDocument, approvedImages, storageMode: "cloudflare-d1-r2" });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Review storage is unavailable." }, 503); }
}

export async function POST(request: Request) {
  const auth = await identity(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let payload: any;
  try { payload = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const isStimulus = typeof payload?.stimulusId === "string" && !payload?.questionId;
  const entityId = isStimulus ? payload.stimulusId : payload?.questionId;
  if (typeof entityId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(entityId) || typeof payload.revision !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(payload.revision) || !Number.isInteger(payload.segment) || payload.segment < 0 || !/^data:image\/png;base64,/.test(payload.dataUrl || "")) return json({ error: "Image upload metadata is invalid." }, 400);
  const encoded = payload.dataUrl.slice("data:image/png;base64,".length);
  if (encoded.length > 34 * 1024 * 1024) return json({ error: "PNG exceeds the 25 MB per-segment limit." }, 413);
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)); } catch { return json({ error: "PNG payload is malformed." }, 400); }
  if (bytes.byteLength < 100 || bytes.byteLength > 25 * 1024 * 1024) return json({ error: "PNG must be between 100 bytes and 25 MB." }, 413);
  if (!pngSignature.every((value, index) => bytes[index] === value)) return json({ error: "Image data does not have a valid PNG signature." }, 400);
  try {
    const { reviews, images } = stores();
    const entityType = isStimulus ? "stimulus" : "question";
    const saved = await images.putImage({ ownerId: auth.user.id, entityType, entityId, revision: payload.revision, segment: payload.segment, bytes });
    await reviews.recordImage({ ownerId: auth.user.id, entityType, entityId, revision: payload.revision, segment: payload.segment, objectKey: saved.key, byteLength: saved.bytes, sha256: saved.sha256 });
    return json({ saved: true, path: saved.path, bytes: saved.bytes });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Image could not be saved." }, 409); }
}

export async function PUT(request: Request) {
  const auth = await identity(request);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  let payload: any;
  try { payload = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const isStimulus = typeof payload?.stimulusId === "string" && !payload?.questionId;
  const entityType = isStimulus ? "stimulus" : "question";
  const entityId = isStimulus ? payload.stimulusId : payload?.questionId;
  const review = payload?.review;
  if (typeof entityId !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(entityId) || !review || !statuses.has(review.status) || !Array.isArray(review.imagePaths) || !Array.isArray(review.rejectionReasons) || !Array.isArray(review.history) || typeof review.notes !== "string") return json({ error: "Review record is incomplete or invalid." }, 400);
  if (review.cropOverrides !== undefined && (!Array.isArray(review.cropOverrides) || review.cropOverrides.some((region: any) => !validRegion(region)))) return json({ error: "Crop override contains an invalid source-page rectangle." }, 400);
  if (review.status === "rejected" && !review.rejectionReasons.length) return json({ error: "A rejection reason is required." }, 400);
  const linkedStimuli = entityType === "question" ? canonicalStimulusIdsByQuestion[entityId] || [] : [];
  if (payload.stimulusIds !== undefined && (!Array.isArray(payload.stimulusIds) || JSON.stringify([...payload.stimulusIds].sort()) !== JSON.stringify([...linkedStimuli].sort()))) return json({ error: "Question-to-stimulus associations must match the source catalog." }, 400);
  try {
    const { reviews, images } = stores();
    const manifest = await reviews.readManifest(auth.user.id);
    const prior = (entityType === "question" ? manifest.reviews : manifest.stimuli)[entityId];
    if (review.status === "accepted" || review.status === "rejected") {
      if (!review.imageRevision || review.imageRevision !== review.sourceRegionsRevision || !(await imagesCurrent(images, auth.user.id, entityType, entityId, review, payload.segmentCount))) return json({ error: "Save every current PNG segment for this crop revision before review." }, 409);
    }
    if (review.status === "accepted" && entityType === "question") {
      for (const stimulusId of linkedStimuli) {
        const stimulusReview = manifest.stimuli[stimulusId];
        if (!stimulusReview || stimulusReview.status !== "accepted" || stimulusReview.imageRevision !== stimulusReview.sourceRegionsRevision || !(await imagesCurrent(images, auth.user.id, "stimulus", stimulusId, stimulusReview))) return json({ error: `Required shared stimulus ${stimulusId} is not accepted at its current revision.` }, 409);
      }
    }
    const changedRegions = prior && JSON.stringify(prior.cropOverrides || null) !== JSON.stringify(review.cropOverrides || null);
    if (changedRegions && prior.status === "accepted" && review.status === "accepted") return json({ error: "Crop changes clear prior approval. Save as corrected_pending_review and regenerate the image." }, 409);
    if (changedRegions && prior.status === "accepted") {
      review.status = "corrected_pending_review";
      review.reviewedAt = null;
      review.imageRevision = null;
      review.sourceRegionsRevision = null;
      review.imagePaths = [];
    }
    const invalidatedQuestions: string[] = [];
    const invalidatedReviews: Record<string, any> = {};
    const now = new Date().toISOString();
    if (entityType === "stimulus") {
      manifest.stimuli[entityId] = review;
      if (review.status !== "accepted") {
        const acceptedQuestions = (Object.entries(manifest.reviews) as Array<[string, any]>).filter(([, saved]) => saved.status === "accepted");
        for (const [questionId, saved] of acceptedQuestions) {
          const links = await reviews.getStimulusLinks(auth.user.id, questionId);
          if (!links.includes(entityId)) continue;
          const next = { ...saved, status: "corrected_pending_review", reviewedAt: null, history: [...saved.history, { revision: saved.history.length + 1, at: now, status: "corrected_pending_review", regions: saved.cropOverrides || [], note: `Approval cleared because required shared stimulus ${entityId} is no longer accepted.` }] };
          manifest.reviews[questionId] = next;
          invalidatedQuestions.push(questionId);
          invalidatedReviews[questionId] = next;
        }
      }
    } else manifest.reviews[entityId] = review;
    const cropRevision = Array.isArray(review.cropOverrides) ? { revision: review.sourceRegionsRevision || review.imageRevision || `crop-${review.history.length}`, regions: review.cropOverrides, notes: review.correctionNote || "" } : undefined;
    const updatedAt = await reviews.saveRecord({ ownerId: auth.user.id, entityType, entityId, review, cropRevision, linkedStimuli });
    for (const questionId of invalidatedQuestions) await reviews.saveRecord({ ownerId: auth.user.id, entityType: "question", entityId: questionId, review: invalidatedReviews[questionId] });
    manifest.updatedAt = updatedAt;
    return json({ saved: true, updatedAt, invalidatedQuestions, invalidatedReviews });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Review record could not be saved." }, 503); }
}
