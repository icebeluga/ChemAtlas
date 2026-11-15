# Session 3 handoff: implementation assignment

For the engineer or agent who implements the redesign. You should not need to rediscover the codebase: `01-existing-system.md` maps it with `path:line`, `02-architecture.md` says what to build, `03-risks-and-roadmap.md` says in what order and how it is accepted, `04` lists the fate of every existing control, `05` lists the tests.

**Do not start until the owner has authorized Session 3 and answered O1 and O6 in `PROGRESS.md`.** This document assumes the recommended answers (O1 option A, O6 commit the config). If the owner chose differently, adjust tasks A4 and A7 and nothing else.

## 1. Ground rules

- Work only in the worktree `../ChemAtlas-redesign`, branch `feature/student-ui-redesign`, based on `origin/main` @ `4f965e32ffaa3b6bce8ab6f99b22fe42643fce16`.
- No push, merge, rebase, force operation or deployment without the owner's explicit instruction. Local commits are fine: one logical change per commit.
- No new dependencies. No changes to `package.json` or `pnpm-lock.yaml`.
- Never edit: `public/**` data and PDFs, `app/admin/**`, `app/api/admin/**`, `db/**`, `drizzle/**`, `lib/question-review-*`, `lib/cloudflare-access.mjs`, `lib/student-access.mjs`, `worker/**`, `wrangler*.jsonc`, `.github/**`, `scripts/assert-student-private-config.mjs`, `research/**`. Full list: `02-architecture.md` section 8.1.
- Extra-review files (say so in the commit message and the report): `lib/worksheet*.ts`, `app/navigation.mjs`, `app/globals.css`, `scripts/release/smoke.cjs`.
- Do not merge or cherry-pick `b5ceab5` (it contains a dev-mode authentication skip in `worker/index.ts`).
- `design-previews/` is ignored by the shared exclude file; use `git add -f` for changes there. Treat the prototype as a visual reference only; where it disagrees with `02-architecture.md` section 2, the architecture wins.
- Follow the repository's `AGENTS.md`. Report the branch, full final commit SHA and check results when done.
- A passing build or type check is not verification. Each acceptance item needs the evidence named in `05-test-and-acceptance-plan.md`.

## 2. Setup

```
cd ../ChemAtlas-redesign
corepack enable
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm run build
pnpm run check:private
```

Record the results before changing anything; that is the baseline. If any of these fail on the untouched branch, stop and report.

Local UI: the documented dev server runs the Worker, which refuses requests without Cloudflare Access settings. For UI work use the UI-only config (task A7). Do not change the gate.

## 3. First assignment: Phase A — Foundation, with no visible change

Goal: create the seams the redesign needs while the rendered UI stays identical. The release smoke test (`scripts/release/smoke.cjs`) must pass **unmodified** at the end.

Line numbers below are from `01-existing-system.md`; confirm them there before editing.

### A1. `lib/question-filter.ts` (new, pure)

Extract the predicate that exists twice: `filteredQuestions` in `components/student-app.tsx` (about L320–326) and `candidates` in `components/practice-builder.tsx` (about L96–108).

```ts
export type QuestionFilters = { unit: string; topic: string; type: "all" | "MCQ" | "FRQ"; year: string; reviewedOnly: boolean; query: string; statuses: readonly string[] };
export function filterQuestions<Q>(questions: Q[], unitOfTopic: (topicId: string) => string | undefined, filters: QuestionFilters, hasReviewedLayout: (id: string) => boolean): Q[];
```

Rules, unchanged from today: unit and topic match **any** entry of `relatedTopics`; unit is derived from the topic id, never from `primaryUnit`; search is a case-insensitive substring over the fields each screen uses today (keep both field lists working; do not merge them in this phase). Replace both inline predicates with calls to it, and route the third copy of the rule in `startSession` (`student-app.tsx` about L341–352) through it as well. The builder keeps its extra filters by composing on top. Do not add the topic code to search in this phase; that is Phase B.

Tests (`tests/question-filter.test.mjs`, proposed): for a table of filter combinations, the function returns the same ids as the old inline code did (capture expected ids from the current code before changing it); any-related rule; a record with a stale `primaryUnit` is still found under the unit of its topic.

### A2. `components/student/hooks/use-catalog.ts` (new, lifted)

Move, without changing behaviour, the catalog fetch, the saved-state merge and the `topics` and `questions` memos from `components/student-app.tsx` (about L239–287), including user topic overrides and user-bank questions from `localStorage["apchem-studio-v2"]`. Return what `ChemAtlas` uses today. Add derived per-topic and per-unit counts of classified questions (any-related rule; unit count is distinct questions).

Tests: counts equal 735 classified, 366 with more than one related topic, 210 spanning more than one unit, against the real `public/student-questions.json`; an override moves a question as it does today.

### A3. `components/student/hooks/use-worksheets.ts` (new, lifted)

Move the worksheet load, zod validation, legacy id-array migration (`chematlas-student-worksheet-v1`) and `saveWorksheets` out of `components/student-app.tsx`, and the draft mutations and single-level undo out of `components/practice-builder.tsx`, behind the API in `02-architecture.md` section 5.1. All mutations call the existing helpers in `lib/worksheet.ts`. Storage key stays `chematlas-worksheets-v1`; the schema is not changed.

New behaviour, the only additions:
- a `storage` event listener that re-reads when another tab or route writes the key;
- if stored data fails validation, copy the raw string to `chematlas-worksheets-v1.recovery` before starting fresh, and expose `status: "recovered"`;
- if storage throws, continue in memory and expose `status: "memory-only"`.

