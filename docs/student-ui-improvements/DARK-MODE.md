# ChemAtlas appearance themes

This round continues `codex/student-ui-improvements` and draft PR #9 from clean
candidate `a18a37b434676c8b0d08462dc2a65a3befec7ce5`. The approved main baseline is
`b05c06eaf113a91edcf95f3eea50dc4dec738492`. Other PRs and worktrees are preserved.
No merge, deployment, backend/authentication/access-control, catalog/classification,
Worker configuration or workflow changes are included.

## Architecture

`app/theme.css` adds centralized semantic dark roles and maps them to the existing
student tokens. The approved light component styles in `student-redesign.css`,
`student-workspace.css` and `pages/auth.css` are unchanged. The only layout addition
is the requested compact theme control and the space it occupies in the headers.

`lib/theme.ts` owns `chematlas-theme` (`light` or `dark`), root `data-theme` updates,
safe storage writes and cross-tab notifications. `ThemeToggle` alone subscribes;
theme changes do not rerender/reparent/remount the application or PDF components.
The toggle uses the existing Lucide moon/sun icons, native accessible title tooltips,
explicit action labels and a visible keyboard focus outline.

Both Pages entry points run the same small blocking initialization before styles
and application modules. The retained student Worker layout uses the shared
bootstrap string. No OS-theme detection overrides the light default. Missing,
invalid or inaccessible storage selects light; blocked writes still allow theme
switching for the current page. Tests prevent the HTML/bootstrap copies drifting.
The saved appearance survives refresh, navigation, logout/login and browser-profile
restoration, and synchronizes between tabs.

Dark paint is inside `@media screen`; print rules never receive it. Source PDFs,
worksheet bytes, the renderer and export pipeline are unchanged. Document canvases
stay white and unfiltered. Empty/generating states use application surfaces rather
than pretending to be printed documents. The private review app does not import
these student theme styles.

## Final semantic colors

Light values describe the existing approved student UI; authentication fields/card
borders retain their existing distinct light values. There is no light palette
replacement. Dark tokens are centralized in `app/theme.css`.

| Role | Existing light | Dark |
| --- | --- | --- |
| Main background | `#F3F6F9` | `#10141D` |
| Navigation | `#FFFFFF` | `#111620` |
| Sidebar | `#FFFFFF` | `#131822` |
| Surface / elevated card | `#FFFFFF` | `#191F2B` |
| Input | `#FFFFFF` (search `#F3F6F9`) | `#161C27` |
| Hover / sunken surface | `#E9EEF3` | `#222A38` |
| Border / divider | `#D3DBE4` / `#E7ECF1` | `#303949` / `#252D3B` |
| Form boundary | existing light component border | `#5C697F` |
| Primary text | `#14233A` | `#F1F3F8` |
| Secondary text | `#4B5B70` | `#B0BACB` |
| Muted / placeholder | existing component-specific light text | `#8B98AC` |
| Primary action | `#14233A` (login `#102442`) | `#4F59BE` |
| Primary hover / pressed | existing navy hover / press feedback | `#5D67CC` / `#434DAA` |
| Link / focus | `#2552C8` | `#A2ABFF` |
| Active navigation indicator | `#14233A` | `#929CF0` |
| Subtle accent | `#E6ECFB` | `#252D49` |
| Neutral selection | existing navy selection | `#303D57` |
| Warning text / surface | `#75480A` / `#FFF3D9` | `#E9C47E` / `#30291D` |
| Error text / surface | `#AE2A1F` / `#FBEAE8` | `#FFABA4` / `#372326` |
| Success text / surface | existing retained component colors | `#93D1B3` / `#20352D` |
| Badge text / surface | existing outlined / slate badge | `#D3DBEA` / `#293344` |
| Printed document | original white and original source ink | unchanged white and original source ink |

The nine unit hues remain `250, 218, 188, 158, 128, 98, 68, 38, 352` degrees.
Dark unit roles use OKLCH: tint `(.265 .027 hue)`, mid/indicator
`(.59 .09 hue)`, selected/hover dark `(.40 .09 hue)`, readable unit text
`(.84 .075 hue)`. Resting topic backgrounds mix the tint with up to 22% mid;
hover uses 32%. Selected topics retain the unit's darker color, a visible outline
and `aria-pressed`; selected questions retain their unit tint and colored left
border. The All card stays neutral. No unit identity is replaced with indigo.

## Changed files

| File | Purpose |
| --- | --- |
| `app/theme.css` | Central dark roles, existing-token mapping, all screen surfaces/states, unit ramps, responsive toggle placement, print isolation. |
| `lib/theme.ts` | Safe persisted appearance, bootstrap and cross-tab/event subscription. |
| `components/student/theme-toggle.tsx` | Shared accessible icon-only toggle. |
| `components/student/app-top-bar.tsx` | Toggle after search and before Log out; before Log out on builder. |
| `pages/auth-app.tsx` | Shared authentication header with toggle beside Student access; auth logic unchanged. |
| `pages/index.html`, `pages/practice-builder/index.html` | Blocking saved-theme initialization before application paint. |
| `pages/main.tsx`, `student/app/layout.tsx` | Load student theme CSS; retained Worker bootstrap/hydration compatibility. |
| `tests/pages.browser.mjs` | Four focused theme scenarios plus the existing 23 regressions. |
| `HANDOFF.md` | Continuation decisions and validation/evidence locations. |

## Verification and review evidence

Four focused scenarios cover pre-app paint, light default despite dark OS,
restricted storage at startup/switch, keyboard operation, persistence and tab sync;
exact PDF canvas identity/pixel SHA-256, zoom/crop/scroll/filter/draft/URL preservation
and zero protected reloads; identical generated PDF bytes and print colors; all
nine unit text/count pairs, semantic text/button contrast, and responsive bounds.
The worksheet test waits for the renderer's actual `data-painted` state.

Local validation passed: all 27 Pages browser scenarios, five final focused
theme/recovery scenarios, all 109 Node tests, TypeScript and the Pages build/privacy
allowlist (15 public files). ESLint has zero errors and four pre-existing warnings.
Dark PDF controls cover crop/full page, zoom, fit width/page, actual size and
fullscreen. Invite/recovery protocol coverage runs in both themes. Semantic/unit
text pairs meet 4.5:1, and form boundaries meet 3:1 against their input surfaces.
No browser errors occurred in the desktop/phone capture matrix. Final required CI
must still be checked on the actual pushed PR head before integration.

Local review uses the existing loopback Supabase protocol fixture with actual
embedded PostgreSQL approval/Storage policies. No production services are used.
Keep question/PDF screenshots and recordings ignored, local and out of public CI
artifacts. `outputs/themes/` contains light/dark desktop and phone captures for
login, bank, expanded units/topics, Focus Mode, overlay, PDF, Details, all three
builder tabs, practice sessions and progress. `visual-checks.json` records exact
approved-light pixel comparisons for the login card, Question Bank and unit/topic
navigation at 1440 and 390 px, plus browser errors. Check final candidate CI for
exact-head results; earlier run IDs/SHA snapshots do not validate a newer commit.

No new mockup attachments were available, so the written brief, supplied color
tokens and existing ChemAtlas components guided the result. Physical iOS/Safari,
real hosted email flows and device GPU performance are not claimed. Very narrow
breadcrumbs retain their existing responsive shortening. Native tooltip appearance
is controlled by the browser/OS; accessible labels and titles are consistent.
