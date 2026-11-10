# ChemAtlas — Overnight Website Recovery and UI Restoration Report

Date: 2026-11-10
Status: **UI reconstruction and URL navigation fixes implemented; browser verification is still blocked**

## A. Verified source and root cause

The currently published Site is saved version 48, sourced from `2b63a49a778459253035ec2871a84d96a31b5400`; Sites metadata reports its latest production deployment succeeded. That source SHA is absent from reachable GitHub refs, and the available Sites connector does not expose its source archive.

The supplied `ChemAtlas-work-public-ui-recovery.zip` provided a complete writable baseline for remote branch commit `7de50f03677a8a2dd0aa29b5039011b3f4d7f164`. The baseline matches the older sidebar-era design. The separate target screenshot supplied with this continuation was used as the reconstruction target.

The exact cause of the original save failure remains unknown. Evidence confirms only that version-48 provenance is not reachable from the Git refs inspected here and the current saved Site remains at version 48.

## B. Recovery and implementation results

Reconstructed the supplied target layout using existing React, TypeScript, CSS, Lucide icons, and catalog data:

- Replaced the fixed sidebar with horizontal navigation for Browse by Unit, Question Bank, Practice Builder, and an expandable Tools menu.
- Rebuilt Browse by Unit with the target banner hierarchy, four dynamic catalog statistic cards, and responsive nine-unit cards with distinct accent colors and icons.
- Connected each unit card to the existing filtered Question Bank view.
- Added a functional Practice Builder view using existing unit/topic/type filters, real classified questions, and the existing PDF-based session flow.
- Made page views and Question Bank filters URL-backed. `?view=library` opens the catalog; unit, topic, type, and search selections are shareable; detail routes carry stable question IDs; practice URLs carry a bounded question queue and step. Route transitions use browser history, and Back/Forward is wired through `popstate`.
- Added previous/next navigation for question details and previous/next controls for practice sessions.
- Preserved existing Question Bank searching, topic filters, question detail navigation, multi-page PDF rendering, progress, review, source audit, and bank management views.
- Kept displayed totals data-driven. No 1,651 total was hardcoded and no questions were invented.

The supplied public catalog has 1,542 records: 1,285 MCQs and 257 FRQs. The desired screenshot shows 1,651 (1,327 MCQs and 324 FRQs). The 109 screenshot-only records are not present in either inspected Git catalog; their IDs and source mappings remain unknown.

## C. Technology and implementation

Inspected package versions: React 19.2.6, TypeScript 5.9.3, Vinext 1.0.0-beta.5, Vite 8.0.13, Tailwind CSS 4.2.1, PDF.js 6.4.299. No new framework or dependency was added.

The Sites workflow instructions were used to try the supported managed preview. A React best-practices review was applied to the changed page. UI work uses data-driven React rendering, CSS Grid/Flexbox, responsive breakpoints, semantic buttons/navigation, visible focus states, installed Lucide icons, `useSyncExternalStore` for URL state, and native History API `pushState`/`replaceState` transitions.

## D. Visual comparison

The implementation follows the target screenshot’s horizontal header, pale green page surface, four color-accented statistics, three-column unit grid, typography hierarchy, and unit-card structure. No development screenshot was captured, so visual accuracy is not verified. The supported managed preview refused to start because a Vinext dev server was already running for this checkout (PID 19); this session did not attempt a second local Chromium/Wrangler setup. Desktop/tablet/mobile rendering and real browser interaction remain unverified.

To review locally, clone the branch and start the existing development command:

```bash
git clone --branch work/public-ui-recovery https://github.com/icebeluga/ChemAtlas.git
cd ChemAtlas
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Vite, first with `?view=library`, then test `?view=library&unit=u3`, question details, Practice Builder, and narrow-screen navigation. Browser-based Back/Forward, menus, PDF rendering, keyboard focus, and viewport comparisons still require a browser session.

## E. Question catalog reconciliation

`tests/public-catalog-integrity.test.mjs` checks unique IDs, question type totals against persisted statistics, valid curriculum associations, positive source-page references, and bundled PDF mappings. `tests/navigation.test.mjs` exercises deep-link parsing, filter encoding, detail-return URLs, and bounded practice-session URL state. No catalog data was modified.

The detailed ID-level comparison and integration notes are in [the separate catalog compatibility report](catalog-compatibility.md).

The two Git catalogs have the same 1,542 unique IDs, with no additions or removals. The private-review branch reclassifies 19 existing IDs from MCQ to FRQ; it also extends source pages for two records (`mcq-2022-2-1657`: page 1657 → 1657–1658; `mcq-2022-3-1659`: page 1659 → 1659–1661). Unit/topic associations and the eight source PDF path/range/byte mappings match. The private catalog adds an optional `stimulusIds` field to 17 records, associating the 2008 MCQ stimulus groups; this field is absent from the public catalog. Public totals are 1,285 MCQ / 257 FRQ; private totals are 1,266 MCQ / 276 FRQ. Duplicate-ID checks pass for both catalogs. The screenshot totals imply 42 more MCQ and 67 more FRQ than the public catalog, but those records cannot be identified from aggregate counts.

## F. Test results

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm exec tsc --noEmit` | Pass after URL-navigation changes |
| `pnpm build` | Pass; Vinext emitted its route-classification advisory |
| `node --test tests/navigation.test.mjs tests/public-catalog-integrity.test.mjs` | Pass: 10 tests, 0 failures |
| Focused ESLint with the existing `react-hooks/set-state-in-effect` error disabled | Exit 0; three existing PDF-rendering effect dependency warnings remain |
| Focused ESLint with all rules enabled | One `react-hooks/set-state-in-effect` error remains in the existing local-storage hydration effect, plus three PDF-rendering effect dependency warnings |
| Browser interaction, screenshots, responsive viewports | Not run: managed preview was blocked by the existing Vinext dev server. |

