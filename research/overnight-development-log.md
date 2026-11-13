# ChemAtlas Overnight Development Log

Updated: 2026-11-08

## Completed in this work session

- Audited the current interaction architecture: the app is a single client-side page-state shell with shared navigation and nine major views; primary code is in `app/page.tsx`, styling in `app/globals.css`.
- Researched official Apple HIG and WWDC fluid-interface guidance, Material Design motion guidance, Nielsen Norman Group microinteraction/motion guidance, and W3C WCAG 2.2 motion/focus guidance. The concise decisions and page audit are recorded in `research/interaction-design-audit.md`.
- Added shared motion/easing tokens, consistent button press/focus feedback, restrained card transitions, reduced-motion behavior, and removed the scale effect on dense question rows.
- Added a conditional one-click Clear filters action in the question bank.
- Added accessible current-page states to primary navigation; live result count; pressed states for image modes, source-page selection, and self-check; and progressbar semantics to practice progress.
- Preserved underlying question records, mappings, references, and local progress logic in these UI changes.

## PDF/source audit work already identified

- Compiled mega-bank source has 2,159 pages. Two visually verified 2020 sample FRQs on original pages 113–118 were missing and are now indexed, bringing the catalog to 1,631 records referencing 915 original pages. The remaining 1,244 pages are unlinked; that is not a verified missing-question count.
- A full-text extraction pass and OCR sample show the unlinked pages mix question prompts, continuation pages, references, scoring/answer material, instructions, scans, and unrelated/support matter. Pattern totals are preliminary and must not be represented as confirmed classifications.
- Pages 113–118 were confirmed as 2020 Exam Sample Questions 1 and 2 using page images and OCR. Both FRQs have now been added with part-level topic maps and full-page source fallback. The 2017 MCQ Q9 still appears to be one page later than its record mapping; an unlinked 1994 MCQ page 617 contains questions 52–58 in a form/version that may differ from nearby catalog references.
- The 2014 practice exam section appears to have potential gaps around questions 17, 24, and 28, plus a possible missing FRQ 1 on pages 200–201. These need record-by-record validation against the printed pages before changing catalog data.
- A durable 1,243-row page triage inventory now records text/OCR excerpts, rule labels, and visual-verification status. The heuristic labels are not confirmed dispositions; the remaining pages require visual review.

## Validation status

- `npm run build`: passed after the shared interaction system and again after the PDF viewer rewrite.
- `git diff --check`: passed after each implementation phase.
- `npm run lint`: reports two existing `react-hooks/set-state-in-effect` errors in local-storage hydration and result-page reset effects in `app/page.tsx`, plus five `no-this-alias` errors in the checked-in minified PDF worker. The changed PDF viewer has no lint error. Existing warnings remain in the app and font loading.
- A local runtime HTTP smoke check passed before the PDF rewrite. The post-rewrite local Worker could not start: Wrangler reports `uv_interface_addresses returned Unknown system error 1` in this environment. The published deployment status is `succeeded`; opening the private site in the available browser reached a sign-in wall, so authenticated visual QA could not be completed here.
- Playwright is installed but its Chromium binary is not available in this execution environment. Canvas behavior and viewport-specific visuals therefore remain unverified in a real browser.
- The standalone `_ap2005_frq_chemistry_45689-merged.pdf` and compiled bank both have 2,159 pages. Rendering original pages 6–14 at 110 dpi produced pixel-identical images for all nine pages. Page 7 also matched pixel-for-pixel at 150 dpi. The standalone file is larger (104 MB vs 54 MB) but offers no visible quality gain for these FRQs, so existing source references remain intact.
- PDF.js uses direct PDF rendering instead of the previous low-scale intermediary canvas. The viewer now supports a source-region crop with 10-point padding (and full-page fallback when no reliable crop exists), fit width/page, physical actual size, zoom buttons, Ctrl/Cmd-wheel zoom, document panning, fullscreen, and a collapsible classification panel. Rendering is capped to a 24-megapixel canvas budget and 2.25 device-pixel ratio to avoid excessive canvas memory use.
- The `PdfQuestionPage` renderer is reused by question detail, practice, and source-page audit. The viewer code itself preserves existing source assets, question mappings, and local progress data.
- After visual inspection of the 2020 sample FRQs, two genuinely missing question records were added from scanned source pages 113–118. Page totals, topic-level classifications, and the unlinked-page inventory were updated; no existing question or progress record was altered. The source review and topic rationale are in `research/2020-sample-frq-audit.md`.
- Interaction-system commit `bd8f7f72e55bb6a79b3454e72538a6c0787366b4` was published before the viewer work. PDF viewer commit `ee2a49c2a14612f20e551c77cdb4bdc222a9cf70` was then published successfully as deployment `appgdep_6af01455b6a48191a6d53fb2b6dc9836` at the existing ChemAtlas URL.

