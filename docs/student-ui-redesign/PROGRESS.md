# Redesign progress and decision log

Running record for the ChemAtlas student UI redesign. Newest state first. Read this before anything else in the folder.

## Owner approvals, 2026-11-15 (after reviewing O1 and O6)

- **O1 approved as recommended**: port the viewer improvements from `eba3977`; exclude the authentication change, the Worker dependency changes and the detail-page layout; `fix/local-workers-runtime` stays unchanged; the verified-crop default is deferred (O8); viewer work is separate from structural refactoring.
- **O6 approved**: a dedicated `vite.ui.config.ts` for local UI development only, with a tested build-refusing safeguard and proof that production builds and releases cannot select it. No `package.json` script.
- **Fonts under `public/fonts/` deferred** until release-input impact and licensing are verified.
- **Phase A will be implemented by Codex, not Claude.** The assignment is `CODEX-PHASE-A-HANDOFF.md`, split into A1 (structural refactoring, no behaviour change), A2 (hand-port of the viewer), A3 (UI-only dev config). It supersedes the Phase A section of `SESSION-3-HANDOFF.md`.
- Moved out of Phase A as a result: the token stylesheet and contrast script, self-hosted fonts, the client-navigation spike, and the additions to worksheet state (storage-event sync, recovery key, memory-only status). They now open Phase B.
- Still not authorized: Phase B onward, pushing, merging, deploying.

Note for O8: the base already bundles one research file into the student app (`components/student-app.tsx` L6 imports `research/stimuli.json`). That is precedent, not approval, for `research/crop-visual-review.json`.

## Current state (2026-11-15, end of Session 2)

- **Session 1** (design): approved by the owner. Prototypes in `design-previews/v2`, committed at `7f720f9`.
- **Session 2** (architecture): complete. Package is this folder. **No production code has been changed.**
- **Session 3** (implementation): not started, not authorized.

| | |
|---|---|
| Approved base | `origin/main` @ `4f965e32ffaa3b6bce8ab6f99b22fe42643fce16` (owner, 2026-11-15) |
| Redesign branch | `feature/student-ui-redesign`, worktree `../ChemAtlas-redesign` |
| Pushed / merged / deployed | No / No / No |
| Other branches and worktrees | Untouched |

## Documents

| File | Contents | Written by |
|---|---|---|
| `01-existing-system.md` | Source-grounded map of the current app, with `path:line` | Sonnet 5.5 subagent |
| `02-architecture.md` | Decisions D1–D7, rendering and PDF strategy, state, components, responsive and accessibility, protected boundaries | Fable 5.2 |
| `03-risks-and-roadmap.md` | Risks R1–R21, Phases A–E with acceptance criteria | Fable 5.2 |
| `04-component-migration-matrix.md` | Every existing view and control, with its fate | Sonnet 5.5 subagent, reviewed by Fable |
| `05-test-and-acceptance-plan.md` | Automated and manual verification, acceptance gates | Sonnet 5.5 subagent, reviewed by Fable |
| `SESSION-3-HANDOFF.md` | The implementation assignment | Fable 5.2 |

## Decisions made (no approval needed; reversible)

| # | Decision | Evidence |
|---|---|---|
| D1 | Builder preview is the real PDF from the existing pipeline; no HTML paper | The pipeline's fallback rules are worksheet-dependent (`lib/worksheet-pdf.ts` L33–54); the preview component already exists |
| D2 | One worksheet state: existing `Backup` under `chematlas-worksheets-v1`; no schema change, no migration | Every prototype control maps to an existing `Format` field; `addEntries` already de-duplicates and caps at 500 (`lib/worksheet.ts` L69–77) |
| D3 | Print outcome comes from the composer's own plan | Same lines as D1 |
| D4 | Strangler migration inside `student-app.tsx`; no new dependencies | One 578-line component; a release smoke test pins its output |
| D5 | One question viewer: `PdfQuestionPage`, extracted | Avoids a second renderer |
| D6 | Filtering stays "any related topic"; unit derived from topic id | Both screens do this today; `primaryUnit` is stale in 569 of 735 records |
| D7 | Distinct phone navigation (nine units visible, topic sheet, history-backed question view) | Session 1 screenshots; owner's mobile concerns |
| — | Drop STIX Two Text; self-host two font families | No HTML page to typeset after D1; private app should not call Google Fonts; all responses are `no-store` |
| — | Shared worksheet state moves into Phase A, ahead of the Question Bank | The bank's add buttons need it; makes every phase an end-to-end slice |

## Decisions that need the owner (work is not blocked until the phase shown)

### O1 — What to do with `fix/local-workers-runtime` (needed before Phase A)

The branch is local only, two commits ahead of the base, by the repository owner's account.
`b5ceab5` fixes the Windows dev runtime (dependency bumps, Vite serve-mode changes) and **adds a dev-mode skip of the Access check in `worker/index.ts`**. `eba3977` redesigns the question detail page and substantially improves the PDF viewer.