## G. GitHub checkpoints

Remote branch `work/public-ui-recovery` was verified at `c2d6b83366d03b1ce76e0d9691e239f345bb5517` before this pass. The verification checkpoint added the URL helper (`ba4f773be1457b92e61053f8503e1843b5d1add6`), navigation tests (`cfbe74dfb7d3d977a2fb83df00f8ae22883f2a42`), URL-backed application routes (`f53e5a9b1a9d1123b76a8759d7d335aee1c1583a`), and question-step styles (`08747bf2a0a5b9573268b44f40dff0db65b0ccfc`). The verified code checkpoint is `08747bf2a0a5b9573268b44f40dff0db65b0ccfc`; this report update follows it.

## H. Deployment preparation

No Site save or deployment was performed. Read-only Sites metadata confirms version 48 (`2b63a49a778459253035ec2871a84d96a31b5400`) is the latest saved version and its production deployment succeeded. Its saved version ID is `appgprj_6aef507724448191a521d9deccde9f2f~appgver_3308e2dab7c48191ac91ef0ca7915a9f`.

The supported Sites workflow is to push source to the Site's configured remote branch, save a version using that exact pushed commit and its packaged archive, then deploy the returned saved-version ID. The deployment operation publishes to production. The Site metadata available here did not expose a bound repository/branch or write credential, so the recovered branch cannot yet be shown to satisfy the save-version precondition. After compatibility review and approval, first establish the Site's configured source, push the exact reviewed commit there, package the source build as required by its hosting configuration, save it, and deploy only the returned version ID. For rollback, deploy the saved version-48 ID above through the same deployment operation. The rollback path is identified but was not exercised.

The reconstruction is not ready for production approval: browser visual and interaction verification is outstanding, and 109 screenshot-listed records are not represented by the available catalog. No Site save, publication, or rollback was performed.

## I. Unresolved issues

Blocking review readiness:
- Browser visual and interaction verification could not run because the supported preview launcher found an already running Vinext server.
- 109 screenshot-listed records are absent from the available public and private Git catalogs; their IDs and sources are unknown.

Unverified:
- Responsive behavior at 1440×900, 1024×768, and 390×844.
- Browser Back/Forward, keyboard traversal, menu behavior, unit-card selection, filtering, MCQ/FRQ detail controls, multi-page PDF rendering, and practice-session interactions.
- Original version-48 source and the original save-failure cause.

## Parallel Task Compatibility

- Branch: `work/public-ui-recovery`; verified code checkpoint `08747bf2a0a5b9573268b44f40dff0db65b0ccfc`; the report commit follows this checkpoint.
- Private branch head checked: `1f583294930c08a81b9bd92aa0eed3d0a1102dc5`. Its `app/page.tsx` adds an approved-image state and calls `/api/admin/question-review`; this recovery page has no private API calls. Its `app/globals.css` adds `.qiv-*` review workspace styles alongside the shared public styles. Its `package.json` adds two private review test scripts. Preserve those private-only changes on their branch.
- No private-review routes, APIs, admin UI, D1/R2 configuration, or Cloudflare resources were changed or copied in this work. Public URLs remain the catalog routes only; the URL helper does not create or expose admin endpoints.
- Public catalog data and API interfaces were not modified. The private branch has the same stable IDs but changes 19 question type labels, extends page spans for two records, and adds 17 `stimulusIds` associations; those private catalog edits remain isolated and must not be overwritten by this branch.
- Compatibility risk: `app/page.tsx` has direct route/state differences, and `app/globals.css` must retain both target-public styles and private `.qiv-*` styles if later combined. Compare shared files and catalog schema line by line after both branches are complete. Recommended order: finish/test each branch independently, preserve private routes/API/Access, perform a dedicated file-level compatibility review, then consider integration only after explicit approval.

## Safety boundary

GitHub `main`, the original published Site, `work/private-review-deployment`, and private-review Cloudflare resources were not modified. No merge, cherry-pick, data deletion, new question, or production deployment occurred.
