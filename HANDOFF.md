# ChemAtlas — Codex continuation handoff

## Latest update — adaptive unit/topic navigation (November 20, 2026)

This round starts from the clean `2054ef4cdccccdeab96a08726717a83a9e9fe59a` candidate on the same `codex/student-ui-improvements` branch and draft PR #9. The approved main baseline remains `b05c06eaf113a91edcf95f3eea50dc4dec738492`. The owner's latest requirements add a compact Focus Mode and a temporary navigation browser; they supersede older instructions about the navigation always occupying permanent layout. The horizontal unit accordion itself is preserved.

- Four states: initial compact unit row (no topics); selected unit with its existing two topic rows; automatic Focus Mode after choosing a topic (or manual “Focus on this unit”); non-modal overlay browser opened from Focus Mode.
- Focus Mode replaces the bars with a 48 px breadcrumb row under the app bar: Browse, interactive unit/topic path and a centered double-chevron reveal handle. The selected unit supplies a subtle color accent. The original bars retract upward using the existing 280 ms motion token; the list and PDF occupy the reclaimed space without a reserved blank container.
- `components/student/bank/course-navigation.tsx` now owns the navigation UI, reusing the original card markup/counts/density/colors, topic balancing and horizontal hover controller. `CourseCards` has only one rendered location at a time: inline or overlay. Navigation visibility (`manuallyFocused` in the bank and controlled browser-open state) remains separate from the existing unit/topic filter values.
- Already-installed Base UI Collapsible/Popover primitives provide animated disclosure, multiple triggers, non-modal outside/Escape dismissal and focus restoration. The overlay anchors below the compact row, uses a light surface/border/shadow, fits the viewport and scrolls independently, with no backdrop. Opening/dismissing cannot change the workspace geometry or remount/reload the PDF.
- Unit selection in the browser uses the existing filter callback and keeps the panel open. Topic selection applies that filter and closes it. “All Unit N questions” provides whole-unit study in Focus Mode. The old phone topic sheet remains available while browsing inline; the overlay presents the same topic cards as a touch-friendly vertical list.
- Mobile Focus Mode keeps the compact navigation above the question pane so it remains usable while reading a PDF. Escape from the browser dismisses only the browser, not the phone question pane. Full unit/topic names remain available in accessible labels and title text when compact phone breadcrumbs ellipsize.
- Do not add a separate catalog, filter engine, preview topic selection, hover selection, new dependencies, auth changes or deployment changes. Optional pinning and pull-down gestures were deliberately omitted from the core implementation. No reference images actually arrived in this request; the detailed written brief and existing design were used rather than claiming a pixel-perfect image match.
- Local production-build coverage: 23 Pages scenarios passed, including four new adaptive cases. These prove >40 px desktop height reclamation, one navigation tree, fixed workspace bounds, all triggers/dismissal paths, entire-unit study, responsive fit at 1440/1280/768/844×390/650×360/390/320, mobile pane access, normal-motion collapse and repeated toggles. A narrow-landscape regression caps the panel at the space below its anchor (rather than allowing collision handling to slide it over the breadcrumb); the close header remains sticky during internal scrolling. Existing bank/builder Back/Forward coverage is retained. Unit/topic filters intentionally replace the current history entry, as before; do not change that contract to satisfy a new test.
- The signed Worker phone multipage Fit page regression asserts usable viewport space and actual canvas fit/no overflow. Its former >300 px height assumed navigation was hidden entirely; Focus Mode intentionally keeps a 48 px breadcrumb above the pane, and platform font metrics vary. Do not remove the breadcrumb or change the PDF renderer to satisfy that obsolete threshold.
- Preservation checks compare the actual canvas/viewport nodes, current question, zoom, full-page/crop mode, PDF/list scroll, filters, worksheet and URL through open/dismiss. They also assert zero protected-content reloads. Original horizontal hover and all nine units/topic rows remain covered.
- Latest local evidence uses `outputs/adaptive-*.log`, `test-results/pages/adaptive-{1-initial,2-unit,3-focus,4-overlay}.png`, `adaptive-overlay-{phone,landscape}.png`, and the final preview recording/screenshots under `outputs/`. Old accordion/wave-only recordings are historical. Keep question/PDF evidence ignored and local.
- Run exact-head required CI and inspect the actual restored preview before the final handoff. Never merge/deploy or modify production authentication/data as part of this work. Obtain the final branch SHA and preview receipt live; historical SHA/PID snapshots below do not track this new candidate.

## Current interaction update — horizontal accordion (November 20, 2026)

The owner resumed this branch from `281efd16bc5dd31b66d298c4a0fd8e42cba573ef` after changing accounts. The new explicit requirements **supersede all vertical-wave and floating-stage instructions below**. Other PR #9 requirements and release/security boundaries still apply. See the latest PR #9 head and CI for the current application SHA; the older `e1bdc75…` validation is historical.

