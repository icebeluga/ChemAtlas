# Student UI improvements — review handoff

- Feature branch: `codex/student-ui-improvements`.
- Approved base: `origin/main`, `b05c06eaf113a91edcf95f3eea50dc4dec738492`.
- Owner-requested refinements continue the existing PR #9 branch from `ace5b7d941cf35d59ae06f1a07925ba006ece6db`; no other PR is incorporated.
- Separate worktree: `C:\Users\Johnson\.codex\worktrees\student-ui-improvements\ChemAtlas-redesign`.
- Original detached checkout preserved at `0f4d826fa9a78b7f6fbe7f536fe405a60b8596f5`.
- Design authority: [Website UI Design](https://app.notion.com/p/41de71cef6dc80f0a49cfad183658089), including all six embedded images, inspected November 19, 2026.
- Architecture: existing GitHub Pages entries and Supabase authorization/private Storage. No production deployment or merge is authorized.

## Requirement coverage

| Specification | Implementation |
| --- | --- |
| Remove More and its catalog navigation | Removed dropdown, destinations and menu styles. Practice sessions and Progress remain direct student links in the Question Bank footer. Existing catalog-tool deep links and stored data remain intact. |
| Match the login reference | Navy student-portal card, Welcome back title, header/footer, email/password labels, password visibility, recovery and approval states. Existing Auth requests and approval gate retained. |
| Remove session strip, retain sign-out | Log out moves into the existing app bar. Loading/error recovery also offers sign-out. Keyboard operation covered at 320 px. |
| Supplied favicon and simplified title | Both Pages entries use ChemAtlas and the original supplied PNG. Logo source SHA-256: `12425863e18c97f11533b73f98e42930192cf17f8ee6e752ef4cb1f7c6a72677`. Historical Worker favicon remains unchanged. |
| Eliminate page overflow and wasted space | Viewport-sized shell, independently scrollable result list/PDF/builder panes. Explicit grid minimum widths. Hidden accessibility labels anchored at the origin, fixing phantom document height without removing accessible text. |
| Compact unit/topic navigation | Only the selected unit displays its name; all keep numbers, counts, colors and heat segments. Topics balance by measured intrinsic width into two rows, with full names wrapping within long buttons. Phone topic sheet retained. |
| Enlarge PDF area | Tighter course/header spacing; topic/status content moves out of the reading area. Full-page/crop, zoom, fit width/page, actual size, fullscreen, source-page navigation and add-to-worksheet controls retained. |
| Print warning and Details | Default-closed Details includes primary/supporting topics, part descriptions and complete warning. Print unreviewed opens it directly; Escape closes it without dismissing the phone question pane. Worksheet warning retains source-page/adjacent-answer cautions and explicitly calls for checking subparts, figures and continuation pages. |
| Navigation latency investigation | Ordinary internal navigation uses browser history without remounting Auth/catalog/draft state. Anchors retain valid URLs and modifier-click behavior. Back/Forward and deep links remain supported. |

## Manual-review refinements

- Adaptive navigation now has four complementary states. Initial browsing keeps the unit row; selecting a unit reveals its existing topic rows. Choosing a topic retracts both bars into a 48 px unit-accented breadcrumb row. A manual “Focus on this unit” control offers whole-unit study without a topic. Browse, unit/topic breadcrumbs and the centered double-chevron handle open one anchored non-modal browser. The browser reuses the same unit/topic components, keeps unit switches open, closes after topic selection, and offers all questions in the chosen unit. Outside click, Escape, Browse/handle and the close control dismiss it.
- Navigation visibility is separate from filtering. Opening/dismissing changes neither the question nor PDF zoom/crop/scroll, list scroll, search/year/type, worksheet or URL. The PDF/list subtree stays mounted. Base UI's existing installed Popover/Collapsible primitives manage focus/dismissal and the 280 ms reveal/retraction; there is no dim backdrop, duplicate unit tree, new dependency, pinning or custom pull gesture. The overlay is viewport-bounded and scrollable. Phone Focus Mode keeps navigation accessible above the PDF pane. The original inline mobile topic sheet and horizontal accordion remain usable.

- The login header contains only ChemAtlas on the left and Student access on the right. The subtitle and its divider are removed; the form and authentication behavior are unchanged.
- Question type controls read All, MCQ and FRQ. Clear filters occupies the former review-checkbox position beside the year control; it is disabled when there is nothing to clear. It still resets year, type, search and pagination while retaining the selected unit and topic. The reviewed-only filter is removed; review statuses and print warnings remain elsewhere.
- Each desktop topic row fills its container. The two-row split uses independently measured natural label/count widths; flex distributes spare space across the variable-width buttons. All nine units are checked at 1440 and 1280 pixels, including long labels and Units 1, 2 and 8. The mobile topic sheet is retained.
- The desktop split is 24% list / 76% viewer at 1440 pixels, with a 320-pixel list minimum producing 25% / 75% at 1280. Tablet widths reserve more list space. The title and complete metadata occupy the first header row; Details shares the full-page/crop and worksheet-action row. Details remains closed by default and retains all classifications and warnings.
- The latest owner refinement replaces the vertical wave with a horizontal accordion. Real button widths share a fixed row budget and constant height; neighbors contract to accommodate the active unit (~240 px), with nearest donors weighted most strongly and interior growth borrowing from both sides. There are no floating faces, overlaps, elevation or vertical expansion. Numbers/counts reposition continuously in compressed cards, full names fit within the fixed-height active card, and decorative topic bars retain their density/colors. The existing short damping controller coordinates all widths without queues. Pointer coordinates must actually change before retargeting, so stationary hover cannot oscillate as boundaries move. Original click/filter behavior, keyboard, reduced motion and mobile are preserved. Exit restores default dimensions; resize/scroll/unmount clean up inline layout. This replaces the former overlay's transform-only performance model: local horizontal layout is intentional to keep real hit targets aligned.

## Navigation evidence

The exact approved baseline was exported and built separately under ignored
`outputs/ui-baseline-source/`; no branch or worktree was reset.

On the same loopback Auth/Storage fixture, one baseline Question Bank → Practice
Builder transition took 881 ms and replaced the document. It repeated approval,
stimuli, catalog and two worksheet-metadata requests (five requests total).
The revised transition took 94 ms in the final inspection, preserved the
document and made only the two worksheet-metadata requests. The regression
suite also verifies no repeated approval/catalog/stimuli request and preserved
worksheet selection through Back/Forward.

These are local observations, not production performance guarantees. The
existing periodic approval recheck, revocation handling, Storage RLS and
session/cache cleanup on sign-out remain active.

## Verification

Local results:

- Frozen pnpm install and supply-chain policy check passed.
- TypeScript passed.
- ESLint passed with the same four pre-existing warnings outside the changed product code.
- 109 Node tests passed.
- 52 Python tests passed with Python 3.12, UTF-8, PyMuPDF 1.26.6 and Tesseract.
- The 23 Pages browser scenarios use the production build, real Supabase client, simulated Auth protocol and the actual approval/Storage migration in embedded PostgreSQL. Accordion coverage checks all nine units at 1440/1280/tablet/short-landscape sizes, complete titles and indicators, exact constant card/row height, fixed total width/gaps, no overlap/overflow, compression weighted toward adjacent cards, unchanged hover filters/results, stationary hold, simultaneous contraction/expansion within two frames, rapid sweeps/reversals, clicks during/after motion, exit restoration, keyboard/reduced motion/mobile. Adaptive cases cover all four states, >40 px reclaimed desktop height, one rendered navigation tree, exact canvas/state preservation and zero protected reloads, all triggers/dismissal paths, whole-unit study, six viewport sizes and normal-motion repeated toggling. Existing bank/builder Back/Forward tests remain; filter updates still replace the current history entry. Exact-head results are recorded in PR #9.
- Earlier wave profiling receipts (`outputs/unit-wave-performance-{1x,4x}.json`) are historical and do not describe this accordion. Widths now intentionally perform bounded horizontal layout so visible cards and real click targets never diverge. Use current accordion profiling rather than repeating the old zero-layout claim. Test snapshots compare question IDs rather than protected question text.
- Pages build and artifact privacy allowlist passed. Protected data/server modules and administrative credentials remain excluded.
- A focused 844x390 selected-topic regression verifies a reachable PDF viewport and actual mouse-wheel scrolling; short-screen course/filter controls are internally bounded. Expanded Details is anchored within the short viewport so its warning and part details remain reachable.
- The downloaded worksheet was one US Letter page (377,523 bytes), rendered and visually checked with both browser PDF.js and Poppler. Poppler reported missing Symbol/ArialUnicode display-font warnings without a visible defect.
- Worker compatibility build, privacy check and Wrangler dry run passed; the final exact-head compatibility and both shared browser suites are required in PR CI.
- Desktop and phone screenshots were visually inspected. Coverage includes 1440×900, 1280×900, 768×700, 844×390, 390×844 and 320×600; all nine unit bands, keyboard navigation, PDF painting/fit controls, worksheet generation/download/parsing, progress import/export, logout, invite/recovery protocol, approval denials and revocation. Desktop checks assert full row widths, a maximum of two topic rows, unclipped labels/counts, single-line metadata, the list/viewer proportions and reachable expanded Details. Filter checks cover reset behavior and pagination.

The final PR must pass both required checks on its own head:
`Validate PR head application (no deploy)` and
`Validate GitHub Pages application (no deploy)`.
CI results and the full final commit SHA are recorded in the PR description.

An initial attempt to use the older local UI development server timed out
during compilation on the host. Those timeouts are not represented as passes;
the signed Worker browser suites run through the required Linux CI workflow.

## Screenshots and worksheet

Public-safe login screenshots:

- [Desktop login](screens/login-desktop.png)
- [Phone login](screens/login-phone.png)

Question/PDF screenshots and the generated worksheet stay local and ignored,
following the release handoff's evidence privacy boundary:

- `outputs/ui-improvements/bank-desktop.png`
- `outputs/ui-improvements/details-desktop.png`
- `outputs/ui-improvements/bank-phone.png`
- `outputs/ui-improvements/question-phone.png`
- `outputs/ui-improvements/question-short.png`
- `test-results/pages/builder-desktop.png`
- `test-results/pages/print-details-phone.png`
- `test-results/pages/worksheet.pdf`
- `test-results/pages/filter-row-{1440,1280}.png`
- `test-results/pages/topics-u{1,2,8}-{1440,1280}.png`
- `test-results/pages/header-pdf-{1440,1280}.png`
- `test-results/pages/short-landscape-details.png`
- `test-results/pages/compact-question-phone.png`
- `test-results/pages/unit-hover-u4-{1440,1280}.png`
- `test-results/pages/unit-hover-u4-844x390.png`
- `test-results/pages/unit-wave-u4-{1440x900,1280x900,768x900,844x390}.png`
- `test-results/pages/unit-wave-neighbors.png`
- `test-results/pages/unit-accordion-u{1,4,9}-{1440,1280}.png`
- `outputs/unit-accordion-navigation.png`
- `outputs/unit-accordion.webm`
- `outputs/unit-accordion-performance.json`
- `test-results/pages/adaptive-{1-initial,2-unit,3-focus,4-overlay}.png`
- `test-results/pages/adaptive-overlay-{phone,landscape}.png`
- `outputs/adaptive-state-{1-initial,2-unit,3-focus,4-overlay}.png`
- `outputs/adaptive-navigation.webm`

## Release boundary and limits

No live Supabase SQL, RLS, approval/account changes, protected chemistry uploads,
Cloudflare configuration changes, production releases, merges, or unrelated PR
changes are included. Sites v48, release history, private review Worker and
D1/R2 recovery are preserved. Follow the current
[Pages release handoff](../pages-supabase/RELEASE-HANDOFF.md) and the historical
[Stage 5 handoff](../stage-5/README.md) for any separately approved release.

Authentication tests here use the loopback fixture; they do not claim new live
email delivery, production invitation/recovery validation, or physical
iOS/Safari coverage. Login can scroll on short screens so all form controls
remain reachable; the authenticated workspace uses internal pane scrolling.
