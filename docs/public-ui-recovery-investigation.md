# ChemAtlas — Overnight Website Recovery and UI Restoration Report

Date: 2026-11-10
Status: **UI reconstruction implemented and checkpointed; browser visual verification is blocked**

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
- Preserved existing Question Bank searching, topic filters, question detail navigation, multi-page PDF rendering, progress, review, source audit, and bank management views.
- Kept displayed totals data-driven. No 1,651 total was hardcoded and no questions were invented.

The catalog on the supplied source branch contains 1,542 records: 1,285 MCQs, 257 FRQs, and 91 curriculum topics. The target screenshot displays 1,651 records (1,327 MCQs, 324 FRQs). The missing 109 records are not present in the supplied branch archive; the discrepancy is unresolved and the target counts are not represented as restored data.

## C. Technology and implementation

Inspected package versions: React 19.2.6, TypeScript 5.9.3, Vinext 1.0.0-beta.5, Vite 8.0.13, Tailwind CSS 4.2.1, PDF.js 6.4.299. No new framework or dependency was added.

The Sites workflow skill was read for the supported local preview workflow. UI work uses data-driven React rendering, CSS Grid/Flexbox, responsive breakpoints, semantic buttons/navigation, visible focus states, and installed Lucide icons.

## D. Visual comparison

The implementation follows the supplied target screenshot’s horizontal header, pale green page surface, compact unit banner, four color-accented statistics, three-column unit grid, typography hierarchy, and unit-card structure. The browser environment could not produce a development screenshot. The Sites dev server ran in an isolated process namespace, and the CUA browser returned `ERR_CONNECTION_REFUSED` for `127.0.0.1:5173`. Wrangler preview failed because the execution environment denied interface-address discovery (`uv_interface_addresses returned Unknown system error 1`). Direct headless Chromium aborted because the environment denied its required local socket (`socket() failed: Operation not permitted`); the Playwright browser download was truncated. No development screenshot or visual browser comparison was produced; desktop/tablet/mobile behavior remains unverified in a real browser.

## E. Question catalog reconciliation

Added `tests/public-catalog-integrity.test.mjs`. It checks unique IDs, question type totals against persisted statistics, valid curriculum associations, positive source-page references, and bundled PDF mappings. All four checks pass against the supplied catalog. Catalog data was not modified.

The screenshot/catalog difference remains: 1,542 available records versus 1,651 shown in the target. No missing question records were fabricated.

## F. Test results

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm exec tsc --noEmit` | Pass |
| `pnpm build` | Pass; Vinext emitted its existing route-classification advisory |
| `pnpm exec node --test tests/public-catalog-integrity.test.mjs` | Pass: 4 tests |
| Focused ESLint on changed files with pre-existing `react-hooks/set-state-in-effect` rule disabled | Exit 0; 7 existing warnings remain |
| Full ESLint | Not clean: two existing `react-hooks/set-state-in-effect` errors in local-storage hydration and result-page reset, plus existing warnings |
| Browser interaction, screenshots, responsive viewports | Blocked by preview isolation and Chromium socket restriction; not claimed as passed |

## G. GitHub checkpoints

Remote branch `work/public-ui-recovery` is based on `main` at `95c09c0cf1cd703cb8c30f7e23da47bb4571cc98`. The initial investigation checkpoint is `7de50f03677a8a2dd0aa29b5039011b3f4d7f164`. Implementation commit `0d70de3d908472235332c286cb3544d07f562076` adds `app/page.tsx`, `app/globals.css`, and `tests/public-catalog-integrity.test.mjs`. GitHub read-back at commit `8dfe86323207596b4bbdbf2163bcc7c0205480b1` confirmed the branch contains the implementation and report; reads of all four files returned the expected source hashes.

## H. Deployment preparation

No Site save or deployment was performed. Read-only Sites metadata confirms version 48 (`2b63a49a778459253035ec2871a84d96a31b5400`) is the latest saved version and its production deployment succeeded. Its saved version ID is `appgprj_6aef507724448191a521d9deccde9f2f~appgver_3308e2dab7c48191ac91ef0ca7915a9f`.

The supported Sites workflow is to push source to the Site's configured remote branch, save a version using that exact pushed commit and its packaged archive, then deploy the returned saved-version ID. The deployment operation publishes to production. The Site metadata available here did not expose a bound repository/branch or write credential, so the recovered branch cannot yet be shown to satisfy the save-version precondition. After compatibility review and approval, first establish the Site's configured source, push the exact reviewed commit there, package the source build as required by its hosting configuration, save it, and deploy only the returned version ID. For rollback, deploy the saved version-48 ID above through the same deployment operation. The rollback path is identified but was not exercised.

The reconstruction is not production-ready: browser visual and interaction verification is still blocked, and 109 screenshot-listed questions are absent from the available catalog. No Site save, publication, or rollback was performed.

## I. Unresolved issues

Blocking review readiness:
- Browser visual and interaction verification could not run in this execution environment.
- 109 records shown by the target screenshot are absent from the supplied catalog; their source is unknown.

Unverified:
- Responsive behavior at 1440×900, 1024×768, and 390×844.
- Browser Back/Forward, keyboard traversal, menu behavior, unit-card selection, filtering, question preview, multi-page PDFs, and practice-session interactions.
- Original version-48 source and the original save-failure cause.

## Parallel Task Compatibility

- Branch: `work/public-ui-recovery`; implementation commit `0d70de3d908472235332c286cb3544d07f562076`; code checkpoint was verified at `8dfe86323207596b4bbdbf2163bcc7c0205480b1`, followed by report-only updates.
- Shared files changed: `app/page.tsx` and `app/globals.css`; both also have changes on `work/private-review-deployment`.
- No private-review routes, APIs, admin UI, D1/R2 configuration, or Cloudflare resources were changed or copied.
- Catalog data and API interfaces were not modified. The separate private-review branch changes the catalog file and adds private APIs; those changes remain isolated.
- Compatibility risk: shared page and CSS may conflict during later integration; review those files line by line after both branches are complete. Recommended order: finish/test each branch independently, compare shared files and catalog schema, then conduct integration review before any merge; keep private infrastructure separate and require explicit production approval.

## Safety boundary

GitHub `main`, the original published Site, `work/private-review-deployment`, and private-review Cloudflare resources were not modified. No merge, cherry-pick, data deletion, new question, or production deployment occurred.