| Option | Effect |
|---|---|
| **A (recommended)** | Keep the branch as it is. Port only the *viewer* improvements from `eba3977` into the extracted `PdfQuestionPage` during Phase A. The redesign's pane replaces that commit's detail layout. `b5ceab5` stays off the redesign branch; if wanted, it gets its own security review (build-output check plus an unauthenticated-request test against the built Worker). |
| B | Land the branch on `main` first, then rebase the redesign. Brings the auth change and dependency bumps into the base; needs that security review first. |
| C | Ignore the branch. Loses a better viewer and guarantees a later conflict. |

Nothing has been done to the branch. It is not discarded or overwritten under any option.

### O2 — May a question without a reviewed print layout ever export as a crop? (before Phase D)

Today it cannot: it exports as its full source page, with a caption warning of adjacent questions or printed answers. Only 83 of 735 classified questions have a reviewed layout.

| Option | Effect |
|---|---|
| **A (recommended)** | Keep today's rule. The UI states it plainly and offers a "Reviewed print layout only" filter. Coverage improves as review proceeds. |
| B | Allow unreviewed crops in exports with a warning. Risks cut-off stems, missing shared material and exposed answers; changes export behaviour. |

### O3 — Extract `planExport` from `composeWorksheet` (before Phase D)

A behaviour-neutral move of `lib/worksheet-pdf.ts` L33–54 into an exported function, so the outline can state each question's print outcome without generating a PDF. Recommended. Without it, outline labels are static and less precise.

### O4 — Product questions the redesign raises (before Phase C)

| Question | Recommendation |
|---|---|
| Where do Practice sessions and Progress go? | A "More" menu in the top bar, first group |
| Where do Review queue, Source page audit, Legacy content, Manage test banks go? | Same menu, second group labelled "Catalog tools" |
| Builder "Replace" flow | Drop the dedicated flow; remove then add from the bank. Position can be restored with move |
| Builder "Auto-add from matches" | Move to the bank as "Add all shown" (max 50), in Phase E or later |
| Builder filters "previously attempted / missed" and "original source" | Move to the bank's filter row, Phase E or later |
| May the bank list `review` and `legacy` questions? | No (as the bank does today). The current builder lets them be added; existing drafts that contain them keep working |

### O5 — Caching policy (no deadline)

Every response, including source PDFs and the catalog, is `Cache-Control: private, no-store`. This is a deliberate Worker setting and is not changed by the redesign. It makes each screen switch and reload refetch megabytes. Options: leave it; or allow private caching for content-hashed static assets. Recommendation: decide after Phase A reports measured load.

### O6 — Commit a UI-only dev config (before Phase A)

A Vite config that runs the student app without the Worker, for local UI work. It does not bypass the gate (the Worker is not in the request path) and cannot produce a deployable build. Options: commit it as `vite.ui.config.ts` (recommended), or keep it as an untracked local file as now.

### O7 — Allow axe-core as a development-only dependency (before Phase E, optional)

The plan checks accessibility through the browser's own accessibility tree with no new dependency. axe-core would catch more. Options: add it as a dev dependency (touches `package.json` and the lockfile, which are extra-review files), or stay with the built-in check plus manual screen-reader passes. Recommendation: stay without it unless the manual passes find recurring problems.

## Existing defects noticed, not changed

Reported for the owner; outside the redesign's scope and left as they are.

- The legacy review view can store an empty string as a topic override (`components/student-app.tsx` L386, L569, L284).
- `PdfQuestionPage` falls back to `/ap-chemistry-mega.pdf`, which is not in `public/`.
- `practice-builder.tsx` L56–58 silently continues when the source registry fails to load (the redesign replaces this with a visible error in Phase C).
- `primaryUnit` disagrees with the unit of `primaryTopic` in 569 of 735 classified records. Nothing reads it for filtering.
- Lint is not run in CI.

## O1 and O6: refined recommendations after investigation (2026-11-15)

Evidence is in `06-o1-o6-investigation.md` (Sonnet 5.5, read-only, nothing built or run). These replace the shorter recommendations above. Awaiting the owner's answer.

### O1 — `fix/local-workers-runtime`, by category