- The unit row is now a horizontal animated accordion. Real buttons redistribute a fixed horizontal space budget; there are no popover faces, overlapping blocks, elevation, vertical scaling or vertical translation.
- Entry records the existing row/card height and freezes it throughout hover. Width changes do not move the navigation header, topic rows, question panel or PDF. All cards retain exactly the same top/bottom alignment and 4 px gaps.
- The active unit expands toward a restrained ~240 px target; space is borrowed from both sides for centered interior growth, with the nearest donors weighted most strongly. Donors retain at least 48–56 px for identifiable numbers/counts and decorative bars. Edge cards grow inward within the existing row boundaries. Widths always share the original total budget.
- The existing one-frame-loop damping is reused (quarter of the fast token). Widths of real buttons/click targets are updated together; content moves with those buttons. This necessarily performs local horizontal layout, replacing the old transform-only overlay's zero-layout performance claim. Profile the current implementation rather than reusing wave timings.
- Pointer retargeting happens only on actual coordinate changes, using the currently displayed button geometry with a 2 px boundary tolerance. Resizing does not itself retarget. Holding a stationary cursor cannot cause cards to expand/contract into a hover feedback loop.
- Full names appear within the fixed height, alongside numbers/counts and the original topic bars. Compressed counts slide under numbers continuously. Original palette, dark active background, rounded corners and typography are retained.
- Hover changes no selection, unit/topic filters or question results. Clicks select the actual on-screen button, including during animation. Exit returns to resting dimensions. Keyboard focus and reduced motion use immediate layouts; smaller-screen behavior remains intact.
- The controller is still `components/student/bank/unit-highlight.ts`, now exporting `connectUnitAccordion` / `resetUnitAccordion`. The old `connectUnitWave` and top-layer `.ca-unit-wave-stage` have been removed. Relevant CSS lives under `.ca-units[data-accordion]`. The final two `tests/pages.browser.mjs` cases cover the horizontal contract, stationary hold, no overlap, constant heights, rapid sweeps/reversals and click behavior.
- Current local evidence uses `outputs/accordion-*.log`, `test-results/pages/unit-accordion-u{1,4,9}-{1440,1280}.png`, and the current local preview. Older wave/folder-tab recordings describe superseded behavior. Keep source-question screenshots local/ignored.
- Continue existing draft PR #9. No merge, deployment, production authentication or data changes are authorized. The running helper/artifact must be deliberately refreshed and stamped with the newly validated application commit before final handoff.

The remainder of this file is the earlier comprehensive architecture/history/reproduction handoff. Its earlier application SHA, preview PID and motion measurements are snapshots, not the current moving branch identity. Always read the current receipt and live Git/PR state.

State captured **November 20, 2026 (America/New_York)**. Read this before changing the project. This document is intended to work without the previous chat, its account connections, tool state, or browser sessions.

## 1. Immediate orientation

- Repository: <https://github.com/icebeluga/ChemAtlas>.
- Existing feature branch: **`codex/student-ui-improvements`**.
- Verified application commit: **`e1bdc75d5c95cddb886acda452255662419dd87d`**.
- Approved base and current GitHub `main`, verified when writing this handoff: **`b05c06eaf113a91edcf95f3eea50dc4dec738492`**.
- Existing **draft PR #9**: <https://github.com/icebeluga/ChemAtlas/pull/9>. It is open, unmerged, and targets `main`. Continue updating this PR; do not create a replacement PR.
- Current worktree: `C:\Users\Johnson\.codex\worktrees\student-ui-improvements\ChemAtlas-redesign`.
- Current task was only to create this handoff. **No application changes are pending or authorized by this document.** The latest unit-wave implementation is complete and awaits the owner's manual design review.
- Nothing from this UI round has been merged or deployed. No production authentication, approval records, SQL/RLS, Storage data, or release pins were changed.

### Application SHA versus this document's commit

The branch HEAD and PR head were `e1bdc75d5c95cddb886acda452255662419dd87d` immediately before this file was added. This handoff is being recorded in a **documentation-only follow-up commit**, following `AGENTS.md`. Its own commit cannot contain its own hash. Obtain the actual current documentation/branch HEAD with:

```powershell
git branch --show-current
git rev-parse HEAD
git log -1 --format='%H %s' -- HANDOFF.md
git status --short
```

The running preview intentionally remains stamped with the **verified application SHA `e1bdc75…`**, not a later Markdown-only commit. The passing CI results below apply to that exact application SHA. Check any subsequent documentation commit's checks separately; do not claim an older check validates an arbitrary newer SHA for release.

## 2. Git state, preservation, and account transition

Before creating `HANDOFF.md`, `git status --short` was empty. There were **no uncommitted application modifications**. This request adds only this Markdown file. Ignored local artifacts and a running preview exist, but are not uncommitted source changes.

This is an existing Git worktree, with shared Git metadata outside its directory. Do not treat its `.git` file as a standalone repository, delete its parent checkout, or copy the folder and expect the worktree linkage to remain valid. Use `git rev-parse --git-common-dir` to inspect the linkage if needed. Windows sandbox restrictions can require an approved escalation for Git metadata writes even though application files are writable.

The original detached checkout at `C:\Users\Johnson\.codex\worktrees\504f\ChemAtlas-redesign` remains at `0f4d826fa9a78b7f6fbe7f536fe405a60b8596f5`. Other worktrees and branches were preserved. Do not reset, clean, stash, remove, or retire their work automatically.

Other open PRs when inspected:

