# Redesign progress and decision log

Running record for the ChemAtlas student UI redesign. Newest state first. Read this before anything else in the folder.

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