## Remaining priorities

1. Obtain an authenticated browser surface or equivalent screenshot test access so fit/zoom/crop/fullscreen, keyboard, and responsive behavior can be visually exercised. The current deploy is owner-private and browser QA reached a sign-in wall.
2. Validate representative MCQ, multi-page FRQ, equation/charge, and graph/table pages in a real browser. Current code compiles, but canvas interaction has not yet been exercised end-to-end.
3. Continue the durable page-by-page source inventory, marking evidence separately from heuristic classifications and linking verified missing records only when source pages support them. The 1,243 unlinked pages remain an open audit, not a count of confirmed missing questions.
4. Revisit the apparent 2017 MCQ mapping offset, 1994 form/version, and 2014 practice-exam gaps with source-image verification before changing catalog records. The 2013 question-number gaps in the bank are explicitly marked as removed from the new course, and the source pages omit their prompts; no content was reconstructed.


## Verified 2008 MCQ omissions (Nov 8)

A page-level audit missed omitted questions that shared pages already referenced by other records. I compared the 2008 Version A exam sequence (compiled PDF pp. 29–45) against question numbers 1–75, visually checked each omitted prompt and any diagrams, and checked the 2008 answer key/diagnostic guide on pp. 47–50. Added 16 missing records: Questions 18, 26, 30, 34, 35, 41, 44, 45, 50, 55, 57, 59, 61, 65, 67, and 73. The 2020 sample FRQ additions had already raised the catalog by two. At this audit stage the catalog contained 1,647 records. The 2008 set now covers all 75 question numbers. The guide cross-checks Q41 as stoichiometry; its answer key says E, but answers are not stored in the catalog. Q61 is kept in legacy because organic functional-group identification is outside the current CED. Full source pages are shown for the new items until precise crops are reviewed.

The page audit now shows 1,243 unreferenced pages; this count is not a proxy for missing questions. Fifteen of these 16 recovered 2008 MCQs lived on pages already linked by neighboring question records. Further audit must compare question-number coverage and visual content within already-linked pages as well as review unlinked pages.


## Current source release

The catalog build passed after the verified 2008 additions. Record integrity checks at that release confirmed unique IDs, valid topic references, aligned page-audit JSON, 1,647 records, and complete 2008 question coverage (1–75). Commit `ecbaf7ea2cb8ef49dc62f5ba42aa12c9becf5288` was published as deployment `appgdep_6af018b0f27881919bc2308b6d000828`; the final audit-log update was published as `1ff69b479fe0ee2e5f459d77e4f40a41f8857154`, deployment `appgdep_6af019623a948191967c0c044a337e4f`.

A subsequent visual audit found and added the 2014 practice-exam FRQ 1 from pages 200–201, plus missing MCQs 17, 24, and 28 from its MCQ sequence (pages 179, 180, and 183). The MCQ set pages 172–197 now have a complete 1–60 question sequence. The FRQ includes a conductivity graph and continued subparts; it is mapped primarily to 8.5 with part-level maps for net ionic reactions, stoichiometry, and solubility equilibrium. The MCQ additions cover titration endpoint error, reaction mechanisms/rate laws, and AgCl solubility with a particle diagram. The catalog now has 1,651 records and references 919 source pages; 1,240 pages remain unlinked and unverified. Build and data-integrity checks passed; this latest addition is ready for its production release. Browser visual testing remains blocked by the owner sign-in wall; build and data assertions are verified instead.