| PR | Branch / purpose | Boundary |
| --- | --- | --- |
| #7 | `codex/student-ui-release-controls` — production Service Auth release guard | Do not mix into the UI branch. |
| #5 | `feature/concept-classification-pipeline` — concept taxonomy/pilot | Separate work. |
| #1 | `integration/chematlas-unified` — older integration | Do not use as this UI baseline. |

For a fresh checkout on another machine, clone the repository and check out `codex/student-ui-improvements` from origin. On this machine, prefer the existing worktree. Never force the same branch into another worktree or overwrite a dirty checkout. Recheck remote PR/head/base and local status before future edits; the values in this document are a snapshot.

A different ChatGPT account may need its own GitHub and Notion connections and repository write permission. Do not copy session cookies, browser storage, OAuth tokens, Git credentials, database passwords, or service-role keys from the previous account. Use the owner's approved authentication flow. Public repository reading does not imply push/deployment authorization. Account-bound tool stores and old Codex cell/thread IDs are not required to continue.

## 3. Architecture and security boundary

### Current student architecture: GitHub Pages + Supabase

- `vite.pages.config.ts` builds a static React application from `pages/`, with base path **`/ChemAtlas/`** and output **`dist-pages/`**.
- There are real HTML entries for the main application and `/ChemAtlas/practice-builder/`, so builder reloads work on Pages. Existing query-string routes remain valid.
- `pages/main.tsx` mounts `AuthApp` and imports the existing application/student/auth styles.
- `pages/auth-app.tsx` handles sign-in, approval gating, invite/recovery password setup, loading/error recovery, and sign-out, then loads the student workspace.
- The `#student-content` adapter resolves to `lib/content-supabase.ts` for Pages and `lib/content-worker.ts` for the retained Worker build. Do not bypass this abstraction or assume the old Worker deployment is the current student architecture.
- Supabase Auth supplies the student's session. Approval is keyed by Auth UUID in `approved_users`; PostgreSQL RLS independently protects private `chematlas-content` Storage reads, including PDF range requests. Frontend approval checks are presentation, not the security boundary.
- The frontend accepts a publishable key. It must never receive an administrative/service-role key, database password, secret key, frontend allowlist bypass, or student-editable approval flag.
- Sign-out unmounts the workspace, aborts protected fetches, clears protected PDF/content caches and revokes temporary URLs. Approval is rechecked on relevant session events, periodically, and on visibility changes. Keep an accessible sign-out path.
- Personal progress and worksheet drafts intentionally persist in browser storage, including IndexedDB. Question IDs, draft schemas, legacy recovery, shared-stimulus handling and source-page fallback behavior are preserved.

### Public artifact boundary

Pages uses `publicDir: false`; its build emits only explicitly allowed public assets, including favicon files and the PDF.js worker. `scripts/pages/assert-artifact.mjs` checks the result and rejects protected data/server modules, source copies, question-text probes and secret markers. A normal current build has 15 allowed files; the stamped manual preview has 16 because of `application-sha.txt`.

Historical source PDFs/JSON remain in the repository for compatibility and fixtures. **Never copy all of `public/` into Pages.** Protect the published artifact without casually deleting repository history or changing repository visibility. Protected question screenshots, worksheet PDFs and recordings stay local/ignored; do not upload them to public GitHub or Actions artifacts. Compare IDs, not question previews, in assertion snapshots.

The existing private review Worker, its D1/R2 recovery, Sites v48 archive, historical student Worker and release controls remain independent and preserved. Worker compatibility checks are still required, even though this student implementation uses Pages.

### Historical documentation caveat

`docs/pages-supabase/README.md` and `RELEASE-HANDOFF.md` contain valuable architecture/security guidance but also historical PR #6/#8 stacking and migration instructions. Current GitHub state is PR #9 → `main` at the baseline above. Do not re-enact old stack transitions. The release handoff states that production SQL and the protected package upload were already completed: **do not apply that migration or upload the package again**. This UI round did not revalidate or alter production services.

## 4. Design authority and completed UI work

Original design authority: <https://app.notion.com/p/41de71cef6dc80f0a49cfad183658089>. The earlier implementation inspected all six embedded images. A new account must verify its own access to the document and images if it needs them. Do not assume the previous account's access carries over. No portable export of those original images is confirmed here; generated implementation screenshots are not substitutes for the authoritative references.

Later explicit owner refinements supersede conflicting details in older screenshots. Preserve ChemAtlas's identity rather than proposing a new design.

### Navigation, login, branding and viewport — completed

- Removed the More menu/catalog navigation. Practice sessions and Progress remain direct links in the Question Bank footer; old catalog-tool deep links/data were retained.
- Removed the redundant session strip; accessible Log out remains in the app bar and appropriate loading/error states.
- Implemented the supplied navy login-card design, password visibility, recovery and approval states without changing authentication requests/gates.
- Login header now shows **only “ChemAtlas” on the left and “Student access” on the right**. The vertical divider and “AP Chemistry studio” subtitle were removed. Do not redesign the rest of this page.
- Both Pages entries use the supplied PNG favicon and the title **ChemAtlas**. Preserve the historical Worker favicon. The supplied PNG SHA-256 is `12425863e18c97f11533b73f98e42930192cf17f8ee6e752ef4cb1f7c6a72677`.
- The workspace fits the viewport with independently scrollable lists, viewer and builder panes. Visually hidden labels are anchored so they do not create phantom document height. Login can scroll on short screens so all controls stay reachable.
- Normal internal bank/builder navigation preserves the document, authorization/catalog state and drafts. Browser history, Back/Forward, deep links and native modified-click behavior remain valid. Earlier local baseline bank→builder navigation was 881 ms with a new document/five data requests; an earlier revised inspection was 94 ms with the same document/two worksheet metadata requests. These are historical fixture observations, not production guarantees.

