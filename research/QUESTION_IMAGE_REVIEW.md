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
3. Select **Generate & save PNGs**. PNGs are written under `research/question-images/`; the review manifest links them to the source-region revision.
4. Accept the shared stimulus separately. A linked MCQ cannot be accepted until all linked stimuli have saved images and accepted decisions.
5. Accept the question, or reject it with a reason and optional note. Decisions are written atomically to `research/question-image-review.json`.
6. For a correction, use **Edit crop**, drag the rectangle or edit its source-point coordinates, then save. Saving a crop clears the prior image paths and sets `corrected_pending_review`; regenerate and approve the new revision.

`question-image-review.json` is a version-controlled local manifest. Use **Export review data** to save a portable copy before switching checkouts. PNGs live outside `public/` and are served only through development-only API routes so rejected/unapproved images are not added to student-facing static assets.

## Review state

The initial manifest is empty. Existing crop metadata and geometry validation do not imply human approval. A question becomes `pending_review` only after its PNG revision is saved, and becomes `accepted` only after the human decision is saved. Review history records decisions and crop revisions. The last selected question and auto-advance preference are kept in the browser for convenience; approval data is not stored only in browser storage.

## Keyboard shortcuts

`A` accepts, `R` opens rejection controls, Left/Right navigate, `Z`/`X` zoom, `E` toggles crop editing, and Escape closes the rejection/crop panel. Shortcuts are ignored while a text field or select control is active.

## API integration test

The black-box test suite exercises persistence, PNG retrieval, approval invalidation after regeneration, rejection validation, and the shared-stimulus approval gate. To keep test records and image files isolated from the working review manifest, start the dev server with temporary storage roots:

```bash
CHEMATLAS_REVIEW_MANIFEST=/tmp/chematlas-review-test.json \
CHEMATLAS_REVIEW_IMAGES=/tmp/chematlas-review-test-images \
pnpm dev --host 127.0.0.1 --port 42529
```

In another terminal, run:

```bash
QUESTION_REVIEW_TEST_URL=http://127.0.0.1:42529 pnpm test:question-review
```

The review API is provided by a Vite development middleware so it can write to local files. It is not installed in production builds. `CHEMATLAS_REVIEW_MANIFEST` and `CHEMATLAS_REVIEW_IMAGES` are optional local paths that can also be used to isolate a review session.

## Current data integration

The current `public/questions.json` contains 1,542 questions: 1,266 MCQs and 276 FRQs. Every record has at least one `sourceRegions` entry and a `sourceAssets` reference. The catalog maps original pages to eight PDF segments under `public/source/`. `research/stimuli.json` contains six explicitly linked shared-stimulus groups. The dashboard renders these sources on demand; it does not pre-generate thousands of image files. Saved PNGs are created for records as they are reviewed.

## Limits

- There is no sign-in or administrator role in this app, so the dashboard is intentionally unavailable in public production mode. Do not relax that gate until server-side authentication and authorization are implemented.
- Crop edits are saved as review-manifest overrides; they do not rewrite the canonical `questions.json` source regions. A later catalog-maintenance step must deliberately promote accepted crop overrides.
- Shared stimuli use the six existing explicit catalog associations. Questions with no `stimulusIds` are not automatically assigned a context.
- This checkout has no configured object storage. Review PNGs and decisions persist in the local repository checkout and should be backed up/committed deliberately. They are not synced to ChatGPT Sites or another workstation automatically.
