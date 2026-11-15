# Codex handoff: Phase A of the ChemAtlas student UI redesign

You are implementing Phase A only. Read this file fully before touching anything. It is self-contained for the work; the other documents in this folder are the authority behind it:

| File | Use it for |
|---|---|
| `01-existing-system.md` | Where things are in today's code (`path:line`) |
| `02-architecture.md` | What is being built and why (sections 5, 7, 8, 10 matter most here) |
| `04-component-migration-matrix.md` | The fate of every existing control |
| `05-test-and-acceptance-plan.md` | Test IDs and acceptance evidence |
| `06-o1-o6-investigation.md` | Hunk-by-hunk analysis of `fix/local-workers-runtime` and of the dev config's isolation |
| `PROGRESS.md` | Decision log, including the owner's approvals |

Where this file and `SESSION-3-HANDOFF.md` differ, **this file wins** (the owner narrowed Phase A on 2026-11-15).

## 0. Owner approvals this work rests on

- Base: `origin/main` @ `4f965e32ffaa3b6bce8ab6f99b22fe42643fce16`.
- O1: port the viewer improvements from `eba3977`; exclude the authentication change, the Worker dependency changes and the detail-page layout; leave `fix/local-workers-runtime` unchanged; defer the verified-crop default (O8); do the viewer work separately from structural refactoring.
- O6: a dedicated `vite.ui.config.ts` for local UI development only, with a tested build-refusing safeguard and proof that production builds and releases cannot select it.
- Fonts under `public/fonts/` are **deferred** until release-input impact and licensing are checked.
- No push, merge or deployment is authorized.

## 1. Workspace

- Repository worktree: `../ChemAtlas-redesign` (sibling of the main checkout), branch `feature/student-ui-redesign`.
- The branch is **local only**; it has never been pushed. If you are not running on the machine that holds this worktree, stop and tell the owner; do not push it yourself.
- Starting commit: the tip of `feature/student-ui-redesign` when you begin (record its full SHA first; it should contain only `design-previews/` and `docs/student-ui-redesign/` on top of the base). Confirm:

```
git rev-parse HEAD
git diff --stat 4f965e32ffaa3b6bce8ab6f99b22fe42643fce16 HEAD -- . ':!design-previews' ':!docs/student-ui-redesign'
```

The second command must print nothing.

- Other worktrees and branches exist (`audit/source-security-catalog-integrity`, `feature/question-image-extraction`, `fix/local-workers-runtime`, and others). Do not check them out, modify them, or commit to them.

## 2. Prohibited changes (all of Phase A)

Do not:

1. Push, fetch-and-merge, merge, rebase, reset, amend, force anything, or open a pull request.
2. Deploy, or run Wrangler against any remote.
3. Change `package.json`, `pnpm-lock.yaml`, or add, remove or upgrade any dependency.
4. Edit any of: `worker/**`, `lib/student-access.mjs`, `lib/cloudflare-access.mjs`, `wrangler*.jsonc`, `.github/**`, `scripts/release/**`, `scripts/assert-student-private-config.mjs`, `vite.config.ts`.
5. Edit any of: `public/**` (data, PDFs, and no new files there either), `research/**`, `app/admin/**`, `app/api/**`, `db/**`, `drizzle/**`, `lib/question-review-*`, review tests.
6. Edit `app/globals.css` (it is shared with the private review dashboard), `lib/worksheet.ts`, `lib/worksheet-pdf.ts`, `lib/worksheet-content.ts`, `lib/worksheet-render.ts`, or `app/navigation.mjs`.
7. Merge or cherry-pick `b5ceab5` or `eba3977`, or copy any change to `worker/index.ts`, `vite.config.ts`, `package.json` or the lockfile from that branch. In particular, never introduce `import.meta.env.DEV` (or any other condition) around `authenticateStudentRequest`.
8. Import `research/crop-visual-review.json`, or add any "verified crop" logic (`verifiedCropReviews`, `cropIsVerified`, `stimulusIsVerified`). Owner decision O8 is open.
9. Change what the user sees in A1. Change what the user sees in A2 anywhere except the question detail view's source viewer.
10. Add web fonts, a token stylesheet, the new Question Bank or Practice Builder UI, URL changes, or new storage keys. Those are later phases.
11. Use `--no-verify` or skip hooks. Delete files other than code you have moved.
12. Weaken, skip or edit an existing test to make it pass.