### Question Bank filters and topics — completed

- Labels are **All / MCQ / FRQ**. The “Reviewed print layout only” checkbox/filter is completely removed from this interface.
- Clear filters is beside the type/year controls, occupying the former checkbox area. It stays visible and is disabled when there is nothing to clear.
- Clear resets **year, question type, search query and shown-row pagination** (back to 100). It **retains the selected unit and topic**. Do not silently broaden its reset semantics.
- Preserve print-review statuses, information and warnings elsewhere, including Details and worksheet generation.
- Desktop topics use at most two populated rows, each filling the available width. Natural text/count widths determine the split; spare width is distributed among variable-width buttons. An independent hidden measurement avoids flex-growth feedback. Preserve pastel colors, selection, counts and compact spacing.
- All nine units were checked at 1440 and 1280, especially Units 1, 2 and 8. Preserve the existing mobile topic sheet; do not substitute desktop topic previews on hover.

### Question header, PDF and Details — completed

- Spacious desktop split is approximately **24% list / 76% viewer**. A 320 px list minimum yields **25% / 75% at 1280**; tablet widths reserve more list space.
- Complete metadata such as `2005 AP Chemistry FRQ · source page 14 · 1 of 83` stays on one line at normal desktop widths, without deleting/truncating information.
- Details shares the existing full-page/crop and worksheet-action row instead of using an empty dedicated row. It is **closed by default** and retains primary/supporting topics, part classifications and full print warnings.
- Print unreviewed opens Details directly. Escape closes it without dismissing the phone question pane. Expanded content remains reachable on short landscape viewports.
- Preserve zoom, fit width, fit page, actual size, full-page/crop, fullscreen, question/source-page navigation and add-to-worksheet actions. The PDF starts high on the page; list previews, selection, filtering and internal scrolling remain usable.
- Worksheet warnings retain source-page/adjacent-answer cautions and instructions to check subparts, figures and continuation pages. Generation/download/parsing and source PDF painting remain tested.

### Latest unit interaction: continuous wave — completed, awaiting owner feel review

Earlier independent hover blocks and then 240 ms folder-tab transitions were implemented and superseded. **Do not restore them.** The latest owner wants one interactive system, not nine independently triggered hover animations.

Current implementation:

- One cursor-proximity field drives **All and every unit**. The nearest card rises/expands most, immediately adjacent cards respond less, and motion tapers toward rest with distance.
- Movement changes **within a single button**, not only when crossing boundaries. Outgoing/incoming responses happen together, including quick sweeps and direction reversals. There are no intentional hover delays, timed per-card queues or waits for another animation to finish.
- A single frame controller damps current values toward the latest distance field, using one quarter of `--ca-fast` (about 32.5 ms). This is responsive damping, not a spring library. It caches geometry on entry, writes transforms/opacity directly and stops requesting frames once settled. There are no per-frame React updates or layout reads.
- Compact-card expanded width is **224 px instead of 264 px**; an already wider card gains 12 px. Height is at least 66 px or its original height + 6 px. Lift is **2 px instead of 6 px**. All uses smaller +8 px width/+4 px height growth.
- Growth is centered around the original card and extends upward; edge growth is smoothly clamped within an 8 px viewport margin. Numbers, counts, titles and decorative bars follow the changing geometry. Existing colors/fonts/full metadata remain.
- A single decorative native-popover top-layer stage escapes the workspace clip. Original buttons/click slots never move. Cloned visual faces are hidden from assistive technology and ignore pointer events. The strongest face is layered above neighboring faces.
- Original selection and click filtering remain intact. Hover never changes selection, results, unit/topic filters, or opens topics/previews/menus.
- Keyboard focus and reduced motion show immediate poses without a moving wave. Mouse/pen hover is gated to fine pointers and widths ≥701 px. Touch/phone behavior remains unchanged. Unsupported popover browsers retain working base controls without the enhancement.
- Resize, scrolling, metadata changes and unmount cancel pending frames and restore the real cards. Exit settles back cleanly; no stage/frame should remain after leaving the row.

