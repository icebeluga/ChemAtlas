# ChemAtlas Question Image Review

## Local use

This is a development-only administrator tool because this checkout does not have an administrator authentication system. From the project root, run:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `/admin/question-review`. The page and every review API return 404 outside development mode. No navigation link is added to the student-facing shell.

## Review workflow

1. Filter or search the question queue and open a record.
2. Inspect every crop segment and its associated shared stimulus. The viewer renders the original source PDF with PDF.js at 2.25 source pixels per PDF point.
3. Select **Generate & save PNGs**. PNGs are written under `research/question-images/`; the review manifest links them to the source-region revision. **Generate next 25** processes the next eligible records sequentially, saves each completed record immediately, leaves all generated images `pending_review`, and can be paused and resumed by running it again.
4. Accept the shared stimulus separately. A linked MCQ cannot be accepted until all linked stimuli have saved images and accepted decisions.
5. Accept the question, or reject it with a reason and optional note. Decisions are written atomically to `research/question-image-review.json`.
6. For a correction, use **Edit crop**, drag the rectangle or edit its source-point coordinates, then save. Saving a crop clears the prior image paths and sets `corrected_pending_review`; regenerate and approve the new revision.

`question-image-review.json` is a version-controlled local manifest. **Export review backup** downloads a `.tar.gz` containing the manifest and generated PNGs. **Restore backup** merges it after confirmation; conflicting image bytes are refused instead of overwritten. PNGs live outside `public/` and are served only through development-only API routes so rejected/unapproved images are not added to student-facing static assets.

## Review state

The manifest starts with source-derived demonstration images marked `pending_review`; none are approved. Existing crop metadata and geometry validation do not imply human approval. A question becomes `pending_review` only after its PNG revision is saved, and becomes `accepted` only after the human decision is saved. Review history records decisions and crop revisions. The last selected question is kept in the browser for convenience; review decisions are stored in the local manifest, not only in browser storage.

## Keyboard shortcuts

`A` accepts, `R` opens rejection controls, Left/Right navigate, `Z`/`X` zoom, `E` toggles crop editing, and Escape closes the rejection/crop panel. Shortcuts are ignored while a text field or select control is active.

## API integration tests

The in-process Vite-middleware tests cover persistence, PNG retrieval, crop revision invalidation, rejection validation, shared-stimulus approval requirements, backup export/restore, multi-page FRQs, invalid PNG rejection, and production-mode route isolation. Each test uses temporary manifest and image paths:

```bash
pnpm test:question-review
```

The API is supplied by a Vite middleware configured for `serve`; it is not part of a production build. `CHEMATLAS_REVIEW_MANIFEST` and `CHEMATLAS_REVIEW_IMAGES` may be set to isolate a development review session.

## Current data integration

The current `public/questions.json` contains 1,542 questions: 1,266 MCQs and 276 FRQs. Every record has at least one `sourceRegions` entry and a `sourceAssets` reference. The catalog maps original pages to eight PDF segments under `public/source/`. `research/stimuli.json` contains six explicitly linked shared-stimulus groups. The dashboard renders source regions on demand and can batch-generate PNGs. The checked-in sample set contains five question records (including a two-page FRQ) and one linked shared stimulus; every sample remains `pending_review` and must be manually inspected.

## Limits

- There is no sign-in or administrator role in this app, so the dashboard is intentionally unavailable in public production mode. Do not relax that gate until server-side authentication and authorization are implemented.
- Crop edits are saved as review-manifest overrides; they do not rewrite the canonical `questions.json` source regions. A later catalog-maintenance step must deliberately promote accepted crop overrides.
- Shared stimuli use the six existing explicit catalog associations. Questions with no `stimulusIds` are not automatically assigned a context.
- This checkout has no configured object storage. Review PNGs and decisions persist in the local repository checkout and should be backed up/committed deliberately or exported with the dashboard backup. They are not synced to ChatGPT Sites or another workstation automatically.