If a step seems to need one of these, stop and report instead.

## 3. Setup and baseline

```
corepack enable
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run build
pnpm run check:private
```

Save the output. This is the baseline; if anything fails on the untouched branch, stop and report. `pnpm install --frozen-lockfile` must not change the lockfile (`git status` clean afterwards).

Release smoke: read `scripts/release/validate.sh` and `scripts/release/smoke.cjs` first. If your environment can run `bash scripts/release/validate.sh`, run it now and keep the output as the smoke baseline. If it cannot (missing browser, Miniflare, or Python), say so in the report; do not claim the smoke test passed.

The documented dev server runs the Worker, which answers 503 without Cloudflare Access settings. That is correct behaviour; do not change it. Local viewing uses the config from A3.

### Recommended execution order

**A3 first, then A1, then A2.** A3 is tiny and independent, and it gives you the local dev server you need for the manual checks in A1 and A2. The labels below keep the owner's numbering.

## 4. A1 — Structural refactoring (no intended behavioural or visual change)

Goal: move code into the modules the redesign will build on. Rendered output, storage contents and network requests must be identical before and after.

Line numbers are for `4f965e3`. Confirm each before editing.

### A1.1 `lib/question-filter.ts` (new)

Today the "matches unit/topic/type/search" rule exists three times:

| Copy | Location |
|---|---|
| Question Bank list | `components/student-app.tsx` L320–326 (`filteredQuestions`) |
| Practice session pool | `components/student-app.tsx` L341–352 (inside `startSession`) |
| Builder picker | `components/practice-builder.tsx` L96–108 (`candidates`) |

Create one pure function and call it from all three. Keep each caller's exact semantics: the three copies differ in which statuses they allow, which fields they search, and which extra filters they apply (the builder adds year, source, print and history filters; the session pool has a `focus` argument). Model those as parameters or compose them at the call site; do not unify behaviour.

Invariant to keep: unit and topic match **any** entry of `relatedTopics`, and a topic's unit comes from the topic list, never from `question.primaryUnit`.

Tests, new file `tests/question-filter.test.mjs`:
- Before changing the callers, capture the ids each original predicate returns for a fixed table of filter combinations against `public/student-questions.json` (at least: no filter; each unit; three topics including one whose questions span units; MCQ; FRQ; two search strings; one empty result). Commit these as fixtures. After the change the function must return the same ids in the same order.
- Any-related rule: a question whose `relatedTopics` include the topic but whose `primaryTopic` differs is returned.
- A record whose `primaryUnit` disagrees with its topic's unit is still returned under the topic's unit.

How to import TypeScript from a `node --test` file: `tests/stage3-worksheet.test.mjs` L1–20 already loads `lib/worksheet.ts` and `lib/worksheet-pdf.ts`. Reuse that mechanism. If it cannot be reused, write the pure module as `.mjs` with a `.d.mts` types file, the way `lib/worksheet.mjs` / `lib/worksheet.d.mts` and `lib/progress-transfer.mjs` do.

### A1.2 `components/student/hooks/use-catalog.ts` (new)

Move, unchanged in behaviour:
- the catalog fetch and saved-state merge effect, `components/student-app.tsx` L236–249 (fetches `/student-questions.json`; reads `localStorage["apchem-studio-v2"]` and the legacy `"apchem-studio-v1"`);
- the persistence effect at L250;
- the `topics` and `questions` memos at L282–287 (these apply user topic overrides and include user-bank questions).

The hook returns whatever `ChemAtlas` needs to keep working exactly as now (catalog, topics, questions, and the state setters other code uses). Do not rename storage keys or change value shapes. Do not add counts or new derived data in this phase.