## 5. Relevant files

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Mandatory project/Git/release boundaries. |
| `vite.pages.config.ts` | Pages entries/base, content adapter, public-asset allowlist, private import guard. |
| `pages/main.tsx`, `pages/index.html`, `pages/practice-builder/index.html` | Static entry mounting, title/favicon and real builder entry. |
| `pages/auth-app.tsx`, `pages/auth.css` | Approved login appearance, Auth/approval/callback/recovery flows. |
| `components/student-app.tsx` | Student workspace, view/routing/state integration. |
| `components/student/app-top-bar.tsx` | Student navigation, search and accessible sign-out. |
| `components/student/bank/question-bank.tsx` | Unit/topic/filter UI, question list/header, Details, viewer integration and wave lifecycle/click reset. |
| `components/student/bank/unit-highlight.ts` | Shared proximity field, cached visual stage, damping/frame lifecycle, keyboard/reduced-motion/fallback behavior. |
| `app/student-redesign.css` | Student tokens/palette, layout, filters, topics, PDF proportions, responsive rules and wave layers. |
| `components/student/pdf-question-page.tsx`, `components/student/pdf-bank-store.ts` | Authenticated PDF.js rendering/caching and source view. |
| `components/practice-builder.tsx` | Worksheet builder interface. |
| `components/student/hooks/use-worksheets.ts`, `components/student/hooks/worksheet-db.ts`, `components/student/hooks/worksheet-recovery.ts` | Draft state, IndexedDB transactions and recovery. |
| `components/student/hooks/use-catalog.ts`, `components/student/hooks/use-export-data.ts` | Catalog and export/source metadata loading. |
| `lib/content-supabase.ts`, `lib/content-worker.ts`, `lib/content-types.ts`, `lib/content-lifecycle.ts` | Deployment-specific content access and shared protected-content lifetime. |
| `lib/supabase-config.mjs`, `supabase/migrations/202611180001_approved_student_content.sql` | Validated client config and existing authorization policies; do not alter production casually. |
| `lib/worksheet*.ts`, `lib/worksheet.mjs`, `lib/progress-transfer.mjs` | Worksheet composition, rendering/editing and portable progress. |
| `tests/pages.browser.mjs` | 19 built-Pages browser scenarios; includes wave geometry, within-card movement, neighbors, two-frame response, sweeps/reversals, accessibility and cleanup. |
| `tests/student-redesign.browser.mjs`, `tests/student-state.browser.mjs` | Shared signed-Worker regressions/compatibility; 44 combined cases in required CI. |
| `tests/fixtures/supabase-http.mjs`, `tests/fixtures/supabase-db.mjs` | Loopback Auth/Storage protocol fixture with the actual migration in embedded PostgreSQL/RLS. |
| `scripts/pages/assert-artifact.mjs`, `scripts/pages/prepare-content.mjs`, `scripts/pages/content-manifest.mjs` | Public artifact privacy and offline protected package preparation. Preparation does not authorize upload. |
| `.github/workflows/chematlas-pages.yml` | Required Pages checks; feature PR packaging/deploy are skipped. |
| `.github/workflows/chematlas-pr-head-validation.yml` | Required exact-PR-head Worker/build/smoke/browser validation. |
| `.github/workflows/chematlas-release-validation.yml` | Separately pinned historical candidate validation; not a substitute for checking this UI head. |
| `docs/student-ui-improvements/README.md` | Detailed requirement coverage, evidence paths, earlier navigation investigation and privacy limits. |
| `docs/pages-supabase/RELEASE-HANDOFF.md`, `docs/pages-supabase/REQUIRED-CI.md`, `docs/pages-supabase/README.md` | Pages release/security procedure; reconcile historical stack details with current GitHub state. |
| `docs/stage-5/README.md` | Historical release/archive/recovery boundary. |

## 6. Validation at the verified application SHA

Both required checks passed on **`e1bdc75d5c95cddb886acda452255662419dd87d`**:

