# O1 and O6 investigation (read-only)

Scope: owner decisions O1 (`fix/local-workers-runtime`) and O6 (a UI-only Vite config). Read-only: nothing was built, installed, run, merged or checked out. Written by a Sonnet 5.5 subagent.

## Conventions and evidence rules

- Base is `4f965e3` (production code on `main`). The branch tip is `eba3977`; `b5ceab5` is its parent; merge-base with `4f965e3` is `4f965e3`. Verified with `git rev-parse` and `git merge-base`.
- Branch-side line numbers are from `git show fix/local-workers-runtime:<path>` (tip `eba3977`). Base-side line numbers are from `4f965e3:<path>`. The redesign worktree `d7a6aca` has the same production files as `4f965e3` (`git diff --stat 4f965e3 HEAD -- scripts .github worker lib vite.config.ts package.json tsconfig.json eslint.config.mjs .gitignore wrangler.student.jsonc` printed nothing).
- Hunks are counted with `git diff -U0` (the smallest units). At default context the TSX file has 9 hunks.
- The redesign worktree has no `node_modules`. Where I read Vite, vinext or Cloudflare plugin source, it is from the main checkout, `C:\Users\Johnson\Projects\ChemAtlas\node_modules`: vite 8.0.13, vinext 1.0.0-beta.5 (both match `4f965e3:package.json`), and `@cloudflare/vite-plugin` 1.67.0 (the branch's version; base pins 1.37.1). Statements from those files say so.
- Nothing was built. Where the answer depends on build output, this document says what the configuration specifies and lists it under "Not verified".

---

## O1

### O1.1 What the branch changes (whole branch)

`git diff --stat 4f965e3 fix/local-workers-runtime`:

| File | Commit | Lines (+/−) | Protected path? |
|---|---|---|---|
| `app/globals.css` | `eba3977` | 119 / 0 | No (listed as "extra review" in 02 §8.1) |
| `components/student-app.tsx` | `eba3977` | 286 / 55 | No (free to change) |
| `package.json` | `b5ceab5` | 2 / 2 | No, but extra-review (02 §8.1) |
| `pnpm-lock.yaml` | `b5ceab5` | 317 / 333 | No, but extra-review |
| `vite.config.ts` | `b5ceab5` | 26 / 2 | Not in your list; the production build config |
| `worker/index.ts` | `b5ceab5` | 8 / 4 | Not in your list, but "Do not touch" in 02 §8.1 (`worker/**`) |

Totals 758 / 396. Commit attribution: `git show b5ceab5 --stat` lists the last four files (353 / 341); `git diff --numstat b5ceab5 eba3977` shows exactly the first two (119, 286/55).

**Protected paths from your list** (`public/**`, `app/admin/**`, `app/api/**`, `db/**`, `drizzle/**`, `lib/question-review-*`, `lib/student-access.mjs`, `lib/cloudflare-access.mjs`, `wrangler*.jsonc`, `.github/**`): none touched. The stat above has no path under any of them. Two caveats: `worker/index.ts` is in 02 §8.1's do-not-touch class, and the new code imports `research/crop-visual-review.json`, which the branch does not modify but newly bundles into the client (see O1.3).

### O1.2 Summary by category

| Cat | Meaning | TSX hunks (of 29 at `-U0`) | TSX lines | CSS lines | Other |
|---|---|---|---|---|---|
| (a) | Question-viewer improvements | 28 (hunks 20, 23, 26 are split with (d)) | +210 / −43 | 42 added | none |
| (b) | Local Worker dev fixes | none | none | none | `package.json` 2 hunks (+2/−2); `pnpm-lock.yaml` 83 hunks (+317/−333); `vite.config.ts` 5 hunks (+26/−2) |
| (c) | Authentication change | none | none | none | `worker/index.ts` 2 hunks (+8/−4) |
| (d) | Superseded by the redesign | 4 (20, 23, 25, 26; three are shared with (a)) | +76 / −12 | 77 added | none |

Check: additions 252 + 345 + 8 + 153 = 758; deletions 43 + 337 + 4 + 12 = 396. Both match the numstat totals.

Hunk numbers (H1 to H29) below follow the order of `git diff -U0 4f965e3 fix/local-workers-runtime -- components/student-app.tsx`.

### O1.3 Category (a): question-viewer improvements

All rows: branch `fix/local-workers-runtime`, commit `eba3977`, file `components/student-app.tsx` unless stated.

| ID | Hunk | Branch lines | What it does | Rec |
|---|---|---|---|---|
| A1 | H1–H3 | L3, L5, L7 | Imports: `type ReactNode`; lucide icons (`ArrowLeft`, `ArrowRight` belong to (d); `Maximize2, Minimize2, Minus, MoveHorizontal, Plus, RotateCcw, Scan` are toolbar icons); `research/crop-visual-review.json` | Retain, only the imports the ported code uses |
| A2 | H4 | L78 | `type ViewerZoom = "width" \| "page" \| number` | Retain |
| A3 | H4 | L79–85 | `verifiedCropReviews`, `cropIsVerified`, `stimulusIsVerified` (see "What the verified helpers are" below) | Defer: provenance of the data is unexplained (02 §4.5) |
| A4 | H4 | L86–106 | Shared PDF cache: `pdfDocs` map, `acquirePdf` (ref-counted, keyed by URL or `bank:<id>`), `releasePdf` (destroys idle docs beyond the three most recent) | Retain |
| A5 | H4 | L107–116 | `inkBounds`: left/right extent of non-white pixels (step 2 rows) | Retain |
| A6 | H4 | L117–119 | `defaultZoom()` (0.9 under 600 px window width, else `"width"`), `normalizeText` | Retain |
| A7 | H4 | L121 | `PdfQuestionPage` signature gains optional `zoom, onScale, fitBox, focusText, cropNote` | Retain |
| A8 | H5, H6 | L124–139 | `fit` flag, `frameSize`/`renderedSize`/`focused`/`drawnContent` refs; `ResizeObserver` on nearest `[data-pdf-viewport]` triggers refit when the viewport size changes | Retain |
| A9 | H7 | L143–145 | Hides the canvas (`visibility:hidden`) when the content key (`key|page|cropView|regions`) changes, so a previous question never shows under a new label | Retain |
| A10 | H8 | L148–158 | Opens the document through `acquirePdf` and records `held` so cleanup releases it; open failure clears `held` | Retain |
| A11 | H9, H10 | L161–185 | Viewport element; crop `area` in PDF points clamped to the page; text anchors pre-filtered to the area and regions; `narrow` (<600 px) fits the text block; `chrome` height from `.pdf-label,.pdf-crop-note`; scale formula (`zoom === undefined` keeps the old fit-to-page-width formula at L183); calls `onScale` | Retain |
| A12 | H11 | L187–189 | Device-resolution render: `ratio = max(1, min(devicePixelRatio, sqrt(16e6 / (w*h))))`, so the megapixel cap is about 16 MP; `ratio = 1` when `zoom === undefined` | Retain |
| A13 | H12 | L191–192 | Scratch canvas sized from `renderViewport`; `willReadFrequently` only when narrow | Retain |
| A14 | H13 | L194–204 | Keeps `renderTask` for cancel; crop rectangle in output pixels; applies `inkBounds` margin trim when narrow | Retain |
| A15 | H14, H15 | L206–210 | Canvas size = crop × ratio, CSS size = crop; `setTransform(ratio…)`; clears `visibility`; records `drawnContent` | Retain |
| A16 | H16 | L212–230 | Highlight rewritten: first anchor whose text starts with the label (anchors already filtered); scale-aware box. Plus `focusText` scroll: first three words of `textPreview`, number prefix stripped, minimum 8 characters, quarter-viewport above; resets to top for empty `focusText` | Retain. Note it changes highlight geometry (below) |
| A17 | H17, H18 | L232–239 | `setBusy(false)` at end; cleanup `renderTask?.cancel()` and `releasePdf(key)` when held; effect dependencies gain `zoom, onScale, fit, frameSize, fitBox?.width/height, focusText` | Retain. `onScale` must be a stable callback (below) |
| A18 | H19 | L243 | `cropNote ?? <old text>` | Retain |
| A19 | H20 (part) | L313, L314, L315, L317–327 | State `modeChoice`, `viewerResets`, `catalogReady`, `zoom`, `viewerScale`, `viewerRef`, `fullscreen`; `fullscreenchange` listener (L318–322); `stepZoom` (L323, snaps to a quarter, clamps 0.25–4); `toggleFullscreen` (L324–327, sets notice "Fullscreen is not available in this browser." on failure) | Retain, adapting `viewerRef` to the pane's viewer element. `catalogReady` (L314) is Defer, see A21 |
| A20 | H21 | L362 | `.finally(() => setCatalogReady(true))` on the catalog fetch | Defer: the redesign's `useCatalog` supplies readiness |
| A21 | H22 | L422–425 | `hasCompleteCrop`, derived `imageMode` (user choice for this id, else `approved`, else `crop` if verified, else `full`), `setImageMode` | Defer: this is the verified-default policy |
| A22 | H23 (part) | L519 | `openQuestion` resets `zoom` and `modeChoice` instead of calling `setImageMode` | Retain the idea: reset on question change inside `QuestionPane` |
| A23 | H24 | L525–526 | `segmentSource(page, bankId)`: maps a global page to a split file's local page and asset URL | Exclude: `sourcePageLocation` in `lib/question-source.ts:12–16` (base) already does this and `renderSource` uses it |
| A24 | H26 (part) | L658–664 | `bankId`, `cropVerified`, `segments` (from `planWorksheet` when crop mode), `fitBox` (stack fit box), `toolLabel` | Retain `segments`, `fitBox`, `toolLabel`; Defer `cropVerified` |
| A25 | H26 (part) | L697–725 | Viewer shell: toolbar (L698–713), Full-page tabs with `aria-pressed` (L714), `.detail-scroll[data-pdf-viewport]` with stacked crop segments labelled "Shared stimulus" and the single full-page `PdfQuestionPage` (L715–724) | Retain, adapting to the pane |
| A26 | H26 (part) | L759–760 | "Loading question…" empty state while `!catalogReady`; "Question not found" only after | Defer, same reason as A20 |
| A27 | H27–H29 | L781, L784, L786 | Session worksheet uses `segmentSource` | Exclude: legacy view, leave unchanged |

Line count for (a) on the TSX side: PdfQuestionPage and its module helpers (A2–A18) +144/−34; detail viewer block (A24–A26) +38; state and handlers (A19–A23) +22; imports (A1) +3; worksheet consumers (A27) +3. Total +210/−43.

CSS rows for (a), `app/globals.css` on the branch, commit `eba3977` (single hunk +174,119):

| ID | Lines | Classes | Rec |
|---|---|---|---|
| AC1 | L196 | `.detail-viewer` (flex column, `overflow:hidden`; also the fullscreen target) | Retain, renamed |
| AC2 | L206–217 | `.viewer-shell`, `.viewer-toolbar`, `.viewer-group`, `.viewer-toolbar button`, hover/disabled, `.viewer-fit button[aria-pressed=true]`, `.viewer-zoom`, `.viewer-end`, `.viewer-fullscreen`, `.vt-icon`, `.vt-ratio` | Retain |
| AC3 | L218 | `.viewer-shell>.pdf-tabs` | Retain |
| AC4 | L219–228 | `.detail-scroll` (height `clamp(440px,calc(100vh - 300px),1200px)`, `contain:paint`), its `.pdf-frame`, `.pdf-label`, `.pdf-crop-note`, `canvas`, `.pdf-wait` overrides, `.detail-segment-label`, `.detail-segment + .detail-segment` | Retain |
| AC5 | L229–231 | `.detail-viewer:fullscreen` and children | Retain |
| AC6 | L257 | `.detail-page :is(button,summary):focus-visible` | Retain, re-scoped to the toolbar |
| AC7 | L275–283, L284–286, L288 | In `@media(max-width:760px)`: `.viewer-toolbar`, `.viewer-group`, button size, `.viewer-zoom`, `.viewer-end`, `.viewer-fullscreen`, `.vt-icon`, `.vt-label` (visually hidden), `.detail-scroll` height, `.pdf-label` and `.pdf-crop-note` phone rules, canvas margin | Retain |
| AC8 | L291 | `@media(max-width:360px)` toolbar rules | Retain |

That is 42 lines. The base rules these override are at `4f965e3:app/globals.css` line 8 (`.pdf-tabs`, `.pdf-frame`, `.pdf-label`, `.pdf-wait`, `.pdf-error`, `.pdf-frame canvas`), line 10 (`.pdf-frame{max-height:68vh}`, `.pdf-label{font-size:8px}`) and line 28 (`.pdf-crop-note`).

**CSS dependency the viewer rules have on category (d):** the (a) rules read five custom properties, `--dv-ctl`, `--dv-ctl-line`, `--dv-blue`, `--dv-muted`, `--dv-purple` (counted by `var()` use in the (a) lines), all declared on `.detail-page` at L177, which is a (d) rule. The redesign must declare these (or renamed tokens) itself.

#### What the verified helpers are (A3, A21)

- **Definition**: `components/student-app.tsx:80` (`verifiedCropReviews`), `:81–84` (`cropIsVerified`), `:85` (`stimulusIsVerified`) on `eba3977`. `hasCompleteCrop` is at `:422`.
- **Data source**: an inline JSON module import, not a fetch and not `public/`. `:7` is `import cropReviewDocument from "../research/crop-visual-review.json"`; `:6` (already at base L6) is `import stimulusDocument from "../research/stimuli.json"`. Both are bundled into the client JS.
  - `verifiedCropReviews` = the `reviews` entries with `status === "visually_verified"`, mapped to `{id: questionId, page: originalPage, rect: region}`.
  - `cropIsVerified(q)` is true when the question has regions and every region matches a verified review of that question and page: rectangle within 0.6 pt, or, when the review has no rectangle, the only region on that page.
  - `stimulusIsVerified(id)` reads `stimuli[id].verificationStatus === "visually_verified"`.
  - `hasCompleteCrop(q)` = `cropIsVerified(q)` and every `q.stimulusIds` entry verified.
- **Does the data exist at `4f965e3`?** Yes. `git ls-tree` shows `research/crop-visual-review.json` (blob `48bc496`, 59,652 bytes) and `research/stimuli.json` (3,324 bytes) both tracked at `4f965e3`; neither is touched by the branch. The file has `schemaVersion` and `reviews` (96 entries: 94 `visually_verified`, 2 `needs_review`; 94 carry a `region`). `stimuli.json` has 6 stimuli, all `visually_verified`. This corrects a loose reading of 02 §4.5 and PROGRESS ("no source on `main`"): the data file exists; what is unexplained is who maintains it and whether it is complete.
- **Provenance found**: `research/crop-verification-progress.md:66` (at `4f965e3`) names it with `stimuli.json` as the "machine-readable records" of a manual visual crop review done on branch `work/question-crop-verification` (same file L5), with evidence under `research/diagnostics/crop-batches/`. A tree-wide grep at `4f965e3` for `crop-visual-review` and `visually_verified` (excluding JSON data and the lockfile) finds only that markdown file. So at `4f965e3` nothing in application code or tests reads `crop-visual-review.json`; only the branch does. I found no script that writes it (not verified beyond that grep).
- **Not covered by release inputs**: `scripts/release/manifest.py:121` hashes `research/stimuli.json` and `pnpm-lock.yaml` into the sealed inputs (`docs/releases/student-inputs.json:5, :15`); `crop-visual-review.json` is not in that list. Importing it would put 59.6 KB of reviewer data into the client bundle with no input-hash coverage (the built files themselves are hashed by `build_inventory`, `manifest.py:152–161`).
- **Effect on defaults (computed by a script over the files at `4f965e3`, using the branch's matching rule; the app was not run)**: the catalog `public/student-questions.json` has 1,564 records, with 1,541 having `sourceRegions`. All 94 verified review ids exist in the catalog. `cropIsVerified` is true for 92 records, and all 92 are also `hasCompleteCrop` (68 MCQ, 24 FRQ). Every other record would open on Full page.

#### Behaviour changes for views that are not the detail view

`PdfQuestionPage` is called from five places on the branch: builder `renderSource` (L574), detail (L720, L723), practice session (L765), session worksheet (L784), audit (L798). Only the detail calls pass `zoom`. The other four take the legacy path (`zoom === undefined`): same scale formula (L183 equals base L95), `ratio = 1` (L188), no narrow trimming (L175).

Behaviour that still changes for those four, because it is inside the shared component:

| Change | Where | Effect on practice, worksheet/print, audit, `renderSource` |
|---|---|---|
| Shared PDF cache | L86–106, L148–158, L238 | Documents are shared by key and kept alive (up to three idle). Base opened and destroyed a document per instance (base L89–91, L127). Fewer re-opens when many canvases show the same file (worksheet, audit, builder previews). More memory held. |
| Cancellation | L194–196, L238 | Superseded renders are cancelled; base only set a flag. |
| Hidden canvas | L143–145, L210 | Canvas is `visibility:hidden` until drawn when the content key changes; base showed the old bitmap. |
| Text content fetched before rendering | L167 vs base L102 | Order of async work changes; no visible output change expected. |
| Highlight | L211–214 vs base L120–123 | Branch scales the box width by `scale` (`marker.width*scale+7`); base added unscaled `item.width + 7`. Affects only callers that pass `highlightLabels`: in the current code that is the detail view only (L721, L723). Not run. |
| `crop` clamp | L163–166 | Same result as base L109–116 by reading; not run. |

The default image mode (`crop` for 92 verified records) changes only the detail view, because `imageMode` is read only at L424, L660, L690–696, L714, L716 (all detail). The practice view (L765) never passes `cropView`.

`onScale` is a dependency of the render effect (L239) and the effect calls it (L185). A caller that passes a new function each render (an inline arrow) would re-run the effect after each parent update. The branch passes `setViewerScale`, which is stable. Any port must do the same. This is from reading, not a run.

### O1.4 Category (b): local Worker development fixes

Commit `b5ceab5`.

| ID | File | Branch lines | Change | Conditional on dev? | Rec |
|---|---|---|---|---|---|
| B1 | `package.json` | L50 | `devDependencies` `"@cloudflare/vite-plugin"` `1.37.1` to `1.67.0` | No: a dependency change affects every install and build | Defer |
| B2 | `package.json` | L69 | `devDependencies` `"wrangler"` `4.140.0` to `4.158.0` | No | Defer |
| B3 | `pnpm-lock.yaml` | 83 hunks, +317/−333 | Follows B1/B2: `@cloudflare/vite-plugin@1.67.0`; `wrangler@4.158.0`; `workerd` and the five `@cloudflare/workerd-*` platform packages `1.20260515.1`/`1.20260923.1` to `1.20261101.1`/`1.20261104.1`; `miniflare@4.20260515.0` to `5.20261101.0-beta` and `miniflare@5.20260923.0-alpha` to `5.20261104.0-beta` (pre-release tags); `@cloudflare/unenv-preset` entries; `esbuild` 0.28.0 to 0.28.1 and 0.28.1 to 0.28.2 in resolution strings | No | Defer. Also changes `pnpm-lock.yaml`'s digest, which `scripts/release/manifest.py:121` records in release inputs (`docs/releases/student-inputs.json:5`); the sealed-release path would need regenerated inputs (`manifest.py:182`, `:206`) |
| B4 | `vite.config.ts` | L1–2 | `import { createRequire } from "node:module"; import { realpathSync } from "node:fs";` | Imports run in every Vite invocation; only used by B5 | Defer |
| B5 | `vite.config.ts` | L7–11 | `localWorkerdDate()`: resolves `miniflare` from the Cloudflare plugin's `package.json`, then returns the bundled `workerd` `compatibilityDate` (same lookup as `scripts/release/smoke.cjs:7–9`) | Defined always, called only from B7's callback | Defer |
| B6 | `vite.config.ts` | L15 | `defineConfig({…})` becomes `defineConfig(({ command }) => ({…}))` | Function form is used for both `serve` and `build` | Defer |
| B7 | `vite.config.ts` | L22–35 | Adds to `cloudflare({…})` an option `config`. Quoted condition (L25): `command === "serve" ? (worker) => {…} : undefined`. When serving: sets `assets: { ...worker.assets, run_worker_first: false }` (L29) so Vite serves its own modules and CSS without the Worker, and sets `compatibility_date` to the local workerd's date when `wrangler.student.jsonc`'s date (`2026-11-12`) is newer (L30–32) | Yes for the callback. For `vite build` the option is `undefined`, so `wrangler.student.jsonc` is used unchanged | Defer |
| B8 | `vite.config.ts` | L38–40 | `server: { watch: { ignored: ["**/.sites-runtime/**"] } }` and the closing `}));` | `server.*` is a dev-server option; the config object is the same for build. That a build ignores it is from Vite's option meaning, not from a run | Defer. This line could live in a UI config if wanted |

Explanation of B7 for `vite build`: by the config as written, `config` is `undefined` when `command !== "serve"`, so the build path passes the same options as base (base `vite.config.ts` L10–14: `configPath`, `viteEnvironment`, `inspectorPort: false`). The B1/B2 version bump does still apply to builds. The branch commit message says the 1.37.1 workerd crashes in dev on Windows (`b5ceab5` message); I did not verify that.

### O1.5 Category (c): authentication change

Commit `b5ceab5`, `worker/index.ts`. The complete diff, two hunks (`git diff -U0 4f965e3 fix/local-workers-runtime -- worker/index.ts`):

```diff
@@ -0,0 +1 @@
+/// <reference types="vite/client" />
@@ -17,4 +18,7 @@ const worker = {
-    const access = await authenticateStudentRequest(
-      request,
-      env as unknown as Record<string, unknown>,
-    );
+    // `vite dev` only: Vite replaces import.meta.env.DEV with false in builds, so this bypass is stripped from deployments.
+    const access = import.meta.env.DEV
+      ? { ok: true as const }
+      : await authenticateStudentRequest(
+        request,
+        env as unknown as Record<string, unknown>,
+      );
```

| ID | Branch lines | Change | Rec |
|---|---|---|---|
| CX1 | `worker/index.ts:1` | Type reference for `import.meta.env` | Exclude |
| CX2 | `worker/index.ts:18–24` | Conditional skip of the Access check | Exclude |

**Which request paths skip `authenticateStudentRequest`, and when.** The branch file reads: `isRestrictedStudentPath(pathname)` returns 404 at L10–13; the conditional is at L19–24. If `import.meta.env.DEV` is truthy, `access` is `{ ok: true }` and the check is not called, for every request that is not an `/admin` or `/api/admin` path, any method, any host, any header. Nothing else conditions it: no hostname test, no environment variable, no `localhost` test. After L24 the code only reads `access.ok`, `.error` and `.status` (L25–34), so the identity is not used downstream. When the flag is false, behaviour is the base behaviour (base `worker/index.ts:17–30`).

**Is the admin 404 still first?** Yes. `isRestrictedStudentPath` runs at L10–13, before the conditional at L19. The base regex is `^/(?:api\/)?admin(?:\/|$)` after decoding, backslash and slash normalisation and lower-casing (`4f965e3:lib/student-access.mjs:21–28`). Its test in smoke is at `scripts/release/smoke.cjs:68–78` (four paths, GET with and without JWT, and POST, all 404).

**The related dev-only config line.** `vite.config.ts:29` (B7) sets `run_worker_first: false` only when serving. In that mode the Worker is not in front of static assets at all, so assets are not JWT-checked in dev even apart from the bypass. The comment at `vite.config.ts:22–23` says so ("Access is bypassed in dev").

**What `import.meta.env.DEV` is in this toolchain: evidence from source.**

- No file sets it. I searched `vite.config.ts` (branch tip), `wrangler.student.jsonc`, `package.json`, `worker/`, `lib/student-access.mjs`, `scripts/assert-student-private-config.mjs`, `scripts/release/**` and `.github/**` for `NODE_ENV`, `import.meta.env`, `--mode`, `mode:`, `define:` and `VITE_`. The only matches are the two lines in `worker/index.ts` (L18–19) and unrelated `mode` arguments in the release Python scripts. There is no `define` entry, no `--mode` flag and no `NODE_ENV` setting. The one `NODE_ENV` in the base tree is `scripts/vite/question-review-plugin.mjs:17`, which `vite.config.ts` does not import.
- Package scripts (`4f965e3:package.json`): `dev` `vite dev --host 127.0.0.1` (L10); `build` `vite build` (L11); `start` `wrangler dev --config dist/server/wrangler.json …` (L12).
- Vite 8.0.13 (read in the main checkout, `node_modules/vite/dist/node/chunks/node.js`): `vite build` calls `resolveConfig(inlineConfig, "build", "production", "production", …)` (L33003). `resolveConfig` sets `process.env.NODE_ENV` to the default only when it is not already set (L34334, L34336). `isProduction = process.env.NODE_ENV === "production"` (L34462) and the resolved env is `{ MODE: mode, DEV: !isProduction, PROD: isProduction }` (L34567–34570). For bundled environments the define plugin replaces `import.meta.env.<key>` with the JSON value (L22870–22880). `vite dev` uses `resolveConfig(inlineConfig, "serve")` with development defaults (L26080, L34320).
- So by the source: a build run with `NODE_ENV` unset or `production` has `DEV = false`. A build where `NODE_ENV` is already set to something else in the shell, or where a `.env`-style file supplies `NODE_ENV=development` (Vite reads it into `VITE_USER_NODE_ENV` at L4985 and applies `development` when the shell had none, L34459–34460), would have `DEV = true`. `.gitignore` ignores `.env*` (`4f965e3:.gitignore:30`) and no `.env` is tracked (`git ls-tree` found none), so a clean CI checkout has none. The workflows set no `NODE_ENV` (searched `.github/**`; `validate.sh:10` exports only `PYTHONDONTWRITEBYTECODE`, `WRANGLER_SEND_METRICS`, `CI`).
- **Would require a build to confirm**: that the Cloudflare plugin's `rsc` and `ssr` environments for `worker/index.ts` are "bundled" environments to which the define replacement applies, and that the literal is actually `false` in `dist/server/**`. I did not build. 01-existing-system §E1 and 02 §9 already list this as unknown; my reading does not close it.

**Guards that exist today that would catch a build shipped with the bypass active.**

1. `scripts/release/smoke.cjs:56–66` runs against the built `dist/server` inside Miniflare with `CF_ACCESS_TEAM_DOMAIN` and `CHEMATLAS_STUDENT_ACCESS_AUD` bound (L40). For every path it requests `HEAD` with a valid JWT, no JWT and a wrong-audience JWT, and asserts 200, 403, 403:

   ```js
   for (const path of paths) {
     for (const [jwt, status] of [[allowed, 200], [null, 403], [denied, 403]]) {
       const response = await request(path, jwt, "HEAD");
       assert.equal(response.status, status, path);
   ```

   A build with the bypass active would answer the no-JWT request with 200, and `assert.equal` would fail. It is run by `scripts/release/validate.sh:32`, which both validation workflows call (`.github/workflows/chematlas-pr-head-validation.yml:41`, `chematlas-release-validation.yml:67`). It is not run by `cloudflare-student-check.yml` (its steps are install, `check`, `check:private`, `build`, `check:private`, `test`, Python tests, L20–31).
2. `tests/student-access.test.mjs` tests `authenticateStudentRequest` in isolation (L29–32: 503 without config, 403 without JWT). It does not import `worker/index.ts`, so it would not detect a bypass in the Worker.
3. `scripts/assert-student-private-config.mjs` and `manifest.py` inspect Wrangler config, asset names and some strings (`manifest.py:155–159`: private-review markers). Neither inspects the built Worker for an auth bypass.
4. The post-deploy probe `.github/scripts/cloudflare-student-release.mjs:50–103` expects a `302` Access login redirect for anonymous requests. That redirect comes from Cloudflare Access at the edge, before the Worker runs, so it does not test the Worker's own check.

So the smoke script is the one guard, and it only runs where `validate.sh` runs. Layering: `lib/student-access.mjs:1–3` and `docs/cloudflare-student-deployment.md:26–32` describe the Worker check as defence in depth behind edge Access. A leaked bypass removes the second layer, not the first, provided the edge application is configured as the release script verifies.

### O1.6 Category (d): superseded by the redesign

Component names are from 02-architecture §7. All "Exclude: superseded".

| ID | File | Branch lines | What it is | Replaced by |
|---|---|---|---|---|
| D1 | `student-app.tsx` | L316 (H20) | `showClassification` state | none (no sidebar) |
| D2 | `student-app.tsx` | L516–518 (H23) | `addToWorksheet(q)` helper | `useWorksheets` `add` |
| D3 | `student-app.tsx` | L633 (H25) | Library list Add button calls `addToWorksheet` (was inline) | `QuestionList` add toggle |
| D4 | `student-app.tsx` | L652–657 (H26) | Detail wrapper and derived `topicFilter`, `parts`, `alsoFiled`, `added`, `sourcePages` | `QuestionPane` data (`partsForTopic`) |
| D5 | `student-app.tsx` | L665–681 | `.detail-header` (Back to list, title, badges) and `.detail-navigation` Previous/Next with `aria-live` position | `QuestionPane` header and previous/next (02 §10 ruling 7) |
| D6 | `student-app.tsx` | L682–695 | `.detail-workspace` grid, `.detail-viewer` section opening (carries `viewerRef`), viewer head, "Add to worksheet", "Hide/Show classification", image-mode group (Approved image / Question crop / Full page) | `QuestionBank` layout; `QuestionPane` view switch; `WorksheetStrip` |
| D7 | `student-app.tsx` | L696 | Approved-image stack branch (never shown; `approvedImages` is always empty) | Not carried (02 §10 ruling 16) |
| D8 | `student-app.tsx` | L726–758 | Section close; classification `<aside>` (Primary topic, Also filed under, Topic mapping, Classification evidence, `<dl>` metadata with Crop status); workspace close | `QuestionPane` topics, parts and status line |
| DC1 | `globals.css` | L174–195 | Comment, `.app-shell:has(.detail-page)`, `.detail-page` (page padding and the `--dv-*` tokens), `.detail-header` to `.detail-position`, `.detail-workspace`, shared card rule | `QuestionBank` and `QuestionPane` styles in the new tokens file |
| DC2 | `globals.css` | L197–205 | `.detail-viewer-head`, `.detail-viewer-actions`, `.viewer-modes`, `.viewer-action*` | `QuestionPane` view switch and add button |
| DC3 | `globals.css` | L232–256, L258 | `.detail-classification`, `.detail-side-*`, `.detail-primary-topic`, `.detail-topic-*`, `.detail-part-*`, `.detail-evidence*`, `.detail-meta*`, reduced-motion rule | `QuestionPane` topics and status |
| DC4 | `globals.css` | L259, L260 | `@media(max-width:1280px)` and `1100px` rules (mixed head, action and workspace rules) | Pane responsive rules |
| DC5 | `globals.css` | L261–274, L287, L289–290 | `@media(max-width:760px)` page, header, nav, viewer padding, head and action rules, `.detail-back`, classification | Pane responsive rules |
| DC6 | `globals.css` | L292 | `@media(pointer:coarse)` (mixes toolbar, actions, step, back) | Pane rules |

(d) totals: TSX +76/−12 (L316; L516–518; L633; L652–657 and L665–696 and L726–758 of the 109-line hunk H26), CSS 77 lines. The library, desk and unit views are not touched except L633 (D3).

### O1.7 Separability and effort

- **Can (a) be ported without (b), (c) or (d)?** Code-wise, yes. The viewer is separable in the diff:
  - No (b) dependency: the viewer code does not use the Worker config, the dependency bumps or the lockfile.
  - No (c) dependency.
  - Component part: L78 plus L86–246, about 162 lines of branch code, with no dependency on any (d) line. It depends on `readPdf` (base L70–76), the `SourceRegion` type, `PDFDocumentProxy`, and a DOM contract: an ancestor with `data-pdf-viewport` (L129, L161), and `.pdf-label` and `.pdf-crop-note` child classes (L179). Without the `data-pdf-viewport` ancestor it falls back to the frame itself, so "Fit page" would measure the frame, not a scroll area (my reading, not run).
  - Toolbar, state and handlers: about 31 lines (L313–327 minus L316; L664; L698–713), no (d) dependency except that `viewerRef` is attached to the `.detail-viewer` section at L683 (D6).
  - Crop stacking: L658–664 plus L715–724, about 17 lines.
  - CSS: 42 lines (AC1–AC8).
- **Entanglements to resolve when porting**:
  1. The CSS reads `--dv-*` tokens declared by `.detail-page` (L177, a (d) line).
  2. `.detail-scroll` sets the scroll height (L219: `clamp(440px,calc(100vh - 300px),1200px)`, tuned to the detail header above it). The pane must give `[data-pdf-viewport]` a definite height.
  3. `.pdf-label` sticky offsets (`top:-4px`, L221) and `.pdf-crop-note` (`top:38px`, L223) are tuned to this layout.
  4. Fullscreen targets the wrapper that holds the toolbar and scroll area (`.detail-viewer:fullscreen`, L229–231).
  5. The default mode logic (A21) and verified labels (A3, A24, A25 `cropNote` strings at L720) are tied together; the `cropNote` text claims "Visually verified…" (L720), so it must not be ported without A3.
- **Size**: about 144 added / 34 removed lines of component and helpers, about 65 lines of toolbar, state and stacking, 42 lines of CSS: roughly 250 added lines in total, of which the component rewrite is the only part that changes behaviour for other views (O1.3).
- **Existing views touched by (a)**: practice session (L765), session worksheet/print (L784), audit (L798) and builder `renderSource` (L574) all call `PdfQuestionPage`, so they get the shared-cache, cancellation and hidden-canvas changes and, where highlights are used, the highlight geometry change. They do not get zoom, fit, fullscreen, device-resolution rendering or ink trimming. The default-crop logic affects only the detail view that the redesign replaces.
- **Cherry-picking `eba3977` as a commit** is not separable: it is one commit whose two files mix (a) and (d) in the same hunks (H20, H23, H26). Port by hand from the line ranges above.

---

## O6

Candidate: untracked `C:\Users\Johnson\Projects\ChemAtlas\vite.design.local.config.ts` (7 lines: 3 comment lines, two imports, a blank line, `export default defineConfig({ plugins: [vinext({ appDir: "student" })] });`). It is git-excluded by `.git/info/exclude` lines 10 and 12 (the common git dir, shared by worktrees). Neighbour `vite.preview.local.config.ts` (18 lines) is the same app with `cloudflare({ configPath: "./wrangler.student.jsonc", config: { compatibility_date: "2026-11-08" }, viteEnvironment: …, inspectorPort: false })`, so it keeps the Worker and the Access check. The owner's launch config `chematlas-ui-only` runs the design config on port 5192 (`.claude/launch.json`); the memory note says it ran, taking about 2.5 minutes on first start. I did not run it.

### O6.1 How production is built and deployed today

All lines at `4f965e3` unless stated.

| Item | Reference | What it specifies |
|---|---|---|
| `build` | `package.json:11` | `vite build` (no `--config`) |
| `start` | `package.json:12` | `wrangler dev --config dist/server/wrangler.json --local --ip 127.0.0.1 --inspector-port 0` |
| `dev` | `package.json:10` | `vite dev --host 127.0.0.1` |
| `check` | `package.json:17` | `tsc --noEmit` |
| `lint` | `package.json:13` | `eslint . --ignore-pattern dist --ignore-pattern .next` |
| `test` | `package.json:18` | `node --test tests/*.test.mjs` |
| `check:private` | `package.json:19` | `node scripts/assert-student-private-config.mjs` |
| `install:ci` | `package.json:9` | `bash scripts/install-pnpm.sh` (pnpm setup; not Vite) |
| `vite.config.ts` | `vite.config.ts:7–16` | `vinext({ appDir: "student" })` plus `cloudflare({ configPath: "./wrangler.student.jsonc", viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] }, inspectorPort: false })` |
| `wrangler.student.jsonc` | L1–13 | name `chematlas-student-private`, `main ./worker/index.ts`, `workers_dev:false`, `preview_urls:false`, assets `ASSETS` with `run_worker_first:true` |
| `assert-student-private-config.mjs` | L5–15 | Always checks `wrangler.student.jsonc` (name, `workers_dev`, `preview_urls`, `ASSETS`, `run_worker_first`, no routes, no D1/R2) |
| same | L16–19 | If `dist/server/wrangler.json` does not exist: with `--built` it fails (L18), without it prints "no built artifact" and passes (L19) |
| same | L20–55 | If it exists: same checks on the built file, asset root must equal `dist/client` (L25), no file in `dist/client` matching `admin\|review-dashboard\|question-review\|question-images` (L29), no `/admin/` in the manifest (L32), catalog and non-empty asset checks (L33–53) |
| `scripts/release/validate.sh` | L19–36 | `rm -rf dist .next .wrangler` (L19); `pnpm install --frozen-lockfile`, `pnpm run check`, `pnpm test`, Python tests, `pnpm run check:private`, `manifest.py stamp`, `pnpm run build`, `pnpm run check:private --built` (L30), `pnpm exec wrangler deploy --dry-run --config dist/server/wrangler.json` (L31), `node smoke.cjs` (L32), seal; `tar -czf student-dist.tar.gz dist` (L36) |
| `scripts/release/smoke.cjs` | L13–14, L33–44 | Reads `dist/server/wrangler.json` and `dist/client/student-version.json`; loads `dist/server` modules into Miniflare |
| `scripts/release/manifest.py` | L145–146, L176–177 | Requires `dist/server/wrangler.json` (built form) and `dist/server/index.js`; requires a clean git checkout including untracked files |
| `scripts/release/approve.py` | L47–54 | Unpacks `student-dist.tar.gz`; every member must be under `dist` |
| Workflows | see below | `cloudflare-student-check.yml` L20–31; `chematlas-pr-head-validation.yml` L41; `chematlas-release-validation.yml` L67–71; `cloudflare-student-release.yml` L85, L96 |
| `cloudflare-student-release.yml` | L79–85, L96 | Writes `dist/server/wrangler.release.json`, runs `wrangler deploy --dry-run --config dist/server/wrangler.release.json`, then `.github/scripts/cloudflare-student-release.mjs` (deploy at its L280 uses `--config dist/server/wrangler.release.json`). Header says "Inactive proposal" |

**Does anything pass `--config` to Vite, glob for `vite.*.config.*`, or could pick up a second Vite config by name?** No. I searched `scripts`, `.github`, `package.json`, `README.md`, `docs/cloudflare-student-deployment.md`, `tsconfig.json`, `eslint.config.mjs` for `vite\.[a-z.-]*config`, `--config`, `*.config` and `vite.*`. The only `--config` uses are Wrangler's, always pointing at `dist/server/wrangler*.json` (`package.json:12`, `validate.sh:31`, the release workflow L85, the release script L280 and L296, `docs/cloudflare-student-deployment.md:57, :124, :125`). Every Vite invocation is bare (`vite build`, `vite dev`). The only Vite config in the tracked tree is `vite.config.ts` (`git ls-tree` of names matching `vite` or `*.config.{ts,mjs,js}`: `drizzle.config.ts`, `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`, `vite.config.ts`).

### O6.2 What a `vite.ui.config.ts` would and would not be part of

| Question | Answer | Reference |
|---|---|---|
| Type-checked by `pnpm run check`? | Yes. `include` has `**/*.ts` and `exclude` does not list it (excludes: `node_modules`, `examples`, `dist`, `.vinext`, `.wrangler`, `.sites-runtime`, `outputs`, `work`). Same as `vite.config.ts` today. | `tsconfig.json:35–52` |
| Linted by `pnpm run lint`? | Yes. `eslint.config.mjs` ignores `dist/**`, `.vinext/**`, `.wrangler/**`, `.sites-runtime/**`, `outputs/**`, `work/**` only, and the script adds `dist` and `.next`. Lint is not run by any workflow. | `eslint.config.mjs:8–15`, `package.json:13` |
| Picked up by Vite's default lookup? | No. Vite's default list is `vite.config.js`, `.mjs`, `.ts`, `.cjs`, `.mts`, `.cts`, tried in order. `vite.ui.config.ts` is not in it. | `vite/dist/node/chunks/logger.js:182–189`; `node.js:34708–34712` |
| In any packaging or artifact step? | No. The release tarball is `tar -czf … dist` only, and unpack requires members under `dist`. CI does check out the whole repo, but nothing copies the repo root. | `validate.sh:36`, `approve.py:47–54` |
| In release input hashes? | No. `manifest.py:121` hashes `PUBLIC`, `pnpm-lock.yaml` and `research/stimuli.json`. | `manifest.py:11–14, :121` |
| Ignored by `.gitignore`? | No pattern matches it. `.gitignore` covers `/node_modules/`, `/dist/`, `/.next/`, `/.vinext/`, `*.tsbuildinfo`, `.env*`, `.dev.vars*`, `*.pem`, `/.wrangler/`, `/.sites-runtime/`, and a few workspace folders. It would be tracked once committed. `dist-ui` would not be ignored. | `.gitignore:12–47` |
| Clean-tree check in release | A committed file is part of the SHA, so `manifest.py:176–177` is satisfied. An untracked file (as today) would fail it on a release checkout, but release checkouts are CI clones. | `manifest.py:176–177` |
| Lockfile or dependency effect | None. A new file and a new `scripts` entry do not touch `pnpm-lock.yaml` (scripts are not recorded in a pnpm lockfile; not verified by a run). | |

### O6.3 Why the Worker dev path fails locally today

- `lib/student-access.mjs:30–36`:

  ```js
  export async function authenticateStudentRequest(request, env, now = Date.now()) {
    const teamDomain = configuredTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
    const audience = typeof env.CHEMATLAS_STUDENT_ACCESS_AUD === "string"
      ? env.CHEMATLAS_STUDENT_ACCESS_AUD.trim() : "";
    if (!teamDomain || !audience) {
      return { ok: false, status: 503, error: "Private student access is not configured." };
  ```

  `configuredTeamDomain` (L14–19) accepts only a host ending `.cloudflareaccess.com`.
- `worker/index.ts:17–20` (base) calls it for every non-admin request and returns `access.error` and `access.status` on failure (L21–30).
- `wrangler.student.jsonc` has no `vars` (L1–13), and `.dev.vars*` is git-ignored (`.gitignore:31`) with none present, so a dev Worker has neither variable. With the variables set but no header, L38–39 returns 403 "Cloudflare Access is required."
- `README.md:31–34`: "Local browser testing requires a **local-only simulated Cloudflare Access JWT** configured for development or signed test fixtures. Without Access settings, the built Worker fails closed. Never use a mock identity or `access.dev` in a production or deployable configuration."
- `docs/cloudflare-student-deployment.md:66–73`: a local Worker preview "returns 503 when bindings are missing, or 403 for a missing JWT when bindings exist"; for browser QA it suggests an ignored local copy of the generated Wrangler config with an `access.dev` simulation.
- The owner's memory note (2026-11-14) records seeing the 503 from `chematlas-dev`.

### O6.4 What the student app needs from a server at runtime

Every network reference in the student code at `4f965e3` (grep of `components/student-app.tsx`, `practice-builder.tsx`, `worksheet-preview.tsx`, `components/ui/atlas-controls.tsx`, `lib/worksheet*.ts`, `lib/question-source.ts`, `lib/progress-transfer.mjs`, `app/navigation.mjs`, `student/app` for `fetch(`, URLs, `workerSrc`, `new Worker`, `WebSocket`, `EventSource`, `sendBeacon`, `/api/`, `/admin`):

| Request | Where | Served from |
|---|---|---|
| `GET /student-questions.json` | `student-app.tsx:237` | `public/student-questions.json` |
| `GET /worksheet-sources.json` | `practice-builder.tsx:56` (via `getJson`, L50–54) | `public/worksheet-sources.json` |
| `GET /worksheet-content.json` | `practice-builder.tsx:59` | `public/worksheet-content.json` |
| `GET /worksheet-fragments.pdf` | `lib/worksheet-render.ts:9` | `public/worksheet-fragments.pdf` |
| pdf.js worker `/pdf.worker.min.mjs` | `student-app.tsx:86`, `:186`; `worksheet-preview.tsx:24` | `public/pdf.worker.min.mjs` |
| Source PDFs `/source/bank-0N.pdf` (Range requests, `rangeChunkSize: 65536`) | `student-app.tsx:89`, `:189` via `catalog.sourceFiles[].url`; `lib/question-source.ts:15` | `public/source/bank-01…08.pdf` |
| Fallback `/ap-chemistry-mega.pdf` | `student-app.tsx:89`, `:189`; `question-source.ts:15` | Not in `public/` (existing defect, 02 §10 ruling 15) |
| Links (navigation, not fetches): `/practice-builder`, `/classification-method.md`, `/student-page-audit.json` | `student-app.tsx:425, :453, :478, :567` | route; `public/classification-method.md`; `public/student-page-audit.json` |
| Browser-only: IndexedDB `apchem-practice-bank`, `localStorage` | `student-app.tsx` | none |

The student code makes no request to any `/api/*` route, to any Worker-only endpoint, or to a third party. `/student-version.json` is not requested by the UI (only by release scripts). Static serving from `public/` is therefore enough for the UI itself, as long as the dev server serves `public/` at the root (Vite's default; the memory note says it works under the design config; not run here).

**What behaves differently without the Worker**: (1) the Worker's `Cache-Control: private, no-store` and `X-Robots-Tag` on every response (`worker/index.ts:38–44` on the branch; base equivalent) are absent, so a dev server's caching headers apply; (2) the `/admin` and `/api/admin` 404s come from the Worker (`isRestrictedStudentPath`); under the UI config those paths 404 only because `student/app` has no such route (not verified by a run); (3) no Access identity exists, and the UI does not read one (`authenticateStudentRequest`'s `user` is not passed on by the Worker either); (4) the `/_next/static/*` special case (`worker/index.ts:36–41` on the branch) is a Worker concern.

### O6.5 Isolation argument

(i) **No auth code, no protected file touched.** The candidate contains only `vinext` and `defineConfig` (design config L4–7). It changes no Worker, Wrangler, access or workflow file. The proposed commit adds `vite.ui.config.ts` and, for option A, one `scripts` line.

(ii) **The build and all CI/release commands name `vite.config.ts` implicitly.** `pnpm run build` is `vite build` (`package.json:11`); Vite resolves its config by trying the six `vite.config.*` names (`logger.js:182–189`, `node.js:34708–34712`). `vite.ui.config.ts` is not one of them. No script or workflow passes a Vite `--config` (O6.1).

(iii) **A UI-config build has no Cloudflare plugin, so by configuration it emits no `dist/server/wrangler.json`.** The file is written by `@cloudflare/vite-plugin` (in the installed 1.67.0 source, `dist/index.mjs:74306` writes `…/wrangler.json` into the client environment's output directory; a second write path is at `:73829`); vinext alone contains no such write (its `dist/index.js` mentions the name only inside Cloudflare-specific branches; not exhaustively traced). Requirements for that file: `package.json:12` (`start`), `validate.sh:31`, `smoke.cjs:13`, `manifest.py:145–146` (also `dist/server/index.js`), `assert-student-private-config.mjs:18` (`--built` fails without it). By source, not by a build.

(iv) **Would anything stop `vite build --config vite.ui.config.ts`? No.** Nothing in the repo refuses it. vinext has its own guard (`vinext/dist/index.js:1610`): a build without the Cloudflare plugin throws when `hasWranglerConfig(root)` is true. That function (`vinext/dist/utils/project.js:211–213`) checks only `wrangler.jsonc`, `wrangler.json`, `wrangler.toml` and `cloudflare.config.ts` in the root. The repo has `wrangler.student.jsonc` and `wrangler.private-review.jsonc`, so the guard would not fire. What the output could be: by vinext's defaults without the Cloudflare plugin, the RSC build goes to `dist/server` (`index.js:1438`), SSR to `dist/server/ssr` (`:1460`), client to `options.clientOutDir ?? "dist/client"` (`:2975`), and the `vinext:build-id` plugin writes `dist/server/BUILD_ID` using a hard-coded `path.join(root, "dist", "server")` (`:3098`). That is a vinext server bundle with no Worker entry or `wrangler.json`; it could be run by something else or deployed by hand with a hand-written Wrangler config, with no Access check in front of it. I did not build, so what it contains is not verified.

(v) **Residual risks.**
1. **Output collision with `dist/`.** The paths above are the same as production's. A UI build run after a production build in the same checkout would overwrite `dist/client` and `dist/server/index.js` while leaving the old `dist/server/wrangler.json`, which `pnpm start` would then use with a replaced entry. CI is unaffected (`validate.sh:19` removes `dist` first). `vinext` exposes `rscOutDir`, `ssrOutDir`, `clientOutDir` (`vinext/dist/index.d.ts:33, 38, 43`), but the BUILD_ID write is hard-coded, so changing out dirs alone does not fully avoid `dist/server`. A top-level `build.outDir` does not govern vinext's per-environment out dirs (`index.js:1438, :1460`).
2. **Someone points a deploy at it**: possible by hand only; no script would.
3. **Type-check and lint failures**: it is in `tsc` and `eslint` scope (O6.2). A function-form config mirrors the pattern already used on the branch's `vite.config.ts`; any type error would fail `pnpm run check`. Not run.
4. **Drift from `vite.config.ts`**: `appDir: "student"` must stay equal in both files; nothing enforces it. The plugin versions are shared (same `package.json`).
5. **First start is slow** (about 2.5 minutes of dependency optimising, per the memory note).
6. **README wording**: `README.md:33–34` says never to use a mock identity or `access.dev` in a deployable configuration. The UI config uses neither; it should say so in its header.

### O6.6 Alternatives

| | Files touched | What it needs | Risk |
|---|---|---|---|
| **A**: commit `vite.ui.config.ts` and a `dev:ui` script (`vite dev --config vite.ui.config.ts --host 127.0.0.1`) | New `vite.ui.config.ts`; `package.json` (one `scripts` line; extra-review file per 02 §8.1); no lockfile change expected | One PR review of two small changes | Config is checked by `tsc` and `eslint`; the script advertises the path; the build-refusal guard below removes the misuse risk |
| **B**: commit the file only; run `pnpm exec vite dev --config vite.ui.config.ts` | New `vite.ui.config.ts` only; `package.json` untouched | A line in the handoff doc | Same file risks as A; slightly lower discoverability; avoids the extra-review file |
| **C**: keep it untracked and local as now (`.git/info/exclude`) | None in the repo; document in the handoff | The owner's local files; redesign worktree has no copy (`git ls-tree` of the worktree shows only `vite.config.ts`) | Not reproducible by another session or machine; the worktree would need its own untracked copy and a launch entry |
| **D**: README method, simulated Access JWT with the Worker in the path | None required in the repo; local-only artefacts (ignored) | See below | Highest effort; keeps the Worker and its check; no helper exists for a dev server |

**What D needs** (all from source): bindings `CF_ACCESS_TEAM_DOMAIN` (must end `.cloudflareaccess.com`, `student-access.mjs:14–19`) and `CHEMATLAS_STUDENT_ACCESS_AUD` (e.g. in an ignored `.dev.vars`, `.gitignore:31`); an RS256 JWT with `iss === https://<team>`, a `sub`, an `aud` containing the audience, a future `exp`, an `email`, header `kid` (`student-access.mjs:46–59`) sent as `cf-access-jwt-assertion`; and a JWKS reachable at `https://<team>/cdn-cgi/access/certs`, which the code fetches with a fixed HTTPS URL (`student-access.mjs:81`), so a local server cannot stand in without a fetch mock. A browser also has to send the header on every request. **Helpers that exist**: `scripts/release/smoke.cjs:15–31` (per-run RSA key, mocked certs via undici `MockAgent` passed to Miniflare's `fetchMock`, L33–41) and `:87–89` (Playwright route that injects the header) — but it runs against a built `dist/`; `tests/student-access.test.mjs:8–28` (fixture token and `globalThis.fetch` mock, unit level). **No dev-server helper exists.** Whether the Cloudflare Vite plugin lets a dev Worker take a Miniflare `fetchMock`, or whether `access.dev` from `docs/cloudflare-student-deployment.md:66–73` produces the header in `vite dev`, is not verified (the same document warns Static Assets can drop `ctx.access`, but the Worker verifies the header, not `ctx.access`).

**How `b5ceab5`'s DEV bypass differs from A–D** (not an option): A–C remove the Worker from the request path without editing it; D keeps the Worker and satisfies its check with a local credential. `b5ceab5` edits `worker/index.ts` so that the Worker itself skips the check when a compile-time flag is true, so the bypass exists in the source of the file that ships, and its safety rests on the flag being false in every build (O1.5).

### O6.7 Proposed file and safety measures

Proposed `vite.ui.config.ts` (not created):

```ts
// LOCAL UI WORK ONLY. Runs the student app on vinext alone: there is no Cloudflare
// plugin and no Worker, so the Access check in worker/index.ts is not in the request
// path (it is not bypassed or edited). There is no mock identity or access.dev here.
// Never build or deploy from this file. The deployable build is `pnpm run build`,
// which uses vite.config.ts. Keep appDir equal to vite.config.ts.
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  if (command === "build") {
    throw new Error("vite.ui.config.ts is for `vite dev` only. Use `pnpm run build` (vite.config.ts) for a deployable build.");
  }
  return { plugins: [vinext({ appDir: "student" })] };
});
```

Optional extra line for slow disks (from `b5ceab5`'s B8): `server: { watch: { ignored: ["**/.sites-runtime/**"] } }` inside the returned object.

**Is a config function that refuses `build` feasible? Yes, by source.** Vite passes `configEnv = { mode, command, isSsrBuild, … }` to the config function (`node.js:34338–34340`: `mode`, `command`, `isSsrBuild`); `vite build` resolves with `command` `"build"` (`node.js:33003`), `vite dev` with `"serve"` (`node.js:26080`). `vite preview` also resolves with `"serve"` (`node.js:33739`), so it is not blocked, which is harmless since preview needs a prior build. An exception thrown in the function propagates out of config loading, so the command fails before any plugin runs (from the structure of `loadConfigFromFile`/`resolveConfig`; I did not execute it). The branch's own `vite.config.ts` already uses the same function form (`defineConfig(({ command }) => ({…}))`, L15), which shows the typing pattern. Should be tested once: `pnpm exec vite build --config vite.ui.config.ts` expecting a non-zero exit and no `dist` change.

**Distinct `build.outDir` (for example `dist-ui`)**: not sufficient by itself, and not needed if the throw is used. Top-level `build.outDir` does not set vinext's per-environment out dirs (`vinext/dist/index.js:1438, :1460, :2975`); `vinext()` accepts `rscOutDir`, `ssrOutDir`, `clientOutDir` (`index.d.ts:33, 38, 43`), but `dist/server/BUILD_ID` is written to a hard-coded `dist/server` (`index.js:3098`). A snippet, if the owner wants it as a second layer: `vinext({ appDir: "student", clientOutDir: "dist-ui/client", rscOutDir: "dist-ui/server", ssrOutDir: "dist-ui/server/ssr" })`, plus an entry for `dist-ui` in `.gitignore`, `tsconfig.json` `exclude` and `eslint.config.mjs` ignores (three more files). I recommend the throw alone.

---

## Not verified

- No build, dev server, `tsc`, ESLint, test or smoke run was performed. Everything above is from reading files and git objects.
- Whether `import.meta.env.DEV` is replaced by `false` in `dist/server/**` for `worker/index.ts` (the Cloudflare plugin's `rsc`/`ssr` environments); only the Vite resolution logic was read.
- Behaviour of `@cloudflare/vite-plugin` 1.67.0 (`config` function option, wrangler.json output) was read from the main checkout's installed copy, not from the redesign worktree and not at the base version 1.37.1.
- Visual and interactive behaviour of the viewer (zoom, fit, fullscreen, highlights, phone layout, touch sizes) and the highlight-width difference.
- That the branch type-checks, lints, or installs with `--frozen-lockfile`; whether `pnpm-workspace.yaml`'s `minimumReleaseAge` (7 days) accepts the `miniflare` pre-release versions in the lockfile.
- The "92 verified crops" count comes from a throw-away script that re-implements the branch's matching rule over the committed JSON files, not from the app.
- Who maintains `research/crop-visual-review.json`, whether it is current, and whether any script writes it (only a text search of the tree at `4f965e3` was done).
- That `vite.design.local.config.ts` starts and serves `public/` at the root (taken from the memory note); that `/admin` returns 404 under the UI config; that the proposed config function throws cleanly on `vite build`; that the `dev:ui` script leaves `pnpm-lock.yaml` unchanged.
- Whether `access.dev` or a Miniflare `fetchMock` can be used with `vite dev` (alternative D).
- Whether a UI-config build writes anything other than the paths listed, and what its output would contain; the vinext client environment's out dir for the `appDir` case was only partly traced.
- The effect of `/// <reference types="vite/client" />` on `tsc` for the whole program.