Tests, new file `tests/catalog-derivation.test.mjs`, for the pure derivation (extract it as a function the hook calls):
- against the real `public/student-questions.json`: 735 classified questions; 366 of them with more than one related topic; 210 whose related topics span more than one unit;
- a topic override moves a question to the overridden topic and marks it classified, as the current memo does.

### A1.3 `components/student/hooks/use-worksheets.ts` (new)

Move, unchanged in behaviour, from `components/student-app.tsx`:
- `BANK_WORKSHEET_KEY` (L50) and the load / validate / legacy-migration effect (L153–176), which reads `worksheetStorageKey` (`"chematlas-worksheets-v1"`, from `lib/worksheet.ts` L80) and the legacy id-array key `"chematlas-student-worksheet-v1"`;
- `saveWorksheets` (L177–181);
- `activeDraft` and `worksheetIds` (L182–183).

The hook returns `{ backup, save, activeDraft, worksheetIds }` (names may differ; behaviour may not). `saveWorksheets` currently reports a save failure through `setNotice`; keep that message and path, for example by passing an `onSaveError` callback.

**This is a pure lift.** Do not add a `storage` event listener, a recovery key, new statuses or new mutations. Those are designed in `02-architecture.md` section 5 for a later phase.

Also extract the two pure draft transforms that are inline in `components/practice-builder.tsx` into a new file `lib/worksheet-edits.ts` (not into `lib/worksheet.ts`), and call them from the builder:
- `moveEntry(draft, from, to)` from `move` (L133–139);
- `replaceEntry(draft, oldId, newId)` from the replacement branch of `add` (L122–127).

The builder keeps its own UI state (`undo`, `replacement`, `step`, `notice`) and its `update`, `open`, `add`, `changeFormat` functions; only the pure parts move.

Tests, new file `tests/worksheet-state.test.mjs`:
- `moveEntry`: no-op for equal or out-of-range indices; correct order otherwise; input not mutated.
- `replaceEntry`: id replaced in place, `lines` cleared, other entries untouched.
- Load logic (extract the body of the load effect as a pure function taking the two stored strings and returning `{ backup, writes, removals }`): valid backup is returned as stored; missing or invalid data yields one fresh draft; a legacy id array is migrated into a new draft named "Imported Question Bank selection" when a valid backup exists and there is room, otherwise into the active draft; the legacy key is removed only when every id was migrated; ids longer than 200 characters or non-strings are dropped. These assertions describe **current** behaviour: derive them from the code, not from this list, if they disagree.
- Round trip: a realistic backup with three drafts, mixed formats, `breakBefore` and `lines` set, survives parse → save byte-identical.

### A1.4 `components/student/hooks/use-export-data.ts` (new)

Move the effect at `components/practice-builder.tsx` L48–60 that loads `/worksheet-sources.json` and `/worksheet-content.json`, unchanged, **including** its current failure handling (registry failure falls back to `emptyRegistry` silently; content failure sets the error message). Changing that is a later phase.

### A1.5 `components/student/pdf-question-page.tsx` and `components/student/pdf-bank-store.ts` (moved)

Move out of `components/student-app.tsx`, with no edits beyond imports and exports:
- to `pdf-bank-store.ts`: `DB_NAME` (L51), `STORE` (L52), `openDb` (L54), `savePdf` (L62), `readPdf` (L69);
- to `pdf-question-page.tsx`: `PdfQuestionPage` (L77 to the end of the component, about L134) and anything only it uses.

`ChemAtlas` imports them back. `savePdf` is still used by `importPdf` in `ChemAtlas`.

### A1 commits

One commit per sub-step A1.1–A1.5, each leaving the tree passing. Suggested messages: "Extract question filter into lib/question-filter", "Lift catalog loading into useCatalog", and so on. Each message says "No behaviour change."

### A1 acceptance