- [Pages validation](https://github.com/icebeluga/ChemAtlas/actions/runs/44682139701): TypeScript/lint, 109 Node tests, 52 Python tests, Worker compatibility build/privacy/dry run, Pages build/privacy, and **19/19 Pages browser scenarios**.
- [PR-head validation](https://github.com/icebeluga/ChemAtlas/actions/runs/44682139716): **44/44 signed browser regressions**, 109 Node tests, 52 Python tests and protected Worker smoke/build validation.
- [Historical candidate](https://github.com/icebeluga/ChemAtlas/actions/runs/44682139743) also passed, but validates its separately pinned application.
- Packaging and deployment were **skipped**. Successful validation is not merge/deployment approval.

Latest local full Pages run: **19/19 passed**. TypeScript, production build and artifact privacy passed. Lint has zero errors and four pre-existing unused-expression warnings in `design-previews/shared.js`, `design-previews/v2/app.js`, `design-previews/v2/check.mjs` and `docs/student-ui-redesign/tools/capture-screens.mjs`. Do not mix unrelated warning cleanup into UI work.

Desktop/mobile/short-screen coverage includes 1440×900, 1280×900, 768-class tablet sizes, 844×390, 390×844 and 320×600. It covers real PDF paint/fit/fullscreen/scrolling, worksheet generation/download/parsing, drafts, progress transfer, navigation/history, logout, approval denials/revocation and simulated invite/recovery protocols.

Corrected-preview warm-row Chromium sweeps/reversals measured:

| Metric | Normal CPU | 4× CPU throttle |
| --- | ---: | ---: |
| Frame callback p95 | 0.4 ms | 1.9 ms |
| Frame interval p95 | 16.8 ms | 33.4 ms |
| Steady movement layout recalculations | 0 | 0 |

These are local headless desktop measurements after stage preparation, not physical-device or production performance guarantees. Do not describe the throttled run as uniformly 60 fps.

## 7. Known issues, fixed pitfalls, and unfinished work

No outstanding reproduced application regression was left on the verified application SHA. Remaining work is owner review/approval and any subsequently requested refinements, not an undisclosed implementation TODO.

Important pitfalls already found and fixed:

1. A generic resting-layer class accidentally put the pastel sheet above the saturated sheet. Resting **content** now uses `is-rest-content`; the resting **sheet** stays at z-index 0 and the dark sheet at 1. Tests check layer order/opacity in addition to color-token contrast. Do not regress this by reusing one class for both.
2. Global reduced-motion duration rules can start tiny implicit CSS transitions even on elements that normally have none. Ready row controls and all stage content explicitly disable CSS transitions. Reduced-motion opening is checked in the same browser task, avoiding false passes from waiting until a tiny transition ends.
3. The superseded timed animation misread minified CSS `.24s` as `.24` milliseconds. The current wave uses the fast token with explicit seconds/milliseconds conversion; preserve correct units.
4. Earlier short-landscape PDF/Details clipping was fixed. Preserve internally bounded course/list controls and reachable/scrollable Details/PDF surfaces.
5. Earlier flex-grown topic measurements fed back into the two-row split; independent natural measurement fixed this. Do not measure already-stretched buttons to choose the split.

Limitations and historical test notes:

- The preview simulates Auth/email. RLS is real embedded PostgreSQL, but it is not a newly verified live Supabase/SMTP/invitation/recovery deployment.
- No physical iOS/Safari/device GPU performance claim. Hover is deliberately disabled on touch/mobile; modern native popover support gates the enhancement.
- Local overloaded-host runs occasionally timed out on PDF painting; isolated rechecks and the final full run/CI passed. Do not raise all timeouts or weaken assertions to hide a reproduced regression.
- An older local Worker UI development server timed out during compilation. Required signed browser compatibility was verified in Linux CI; those earlier local attempts were not counted as passes.
- Earlier Poppler worksheet inspection emitted Symbol/ArialUnicode font warnings without a visible defect. Existing PDF generation/rendering checks pass.
- CI browser/apt dependency setup sometimes takes several minutes. Distinguish setup delay from application test failure, and inspect completed job logs rather than changing application code to address a package-install wait.
- Historical live-hosted release gates in the Pages handoff were not repeated in this UI round. Reconcile their actual status with the owner before any separately approved release; do not reapply completed SQL/uploads.

## 8. Running preview — preserve it

Verified alive when this handoff was written:

- Browser: **<http://127.0.0.1:4173/ChemAtlas/>**.
- Fixture API: `http://127.0.0.1:54321`.
- Test login: **`approved@example.test` / `fixture-password`**.
- Unapproved denial test account: `unapproved@example.test`, same fixture password.
- Current owned process snapshot: **PID 39332**, `node.exe .sites-runtime/manual-preview.mjs`.
- Receipt: `.sites-runtime/manual-preview.json`.
- Built artifact: `.sites-runtime/manual-preview-dist/`, marker `application-sha.txt` = `e1bdc75…`.
- Runner: `.sites-runtime/manual-preview.mjs`; logs: `.stdout.log` / `.stderr.log` with the same prefix.
- Both services bind **127.0.0.1 only**. No production services are used. These are dummy fixture credentials, never production credentials.

Refresh an already-open tab after a new artifact is installed. Sign out to inspect the login page. Sign in for the bank, select a question for PDF/Details, add it to the worksheet and open Practice builder. For wave review, move within one unit, sweep across Units 1–9, reverse quickly, and check already-selected and edge units.

**Do not stop this process merely to read the handoff.** PIDs are snapshots and can be reused. Before stopping anything, verify the current receipt, its absolute artifact directory, the command line and the listening-port owner. Never kill arbitrary Node processes.

`tests/pages.browser.mjs` starts its own fixture on **the same two ports**. Do not run it while the manual preview is listening. An occupied-port attempt can appear hung. Pause only the verified owned helper when tests require the ports, then restore the preview. Vite `preview:pages` alone does not supply the simulated Auth/API service.

Read-only ownership checks before deciding whether a stop is necessary:

```powershell
$previewMeta=Get-Content .sites-runtime/manual-preview.json | ConvertFrom-Json
Get-CimInstance Win32_Process -Filter ('ProcessId='+$previewMeta.pid) |
  Select-Object ProcessId,Name,CommandLine
Get-NetTCPConnection -LocalPort 4173,54321 -State Listen |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

Only after those agree with the expected helper/artifact and the owner no longer needs it during the test run, `Stop-Process -Id $previewMeta.pid` stops that owned helper. A stale receipt is not sufficient evidence. Preserve its files and restart after testing; do not kill unrelated port owners.

## 9. Commands and reproducible local setup

Run from the repository root. Recommended CI-compatible tooling: Node **24.22.1**, pnpm **11.25.0**, Python **3.12**, PyMuPDF **1.26.6**, Tesseract OCR and Playwright **1.62.1** Chromium. The package engine allows Node ≥22.13; CI's exact version is preferable for parity. Current dependencies/tool caches exist locally, but are not guaranteed on another account/machine.

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run check
pnpm run lint
pnpm test
```

### Safe fixture production build and browser tests

Use these **local-only** values, not production credentials:

```powershell
$env:VITE_SUPABASE_URL='http://127.0.0.1:54321'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_localfixture'
$env:VITE_CHEMATLAS_CONTENT_PREFIX='shared/releases/fixture'
pnpm run build:pages
# Only after the manual helper has been safely paused:
pnpm run test:pages:browser
```

The fixture reads the existing `public/` content files and `research/stimuli.json` through authenticated local requests; it applies the migration only to embedded PostgreSQL. Do not publish those source files with the Pages shell.

### Existing manual helper

If the existing preview stopped and the correct artifact still exists, restart it without rebuilding application code:

```powershell
node .sites-runtime/manual-preview.mjs
```

This runs in the foreground; Ctrl+C closes the owned fixture. The existing runner checks its hardcoded expected SHA, currently `e1bdc75…`, against the artifact marker. Do not remove that guard just to make an unrelated artifact start. Update expected SHA/marker only deliberately after building and verifying a new application candidate.

To keep the helper available as a background process on Windows:

```powershell
$previewRoot=(Get-Location).Path
$nodePath=(Get-Command node.exe).Source
Start-Process -FilePath $nodePath `
  -ArgumentList '.sites-runtime/manual-preview.mjs' `
  -WorkingDirectory $previewRoot -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $previewRoot '.sites-runtime/manual-preview.stdout.log') `
  -RedirectStandardError (Join-Path $previewRoot '.sites-runtime/manual-preview.stderr.log')
```

Do not launch another helper if the ports are already owned by the healthy current preview. A restricted Codex shell may need normal tool escalation to start a persistent process or access shared Git metadata. Do not bypass automatic approval review.

### Recreate the helper on a fresh clone

`.sites-runtime/` is ignored and **does not travel through Git**. After the fixture build above, this minimal foreground helper recreates the same safe testing architecture using tracked fixture code:

```powershell
New-Item -ItemType Directory -Path .sites-runtime -Force | Out-Null
@'
import { startFixture } from "../tests/fixtures/supabase-http.mjs";
const fixture = await startFixture({ artifactDirectory: "dist-pages" });
console.log(JSON.stringify({ pid: process.pid, url: fixture.origin, api: fixture.api,
  mode: "loopback fixture; simulated Auth; embedded PostgreSQL RLS" }, null, 2));
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await fixture.close();
}
process.on("SIGINT", () => { void stop(); });
process.on("SIGTERM", () => { void stop(); });
'@ | Set-Content -LiteralPath .sites-runtime/handoff-preview.mjs -Encoding utf8
node .sites-runtime/handoff-preview.mjs
```

Open the same `4173/ChemAtlas/` URL. This helper deliberately uses the current built `dist-pages/`; record `git rev-parse HEAD` with any new artifact. It does not claim the historical `e1bdc75…` identity unless that is actually the source being reproduced.

For a separate persistent artifact, build to an **absolute** directory with Vite (a relative output directory resolves under `pages/`):

```powershell
$previewOutput=Join-Path (Get-Location).Path '.sites-runtime/manual-preview-dist'
pnpm exec vite build --config vite.pages.config.ts --outDir $previewOutput
```

Stamp `application-sha.txt` with the actual verified build source SHA using UTF-8 and an LF newline, then run `node scripts/pages/assert-artifact.mjs .sites-runtime/manual-preview-dist`. Do not mark a changed application as an old approved SHA. Do not recursively remove/move generated directories without first checking the resolved absolute target stays inside the intended workspace/build directory.

### Other development commands

```powershell
pnpm run dev:pages
# Or, after a Pages build, a static-only preview:
pnpm run preview:pages --port 5173 --strictPort
```

These are standard Vite commands, **not** the complete loopback fixture. Fixture CORS is configured for port 4173, so do not expect a 5173 Vite server plus the fixture API to provide the same authenticated flow. For full isolated owner review, use the built fixture helper above. A real-backend preview requires owner-authorized configuration and direct owner sign-in; do not change production Auth/redirect settings for local convenience.

Historical Worker compatibility commands (local build/dry run only):

```powershell
pnpm run build
pnpm run check:private --built
pnpm exec wrangler deploy --dry-run --config dist/server/wrangler.json
```

Do not omit `--dry-run` or substitute a production deployment command. The signed-browser release validation script is best run through the existing required Linux CI; it requires its own verification environment, not the manual Pages preview.

### Python checks on this Windows machine

Existing interpreter: `.sites-runtime/ui-python/Scripts/python.exe`. If absent on a fresh machine, create a Python 3.12 virtual environment and install PyMuPDF 1.26.6. Tesseract must be installed/available separately. UTF-8 matters; the default Windows code page caused historical failures.

Example fresh local environment setup (only if missing):

```powershell
python3.12 -m venv .sites-runtime/ui-python
& .sites-runtime/ui-python/Scripts/python.exe -m pip install PyMuPDF==1.26.6
```

```powershell
$env:PYTHONUTF8='1'
$env:PATH='C:/Program Files/Tesseract-OCR;'+$env:PATH
& .sites-runtime/ui-python/Scripts/python.exe -m unittest discover -s tests -p 'test_*.py' -v
```

The latest UI branch did not need new Python logic, but all 52 Python cases passed in exact-head CI.

## 10. Local evidence and ignored helpers

These paths exist on this worktree but **will not be present just from cloning Git**:

- `outputs/unit-wave-review.md` — latest local owner review guide.
- `outputs/unit-wave.webm` — current corrected normal/fast sweep and reversal recording.
- `outputs/unit-wave-navigation.png` — corrected compact navigation/wave capture.
- `outputs/unit-wave-performance-1x.json`, `outputs/unit-wave-performance-4x.json` — latest corrected-surface measurements. The unsuffixed `unit-wave-performance.json` is an earlier scratch receipt; prefer the suffixed files.
- `outputs/wave-browser.log`, `wave-build.log`, `wave-check.log`, `wave-lint.log`, `wave-preview-smoke.log` — relevant local receipts.
- `test-results/pages/unit-wave-u4-{1440x900,1280x900,768x900,844x390}.png`, `unit-wave-neighbors.png` — wave captures.
- `test-results/pages/filter-row-{1440,1280}.png`, `topics-u{1,2,8}-{1440,1280}.png`, `header-pdf-{1440,1280}.png`, `short-landscape-details.png`, `compact-question-phone.png`, `builder-desktop.png`, `worksheet.pdf` — earlier/current UI and PDF evidence.
- `.sites-runtime/verify-manual-preview.mjs` — final artifact marker, Auth, PDF, Details, worksheet preview/download, logout, anonymous denial and loopback-origin smoke.
- `.sites-runtime/profile-unit-wave.mjs` — optional local Chromium profile; arguments `1` or `4` select CPU throttle. Run `node .sites-runtime/profile-unit-wave.mjs 1` or `4` against an already-running preview.
- `.sites-runtime/record-unit-wave.mjs` — current motion recording helper, run with `node`; uses the already-running preview.

Old `unit-hover-*`, `folder-tabs*` screenshots/recordings and `.sites-runtime/record-folder-tabs.mjs` describe superseded interactions. Do not use them as the current design or run their old selectors against the wave implementation. Current public-safe login captures are committed under `docs/student-ui-improvements/screens/`.

Do not commit ignored evidence indiscriminately to transfer it to another account. Recreate it locally or arrange an owner-approved private transfer. The tracked fixture tests and this document are sufficient to rebuild the working preview; original images/recordings are useful context, not a deployment dependency.

## 11. Recommended continuation

1. Read `AGENTS.md`, this file, the current PR #9 description and the student UI handoff. Inspect branch, live HEAD, working tree and current GitHub main/PR state before writing anything.
2. Preserve any newer dirty files. The clean-state claim above only applies to this capture. Verify the existing preview before starting/stopping processes or rebuilding artifacts.
3. Have the owner inspect the **actual local wave**: slow/fast movement, movement within a unit, Units 3↔4 reversal, all nine units, already-selected units, edge units, 1440/1280 widths, short landscape and mobile. Do not assume a static screenshot proves motion quality.
4. Await/implement only concrete subsequent owner feedback. Do not invent another redesign or restore old independent hover animations. Keep changes scoped and reviewable on this branch and PR #9.
5. For future application changes, record the starting SHA, update the build marker/preview intentionally, run relevant local checks, inspect the actual UI, push focused commits and verify both required CI checks on the **new exact head**. Never claim historical green checks cover changed code.
6. Integration/deployment is a separate owner decision. It requires approval of a specific application SHA and validated artifact, passing required CI and the release handoff's remaining real-hosted gates. This handoff authorizes none of those production actions.

## 12. Non-negotiable constraints

- Preserve all prior PR #9 improvements and working student features. Keep the current GitHub Pages architecture; do not revert to assumptions from the old Cloudflare student deployment.
- Preserve authentication/approval/Storage security and an accessible sign-out mechanism. No frontend bypass, public bucket, service-role key, signup-policy relaxation or production data/account changes.
- No merge, deployment, production SQL/RLS execution, protected-content upload, release-pin change or repository-visibility change without separate explicit owner authorization.
- Do not reapply completed production migration/upload work. Keep student Worker code/assets compatible, the Sites v48 archive/release history intact, and private review/D1/R2 recovery independent.
- Continue **existing draft PR #9**, not a new PR; keep unrelated open PR changes out. Coordinate with the owner before sharing/rewriting a write branch. Never force-push, reset or clean away existing work as a continuation shortcut.
- Preserve the exact latest motion requirements: one continuous cursor-proximity system, coordinated neighbors, smaller centered upward growth, no hover delay/queue, no filtering/selection on hover, no topic previews/dropdowns, fixed base layout/hit targets, full metadata, mobile/reduced-motion/keyboard behavior.
- Keep protected question/PDF evidence local and ignored. Do not expose real credentials, authenticated storage exports, raw request bodies or protected question text in handoff documents, public logs or artifacts.
- Keep the preview available for the owner's manual inspection; pause only its verified owned process when the same-port automated suite requires it, and restore it afterward.