| Category | Where | Recommendation |
|---|---|---|
| Authentication change | `b5ceab5`, `worker/index.ts` L18–24: `import.meta.env.DEV ? { ok: true } : await authenticateStudentRequest(...)` | **Exclude** from the redesign and from `main` in this form. With DEV true, every non-admin request skips the check. DEV is a build-time flag: `vite build` sets production only when `NODE_ENV` is unset, so a shell or `.env` value of `development` would build the bypass in. The only guard is the 403 assertion in `scripts/release/smoke.cjs` L56–66 (run by `validate.sh`; not run by `cloudflare-student-check.yml`). O6 removes the need for it |
| Local Worker dev fixes | `b5ceab5`: `package.json`, `pnpm-lock.yaml` (vite plugin 1.37.1 → 1.67.0, wrangler 4.140.0 → 4.158.0, Miniflare to pre-release versions), `vite.config.ts` serve-only changes | **Defer** to its own branch and review, separate from the redesign. The lockfile hash is part of the sealed release inputs, so this is a release-relevant change. Not needed for UI work once O6 is in place |
| Viewer improvements | `eba3977`, `components/student-app.tsx`: `PdfQuestionPage` and helpers (about 162 lines), toolbar and zoom state (about 31), crop stacking (about 17), about 42 lines of `.viewer-*` CSS | **Retain by porting** in Phase A as its own commit, crediting `eba3977`. It cannot be cherry-picked: the commit mixes viewer and layout. Re-home the CSS in the student stylesheet without the `--dv-*` tokens, and use the existing `lib/question-source.ts` `sourcePageLocation` instead of the branch's duplicate `segmentSource` |
| Default "crop only when verified" policy | `eba3977`, reads `research/crop-visual-review.json` and `research/stimuli.json` (both tracked at the base; 96 reviews, 94 verified; 92 of 1,564 records would open as a crop) | **Defer**, new decision O8: is that research file an approved student-facing data source? It is not among the release input hashes and is maintained on another work branch. Until answered, the viewer keeps today's default |
| Detail-page layout | `eba3977`: two-column layout, classification sidebar, header and nav rules (about 88 TSX lines, 77 CSS lines) | **Exclude**: superseded by `QuestionPane`. The branch itself is kept untouched as the record |

Correction to earlier text: `verifiedCropReviews` does have a source at the base (`research/crop-visual-review.json`). What is unknown is who maintains it and whether it is meant to ship to students.

Side effects of the viewer port on other screens: practice sessions, the session print view, the audit view and the builder's source preview all use `PdfQuestionPage`. They keep the old scaling path but gain the shared PDF cache, render cancelling and hide-until-drawn. The smoke test's canvas check covers the detail URL only, so Phase A adds a manual check of each of those screens.

### O6 — UI-only development config

Recommendation: **commit one new file, `vite.ui.config.ts`, and change nothing else.** No `package.json` script (it is an extra-review file); run it with `pnpm exec vite dev --config vite.ui.config.ts --host 127.0.0.1`.

Contents: `vinext({ appDir: "student" })` with no Cloudflare plugin, written as a config function that **throws when `command === "build"`**, with a header comment saying it is for local UI work only.

Why it is needed: the documented dev server puts the Worker in the request path, and `lib/student-access.mjs` L34–36 answers 503 when the Access settings are absent. The student UI needs only static files from `public/` (catalog JSON, worksheet JSON and PDF, source PDFs, the pdf.js worker) plus browser storage; it calls no API route.

Why it is isolated (each point referenced in `06`):
- It contains no authentication code and touches no Worker, Wrangler or access file.
- Vite auto-discovers only `vite.config.*`. No script, release tool or workflow passes a Vite `--config` or globs for other config files.
- With no Cloudflare plugin it specifies no Worker output, and `check:private`, `validate.sh`, the smoke run and the manifest all require `dist/server/wrangler.json`.
- The build guard stops anyone producing output from it by mistake. Without the guard, a manual `vite build --config vite.ui.config.ts` would write into `dist/`.

Residual risks: it is type-checked and linted like any other file, so it must pass both; `appDir` could drift from `vite.config.ts` (one line, noted in the comment); the dev server it starts has no `no-store` headers, admin 404s or Access identity, which is acceptable for a server bound to 127.0.0.1 and is the reason it must never be used to judge security behaviour. The throw-on-build guard has not been run yet; Phase A verifies it.

Alternative kept available: the README's simulated Access JWT, for gate-in-path testing. No helper for a local JWKS exists today, so it is more work and is not needed for UI development.

### O8 — May `research/crop-visual-review.json` drive the student viewer's default? (before Phase B)

Options: (A) yes, treat it as approved student-facing data and add it to the release inputs; (B) no, keep it out of the student bundle. Recommendation: decide with whoever maintains that file; until then B.

## Unresolved facts

- Where `worksheet-content.json`, `worksheet-fragments.pdf` and `worksheet-sources.json` are generated, and what approves an entry.
- Where `eba3977`'s `verifiedCropReviews` data comes from.
- Whether `import.meta.env.DEV` folds to `false` in the Worker build (matters only for `b5ceab5`).
- Whether client-side navigation between `/` and `/practice-builder` works under vinext 1.0.0-beta.5.
- PDF generation time for large worksheets; contrast of the nine unit colour pairs. Both are measured in Phase A or C.
- Open or merged state of pull requests 2–5 on GitHub.

## Model usage notes

Routine inventory and compilation ran on Sonnet 5.5 subagents with an explicit model override. Evidence of the model is each agent's own first-line self-report; the harness reports token counts per agent but not the model, so this is weaker than runtime metadata. Per-agent totals this session, as reported by the harness: baseline investigation about 32k tokens, preservation about 67k, system inventory about 263k. No claim is made about cost relative to running the same work on Fable.

## Next recommended task

Owner reviews the package and answers O1 and O6. Then Session 3 starts with Phase A as written in `SESSION-3-HANDOFF.md`.