| # | Criterion | Evidence |
|---|---|---|
| 1 | `pnpm run check`, `pnpm test`, `pnpm run build`, `pnpm run check:private` pass after every commit | Command output |
| 2 | New tests pass: filter equivalence, catalog counts, worksheet load and edits | `pnpm test` output naming the new files |
| 3 | Release smoke passes with `scripts/release/smoke.cjs` **unmodified** | `validate.sh` output, or "not run" with the reason |
| 4 | No visible change: for the URLs `/`, `/?view=unit&unit=u1`, `/?view=library`, `/?view=library&unit=u3&topic=3.4`, `/?view=detail&question=mcq-2008-1-29`, `/?view=builder`, `/?view=progress`, `/practice-builder`, the rendered DOM (after load, with canvases excluded) is identical before and after | A before/after dump using the A3 dev server and a headless browser if available; otherwise a manual side-by-side at 1440 and 390 px, stated as manual |
| 5 | Storage untouched: with a pre-existing `chematlas-worksheets-v1` value containing two drafts, loading the app and adding one question changes only that draft's `entries`; `apchem-studio-v2` keeps its shape | Manual check in the dev server, values pasted in the report |
| 6 | Same network requests on load as before (same URLs, same count) for `/` and `/practice-builder` | Network panel or headless log |
| 7 | Protected paths untouched | `git diff --stat <start> HEAD -- public research worker wrangler.student.jsonc wrangler.private-review.jsonc app/admin app/api db drizzle .github scripts package.json pnpm-lock.yaml vite.config.ts app/globals.css lib/worksheet.ts lib/worksheet-pdf.ts app/navigation.mjs` prints nothing |
| 8 | `components/student-app.tsx` and `components/practice-builder.tsx` contain no remaining copy of the moved code | `git grep` for `indexedDB.open`, `BANK_WORKSHEET_KEY`, the fetch of `/student-questions.json` |

## 5. A2 — Hand-port the viewer improvements from `eba3977`

Do this only after A1 is complete and accepted by its criteria. Separate commits from A1.

Source: commit `eba3977` on the local branch `fix/local-workers-runtime` ("Redesign the question-detail page around the source viewer"). Read it with `git show eba3977 -- components/student-app.tsx app/globals.css` and `git show fix/local-workers-runtime:components/student-app.tsx`. **Read only.** `06-o1-o6-investigation.md` section O1 assigns every hunk to a category; port category (a) only.

### What to port (into `components/student/pdf-question-page.tsx` and the detail view)

| Improvement | Notes |
|---|---|
| Zoom state and controls: zoom in/out, fit width, fit page, 1:1, reset | Controlled from the caller through props; callers that pass no zoom keep today's scaling path |
| Fullscreen via `requestFullscreen` | Attach to the existing detail image panel; do not introduce the branch's `.detail-viewer` layout wrapper beyond what fullscreen needs |
| Ref-counted PDF document cache | Shared by every `PdfQuestionPage` user |
| Render cancelling and the 16-megapixel render cap | |
| Refit on container resize | |
| "Loading question…" state instead of a "not found" flash; canvas hidden until drawn | The investigation flags these as fixes a redesign must not lose |
| Shared-stimulus stacking in the crop view | Only the stacking; not the verified-crop default |
| Toolbar accessibility: `aria-pressed`, toolbar and group roles, `aria-live` scale readout, focus-visible styles | |
| Highlight box scaling with zoom | |

Implementation rules:
- Port by hand. Do not cherry-pick; the commit mixes viewer and layout.
- Use the existing `sourcePageLocation` in `lib/question-source.ts` (L12). Do not port the branch's `segmentSource`.
- `onScale` is an effect dependency on the branch: make it a stable callback (`useCallback`) at the call site.
- CSS: put the `.viewer-*` rules (about 42 lines on the branch) in `app/student-workspace.css`, not `app/globals.css`. The branch's rules use `--dv-*` custom properties declared on `.detail-page`; declare the ones the viewer needs on the viewer's own root instead.
- Extract the arithmetic as pure functions so it can be tested: zoom clamp and step, fit-width scale, fit-page scale, and the megapixel cap.

### What not to port

