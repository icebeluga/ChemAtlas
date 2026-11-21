# Blueberry branding

This branding-only round continues `codex/student-ui-improvements` and draft PR #9
from clean `1a072fed83d46705e98ab2df494d920e66f16bae`. Approved main remains
`b05c06eaf113a91edcf95f3eea50dc4dec738492`. The repository, `/ChemAtlas/` Pages
deployment path, Supabase project, authentication/authorization, storage and
existing design remain unchanged. Nothing is merged or deployed.

## Canonical artwork

`public/blueberry.svg` is the only master. It follows the owner's attached logo:
two genuinely circular berries (each radius 68), two navy five-point calyx marks,
and two green leaves. The 272 × 250 viewBox includes balanced transparent padding.
There are no embedded raster images, gradients, filters, or distorted ellipses.

| Role | Color |
| --- | --- |
| Front berry | `#4c61a3` |
| Rear berry | `#5368aa` |
| Calyx marks | `#202e57` |
| Leaves | `#075b46` |
| Opaque application-icon background | `#f5f6fa` |

The shared `BrandMark` renders this file directly using the existing `sitePath`
adapter. All themes and destinations share its geometry and colors. Its empty
image alternative avoids repeating the adjacent accessible Blueberry wordmark.
`object-fit: contain` preserves proportions; existing wordmark fonts are inherited.

## Generated assets

Regenerate all derived images from the master, without manually editing them:

```sh
node scripts/generate-brand-icons.mjs
```

The script uses the already-installed Playwright Chromium and browser canvas;
there are no new dependencies or hosted image services.

| File | Purpose |
| --- | --- |
| `blueberry.svg` | Canonical transparent logo, used throughout the UI |
| `favicon.svg` | Byte-identical copy of the master |
| `favicon-16.png`, `favicon-32.png`, `favicon-48.png` | Transparent favicon sizes |
| `favicon.png` | Compatibility alias of the 32 px PNG |
| `favicon.ico` | Three lossless PNG entries: 16, 32 and 48 px |
| `apple-touch-icon.png` | 180 px square, near-white, centered proportional logo |
| `app-icon-192.png`, `app-icon-512.png` | Regular application icons |
| `app-icon-maskable-192.png`, `app-icon-maskable-512.png` | Separate assets with all artwork inside the central safe circle |
| `site.webmanifest` | Blueberry name/short name and relative icon/start/scope paths |

Opaque icon files have square, fully opaque corners. They do not pre-apply iOS
corner rounding. Regular icons allocate 84% of the canvas width to the full SVG;
maskable versions allocate 74% to protect the artwork under different masks.
The manifest uses `display: browser`. There is no service worker, offline cache,
new authentication method, or additional PWA behavior.

## Integration and changed files

| File/group | Change |
| --- | --- |
| `components/student/brand-mark.tsx`, `app/branding.css` | Shared logo/wordmark and narrowly scoped sizing/alignment |
| `components/student/app-top-bar.tsx` | Logo immediately left of the Blueberry name, within the existing navbar |
| `pages/auth-app.tsx` | Brand component, visible auth/loading/error/footer text only; handlers are unchanged |
| `pages/index.html`, `pages/practice-builder/index.html` | Exact Blueberry title, SVG/PNG/ICO links, 180 px Apple metadata and manifest |
| `app/layout.tsx`, `student/app/layout.tsx`, `student/app/practice-builder/page.tsx` | Corresponding metadata on retained Next/Worker destinations |
| `lib/branding-assets.mjs`, `vite.pages.config.ts` | Explicit public branding-asset allowlist, including dev MIME handling; branded 404 title/link |
| `scripts/pages/assert-artifact.mjs` | Requires exactly the added public assets while preserving secret/question/source checks |
| `components/student-app.tsx`, worksheet recovery/hooks, `lib/progress-transfer.mjs` | Visible prose, validation messages and download filename prefixes only |
| `scripts/generate-brand-icons.mjs`, `public/` assets | Reproducible master-derived icon generation |
| `tests/branding.test.mjs`, Pages/dev/artifact/browser tests and fixture MIME map | Icon structure, public URLs, metadata, proportions, masking, compatibility and existing functionality |
| `tests/student-state.browser.mjs` | Expected user-facing recovery filenames; file payloads/format identifiers stay unchanged |
| `HANDOFF.md`, this document | Continuation context and asset maintenance |

Internal `ChemAtlas` component/function identifiers, history/event names,
`chematlas-*` localStorage/IndexedDB/auth keys, progress/backup format identifiers,
environment variables, database/bucket names, URLs and release records are
deliberately retained. Existing saved sessions, filters, drafts, progress and
backup imports remain compatible. Historical documentation and the Sites v48
archive are not rebranded.

Generated worksheets currently contain no ChemAtlas logo or branding. No new
logo/footer is added to printed documents, and no PDF renderer, generator,
source content or print layout is changed.

## Review evidence and checks

Local screenshots remain ignored under `outputs/blueberry/`, including before
and after light/dark login, Question Bank and Practice Builder at 1440 and 390 px.
`visual-checks.json` records matching header/form/search/workspace geometry and
pixel-exact bank/builder content. The changed login eyebrow is masked for the
card comparison; one phone dark card capture differs only at nine rounded-border
pixels by one channel level, without geometry/content changes.

The targeted branding browser case checks anonymous asset retrieval and MIME
types, shared source/proportions, exact titles, both application entry paths,
Apple metadata, opaque corners, substantial icon coverage, maskable safe zones,
and absence of service workers. Existing login/recovery, theme-state, PDF,
worksheet/export, navigation, hover/focus and responsive scenarios remain.
The print-color regression waits for the screen-only role to leave the cascade
and exercises Chromium's actual PDF print renderer before reading colors. This
replaces a timing-sensitive media-switch sample; no application print CSS changed.
Read final `outputs/blueberry-*.log` and exact-head PR CI for final results.

The preview uses the established loopback fixture (simulated Auth/email with real
embedded PostgreSQL approval/Storage policies), not production services. Its
current PID/artifact SHA are in `.sites-runtime/manual-preview.json`. Never use
fixture credentials on production. Chrome tab verification is performed locally;
physical iPhone/Safari home-screen installation remains a device-review step.

The pre-existing crowded phone inline topic labels remain outside this branding
scope; All topics and Browse remain available. No unrelated fixes are included.