`ChemAtlas` and `PracticeBuilder` consume the hook; `PracticeBuilder` keeps its current props shape in this phase if that is less risky (pass hook results through).

Tests (`tests/use-worksheets.test.mjs`, proposed; test the pure reducer functions if hooks cannot run under `node --test`): every mutation; 500-entry and 100-draft limits; duplicate add is a no-op; legacy key migration; invalid data is preserved under the recovery key and never overwritten; a round trip of a realistic multi-draft backup is byte-identical.

### A4. `components/student/pdf-question-page.tsx` (moved)

Move `PdfQuestionPage` and its helpers (about L77–134 plus the IndexedDB helpers it needs) out of `components/student-app.tsx` unchanged. Then, under O1 option A, port the viewer improvements from commit `eba3977` on `fix/local-workers-runtime` into it as a separate commit: zoom, fit width, fit page, 1:1, fullscreen, ref-counted PDF cache, 16-megapixel cap, refit on resize, loading state, stale-canvas hiding. Do **not** port that commit's detail-page layout, and do not port the `verifiedCropReviews` default-crop policy or import `research/crop-visual-review.json` (owner decision O8; keep today's default). Port by hand, not by cherry-pick: the commit mixes viewer and layout. Put the `.viewer-*` rules in the student stylesheet without the `--dv-*` tokens, use the existing `sourcePageLocation` in `lib/question-source.ts` instead of the branch's `segmentSource`, and keep `onScale` a stable callback. `06-o1-o6-investigation.md` lists the hunks by category. After the port, check by hand that practice sessions, the session print view, the audit view and the builder's source preview still draw. Credit the original commit in the message. Do not modify the source branch.

### A5. `components/student/hooks/use-export-data.ts` (new, lifted)

Move the lazy loading of `worksheet-content.json` and `worksheet-sources.json` out of `components/practice-builder.tsx`. Expose `hasReviewedLayout(id)`. Loading failures must surface as an error state, not as empty data. In this phase only expose the error; the current builder's silent fallback (`practice-builder.tsx` L56–58) is replaced with a visible error and Retry in Phase C (`02-architecture.md` section 10, item 13).

### A6. Tokens and fonts (loaded, not yet used)

- `app/student-tokens.css` (new): the tokens from `design-previews/v2/app.css` `:root` and the nine `[data-u]` unit colours, scoped under the student shell class so nothing leaks into the review dashboard. Do not edit `app/globals.css`. Drop the `--doc` font token.
- Self-host Bricolage Grotesque and Atkinson Hyperlegible Next as variable woff2 in `public/fonts/`, with `font-display: swap` and system fallbacks. Check each font's licence file is included.
- `scripts/check-token-contrast.mjs` (new): computes contrast for each unit's deep-on-tint, white-on-deep and deep-on-white pairs; fails under 4.5:1 for text pairs. If pairs fail, adjust lightness only and report the changes. Add `tests/token-contrast.test.mjs`, a thin wrapper, so `pnpm test` runs it.

### A7. Dev config and navigation spike

- Add `vite.ui.config.ts` only (no `package.json` script): the student app without the Worker, as a config function that throws when `command === "build"`, with a header comment that it is for local UI work only. The proposed content is in `06-o1-o6-investigation.md`. Run it with `pnpm exec vite dev --config vite.ui.config.ts --host 127.0.0.1`. Verify: the dev server starts and serves the app; `pnpm exec vite build --config vite.ui.config.ts` refuses; `pnpm run check`, `pnpm run build` and `check:private` are unaffected.
- Spike, time-boxed to 30 minutes: can the top navigation move between `/` and `/practice-builder` client-side under vinext without a full reload? Report yes or no with evidence. Do not ship it in this phase.

### Phase A acceptance

1. `pnpm run check`, `pnpm test`, `pnpm run build`, `pnpm run check:private` pass.
2. The release smoke run passes with `scripts/release/smoke.cjs` unmodified.
3. Rendered HTML of the smoke URLs is identical before and after, or every difference is explained.
4. New unit tests pass: filter equivalence, catalog counts, worksheet state (including recovery), token contrast.
5. Manually, in the UI-only dev server: an existing worksheet draft created before the change still opens with its order, format and per-entry settings; a topic override still applies; a question image still draws; the builder still generates and previews a PDF.
6. `git diff --stat 4f965e3 HEAD -- public worker wrangler.student.jsonc wrangler.private-review.jsonc app/admin app/api db drizzle .github` is empty.

### Report at the end of Phase A

Branch and full commit SHA; the list of commits; check and test output; the smoke result; the navigation spike result; measured contrast pairs; anything in the architecture that turned out wrong; and nothing pushed.

Then stop for owner review before Phase B.

## 4. After Phase A

Phases B–E are specified in `03-risks-and-roadmap.md` with scope, files, risks and acceptance. The owner decisions each needs: O4 before C; O2 and O3 before D.

## 5. Suggested division of work

| Work | Suggested model or agent |
|---|---|
| A1–A3, A5–A7: mechanical extraction from this spec | Sonnet (`frontend-implementer`), or Codex |
| A4: porting the viewer from `eba3977` | Sonnet, with a careful diff review |
| Reviewing the hook API, storage-failure behaviour, and later the `planExport` extraction | Opus or Fable |
| Interaction and screenshot checks | `verification-assistant` (Sonnet), using a script adapted from `design-previews/v2/check.mjs` |
| Screen-reader and real-device checks | A person |