- The two-column detail layout, classification sidebar, detail header and navigation rules (category (d): `components/student-app.tsx` on the branch around L316, L516–518, L633, L652–657, L665–696, L726–758, and about 77 lines of CSS).
- `verifiedCropReviews`, `cropIsVerified`, `stimulusIsVerified`, the import of `research/crop-visual-review.json`, and the "crop only when verified, otherwise full page scrolled to the question" default. `openQuestion` keeps today's default image mode.
- Ink-margin trimming below 600 px, unless it is purely inside the viewer and independent of the excluded layout; if in doubt, leave it out and list it in the report.
- Anything from `b5ceab5`.

### A2 tests and regression checks

New file `tests/viewer-scale.test.mjs` for the pure functions: clamp bounds; fit-width and fit-page for portrait and landscape pages; the cap reduces scale so that width × height × dpr² ≤ 16,000,000; 1:1 returns scale 1.

Regression, in the A3 dev server, at 1440 and 390 px, each stated as done or not done:

| Screen | Check |
|---|---|
| Question detail (`/?view=detail&question=mcq-2008-1-29` and one multi-page FRQ) | Page draws; Full page and Question crop modes work; zoom in/out, fit width, fit page, 1:1, fullscreen enter and exit; highlights line up at 100% and 200%; page tabs switch; keyboard reaches every toolbar control with a visible focus ring |
| Practice session (`/?view=builder` → start a set) | Source page draws exactly as before; no toolbar appears |
| Session print view (Worksheet button in a session) | Pages draw; print check still blocks while pages are loading |
| Source page audit (`/?view=audit`) | Page draws; previous/next work |
| Practice Builder source preview (`/practice-builder` → Preview on a row) | Region draws |
| User-added PDF bank (Manage test banks → add a PDF → add a reference → open it) | Draws from IndexedDB |
| Rapid previous/next through ten questions | No stale page shown, no console errors, memory does not climb without bound |
| Reduced motion and resize | No layout jump; refit on resize |

Release smoke must still pass unmodified: it requires a `canvas` wider than 200 px at `?view=detail&question=mcq-2008-1-29`.

### A2 commits

1. "Add viewer scale helpers with tests" (pure functions and tests).
2. "Port PDF viewer improvements from eba3977" (component, toolbar, CSS), crediting the original commit and author in the message body.

### A2 acceptance

| # | Criterion | Evidence |
|---|---|---|
| 1 | All four commands pass; new tests pass | Command output |
| 2 | Every row of the regression table is checked | Table in the report with done / not done and notes |
| 3 | Only the detail view's viewer looks different; the other four viewer users look as before | Before/after screenshots or DOM comparison for those four |
| 4 | Release smoke passes unmodified | Output, or "not run" with reason |
| 5 | No verified-crop logic, no research import beyond what the base already has | `git grep -n "crop-visual-review\|verifiedCropReviews\|cropIsVerified\|stimulusIsVerified" -- components lib app` prints nothing |
| 6 | Files changed are limited to `components/student/pdf-question-page.tsx`, `components/student-app.tsx` (detail view toolbar wiring only), `app/student-workspace.css`, a new helper module, and tests | `git diff --stat <A1 end> HEAD` |
| 7 | `fix/local-workers-runtime` is unchanged | `git rev-parse fix/local-workers-runtime` equals `eba3977b3715a8338cf7f71eec4597b896e9efee` |

## 6. A3 — Isolated local UI development configuration

One new file at the repository root, plus one test. Nothing else changes.

### `vite.ui.config.ts`

```ts
// Local UI development only.
// Serves the student app with vinext alone: there is no Cloudflare plugin and no Worker,
// so the Cloudflare Access check in worker/index.ts is simply not in the request path.
// It is not a way to test authentication, headers or the /admin 404s.
// It cannot build: production always builds from vite.config.ts (`pnpm run build`).
// Keep `appDir` in step with vite.config.ts.
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  if (command === "build") {
    throw new Error("vite.ui.config.ts is for local UI development only and cannot build. Use `pnpm run build`.");
  }
  return { plugins: [vinext({ appDir: "student" })] };
});
```

Run it with:

```
pnpm exec vite dev --config vite.ui.config.ts --host 127.0.0.1
```

Do not add a `package.json` script. Do not bind to anything but 127.0.0.1. Do not add environment variables, Access settings or any authentication code.

If vinext requires something this file does not give it, stop and report; do not copy settings from `fix/local-workers-runtime`.

### Test: `tests/ui-dev-config-isolation.test.mjs` (new)

A static test, so the isolation is checked on every `pnpm test`:
- `vite.ui.config.ts` contains the `command === "build"` guard and a `throw`;
- it does not import or mention `@cloudflare/vite-plugin`, `wrangler`, `student-access` or `cloudflare-access`;
- no file under `.github/`, `scripts/` or `package.json` contains the string `vite.ui.config`;
- `package.json` `scripts.build` is exactly `vite build` (no `--config`).

### A3 verification

| # | Check | Evidence |
|---|---|---|
| 1 | The dev server starts and `http://127.0.0.1:<port>/` serves the app; `/student-questions.json` returns 200; `/practice-builder` loads | Server log and a request log |
| 2 | **The build guard works**: `pnpm exec vite build --config vite.ui.config.ts` exits non-zero with the message above and writes nothing | Exit code, output, and `git status --short` plus a listing showing `dist/` did not appear or change (remove any existing `dist/` first by running the check before `pnpm run build`, or compare timestamps) |
| 3 | Production build is unaffected: `pnpm run build` succeeds, `dist/server/wrangler.json` exists, `pnpm run check:private` passes | Output |
| 4 | Nothing selects the file: `git grep -n "vite.ui.config" -- . ':!docs' ':!vite.ui.config.ts' ':!tests/ui-dev-config-isolation.test.mjs'` prints nothing; `git grep -nE -- "--config" -- package.json scripts .github` shows only Wrangler invocations pointing at `dist/server/wrangler*.json` | Output |
| 5 | Vite's own default lookup cannot find it: only `vite.config.{js,mjs,ts,cjs,mts,cts}` are auto-discovered | Stated with the Vite version from `node_modules/vite/package.json` |
| 6 | `pnpm run check` and `pnpm run lint` pass with the new file | Output (lint is not part of CI; run it anyway) |
| 7 | Authentication and Cloudflare configuration untouched | `git diff --stat <start> HEAD -- worker lib/student-access.mjs lib/cloudflare-access.mjs wrangler.student.jsonc wrangler.private-review.jsonc .github` prints nothing |
| 8 | The Worker dev path still fails closed | `pnpm run dev` still answers 503 "Private student access is not configured." (or state that the Worker dev runtime does not start on this machine, which is the known Windows issue; do not fix it) |

Commit: "Add UI-only Vite dev config with a build guard".

## 7. Rollback

Nothing in Phase A changes stored data, URLs, dependencies or configuration used by production, so rollback is purely a matter of commits on a local, unpushed branch.

- Before each sub-phase, record the current full SHA (`git rev-parse HEAD`) in your report: `START`, `A3_END`, `A1_END`, `A2_END`.
- To undo one step, use `git revert <sha>` for its commits, newest first. Do not reset, amend or rebase.
- To undo a whole sub-phase, revert its commits in reverse order back to the recorded SHA, then re-run the four commands.
- A2 is independent of A3 and depends on A1.5 only (the moved component). A1.1–A1.4 can each be reverted alone. A3 can be reverted alone; doing so removes the local dev server but affects nothing else.
- If a revert conflicts, stop and report.
- User data: none migrated. A browser that ran a Phase A build needs no cleanup after rollback.

## 8. Final report (required)

1. Branch, `START` and final full SHAs, and `git log --oneline START..HEAD`.
2. `git status --short` (must be clean) and confirmation that nothing was pushed (`git ls-remote origin refs/heads/feature/student-ui-redesign` prints nothing).
3. For A1, A2 and A3: each acceptance or verification row with its evidence, or "not verified" and why. A passing build or type check does not count as evidence for behaviour.
4. Output of the four commands at the end, and of the smoke run if it could be run.
5. Files added and files changed, by sub-phase.
6. Anything in this handoff or the architecture that turned out to be wrong, with `path:line`.
7. Anything you chose not to port in A2, and why.
8. Open questions for the owner.

Then stop. Phase B is not authorized.
