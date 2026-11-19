# GitHub Pages + Supabase migration

## Source and approval boundary

- Planning baseline: `origin/main` at `4f965e32ffaa3b6bce8ab6f99b22fe42643fce16`.
- Owner-approved student UI source and migration parent: PR #6,
  `codex/student-archive-recovery` at `061e05363fdcc99ff814f96b140d2521748b589c`.
- Migration branch: `codex/github-pages-supabase-migration`, stacked on PR #6.
- Target: `https://icebeluga.github.io/ChemAtlas/`.
- Supabase project display name: `ChemAtlas`; bucket: `chematlas-content`.

The owner authorized implementation, local verification, pushing this dedicated
branch, and a draft PR. Production SQL execution, protected-content uploads,
merges, repository visibility changes and deployment require separate explicit
approval. No production migration or upload workflow exists in this change.
Keep the PR stacked on `codex/student-archive-recovery` until PR #6 is integrated
with approval. Then retarget it to `main`, reconcile the resulting base and rerun
checks. Do not integrate or deploy either PR as part of preparing this migration.

## Architecture

`vite.pages.config.ts` builds `pages/` as static HTML with the approved student
React components and styles. It does not load Vinext, Cloudflare runtime, private
review routes or administrative APIs. The real `/practice-builder/` HTML entry
supports reloads on Pages; existing query-string routes retain their contract.
Application links and the PDF.js worker use `/ChemAtlas/`.

`#student-content` resolves to the historical `lib/content-worker.ts` in the
Worker build and tests, and to `lib/content-supabase.ts` in Pages. The adapters
provide JSON responses, PDF.js authenticated sources, shared stimuli, and base
paths. Student progress, question IDs, worksheet schemas, recovery archives,
IndexedDB transactions, PDF composition, shared context and fallback rules are
preserved. No private review D1/R2 bindings or extracted review images are added.

Pages is a public application shell. React checks approval to present the right
screen; PostgreSQL RLS independently enforces content authorization. Approval is
keyed by Auth UUID, never a student-editable metadata flag or frontend allowlist.
Students can read their own approval row and shared content, but cannot create,
change or delete approval rows or protected Storage objects. Restrictive,
bucket-specific policies prevent existing permissive policies from granting
extra reads or writes. Other buckets retain their existing policies.

The bucket must already exist and be private or the migration aborts. Private
Storage reads use the student's JWT, including PDF range requests. The frontend
accepts only `sb_publishable_` keys. No administrative key is needed by the app
or deployment workflow. Invitations and password recovery use Supabase email
links and the SPA's implicit callback flow; there is no public registration UI.

Logout unmounts the application, aborts protected fetches, destroys cached PDF
documents and revokes temporary document URLs. Approval is rechecked on token
events, every minute and when the page regains visibility. Storage enforces
revocation on subsequent requests even before that UI refresh. Previously
downloaded data cannot be recalled. Personal progress and worksheets intentionally
remain in browser storage; use separate browser profiles on shared devices.

## Public artifact boundary

The original `public/` source files remain for the existing Worker and release
history. Pages sets `publicDir: false` and copies only the favicon and PDF worker.
Protected data is also forbidden in the Pages module graph, including research
JSON imports. A post-build allowlist checks filenames and scans all output for
source-file copies, question-text probes, private-route markers and secret markers.
Source maps are not published.

The protected package consists of the student catalog, source audit,
classification method, worksheet content and source registry, fragment PDF,
eight original source PDFs, and `research/stimuli.json`. It is prepared offline:

```powershell
pnpm content:prepare <release-id>
```

This writes only ignored `outputs/supabase-content/<release-id>/` files and a
SHA-256 manifest. It does not contact Supabase. Prepare from a clean committed
checkout and retain the manifest and its source SHA. Later, with explicit owner
approval, upload the package at `shared/releases/<release-id>/` in the existing
private bucket, preserving directories and MIME types. Set object Cache-Control
to `0` (and verify authenticated responses/cache behavior during hosted testing).
Do not upload an entire source checkout, review backups or administrative data.

## Manual Supabase actions — execute only after approval

1. Select the correct project using its project URL/reference; the display name
   alone is not a unique identifier. Keep public signups and anonymous sign-ins
   disabled, email confirmation enabled, and the bucket private.
2. Set Auth Site URL to `https://icebeluga.github.io/ChemAtlas/`. Allow that exact
   URL for invite/recovery callbacks. Avoid broad production redirect wildcards.
   Configure SMTP and confirm invitation and reset-email delivery.
3. Inventory existing Storage policies. Review
   `supabase/migrations/202611180001_approved_student_content.sql`; apply it only
   after explicit migration approval. The migration does not replace other bucket
   policies, recreate the bucket, or upload content.
4. Invite intended accounts through Auth > Users. After invitation, approve their
   UUIDs through trusted SQL Editor access. Invitation alone grants no content:

   ```sql
   insert into public.approved_users(user_id) values ('<auth-user-uuid>');
   -- Revoke without deleting the account:
   update public.approved_users set revoked_at = now()
   where user_id = '<auth-user-uuid>';
   -- Restore only with owner approval:
   update public.approved_users set revoked_at = null
   where user_id = '<auth-user-uuid>';
   ```

5. After explicit upload approval, upload and hash-verify the prepared package.
   Confirm that direct anonymous/public object URLs cannot read it.
6. Supply the project URL, publishable key and selected content prefix through
   ignored local environment configuration or GitHub repository variables. Do not
   paste database passwords, service-role keys or secret keys into chat or source.

## Local development and checks

Set these three values in an ignored `.env.local` at the repository root:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<public-client-key>
VITE_CHEMATLAS_CONTENT_PREFIX=shared/releases/<release-id>
```

```powershell
pnpm install --frozen-lockfile
pnpm run check
pnpm run lint
pnpm test
pnpm run build:pages
pnpm run dev:pages
```

For owner testing with a real account, prefer the built static app so local
testing uses the same module URLs and asset layout as GitHub Pages:

```powershell
pnpm run build:pages
pnpm run preview:pages --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/ChemAtlas/`. Keep the hostname and port unchanged
when restarting the preview to preserve its browser session and progress.
The owner enters credentials directly in the browser; do not collect passwords,
record authentication request bodies, or export authenticated browser storage.
Password sign-in stays on this origin. To rehearse invitation/recovery email
callbacks locally, the owner must also allow this exact local callback URL in
Supabase Auth's redirect configuration; the GitHub Pages URL alone does not
cover localhost. No policy changes are needed.

The development server serves only the favicon and PDF worker from `public/`.
If development module loading fails in an embedded browser, use the static
preview above. A student-app loading error now provides a reload screen and
preserves the existing session instead of leaving a blank page.

Keep fixture browser builds separate from a live-account preview. Set
`CHEMATLAS_PAGES_TEST_DIR` to the fixture output directory before running
`test:pages:browser`, and supply that directory as an **absolute** Vite
`--outDir` path (relative Vite output paths resolve against `pages/`). The
default remains `dist-pages` for CI. Never replace the active live preview with
a fixture-configured artifact.

Live denial testing requires a separate confirmed Supabase Auth account that
has no active `approved_users` row. The owner creates/invites that test account
without enabling public signup or approving it, then signs in manually in a
separate browser profile. Keep the approved owner's session intact. Simulated
browser denials do not substitute for this hosted check.

For local browser tests, build with these synthetic fixture values instead of a
real project. The HTTP fixture binds only to loopback; it never uses production:

```powershell
$env:VITE_SUPABASE_URL='http://127.0.0.1:54321'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_localfixture'
$env:VITE_CHEMATLAS_CONTENT_PREFIX='shared/releases/fixture'
pnpm run build:pages
pnpm exec playwright install chromium
pnpm run test:pages:browser
```

Node tests execute the actual migration in PGlite's embedded PostgreSQL, with
real `anon`/`authenticated` roles, JWT claim fixtures and RLS. Browser tests use
the actual built static artifact, the Supabase client, simulated Auth protocol
responses and a loopback Storage/REST adapter backed by those PostgreSQL policies.
They exercise login, denial, real PDF painting, worksheet PDF download/parsing,
legacy state restoration, persistence, base paths, logout and revocation. These
tests do not claim to validate hosted Supabase Auth, Storage gateway settings,
CORS, mail delivery, cache behavior or the production policy inventory. Those
require the owner-approved hosted rehearsal below.

Keep running the original Node/Python tests and Worker build/private checks.
The original Worker browser suites remain applicable to its original paths and
signed local Access fixture. They do not substitute for Pages authentication tests.

## GitHub settings and production handoff

The Pages workflow validates migration pushes and PRs targeting either `main` or
the stacked UI branch. Validation uses no production credentials. Deployment is
inactive unless `CHEMATLAS_PAGES_ENABLED` is exactly `true`, and only a push to
`main` can enter packaging. Manual dispatch and development branches do not deploy.

Before enabling production, the owner must:

1. Resolve repository visibility: GitHub reported this repository public during
   planning, and source/history contains protected PDFs and catalogs. Supabase
   cannot protect those GitHub copies. Preserving history while restricting it
   requires an owner-approved visibility/access decision and a GitHub plan that
   supports the selected Pages arrangement. No visibility change is automated.
2. Configure `main` rules requiring PR review and passing Pages/Worker CI.
3. Configure Pages source as GitHub Actions. Create/protect the `github-pages`
   environment with required owner review, prevent self-review where supported,
   and restrict deployment branches to `main`. Keep the enable variable absent
   until those protections and the release approval are in place.
4. Set repository variables `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_CHEMATLAS_CONTENT_PREFIX`.
   They are public client settings; no database or administrative credential
   belongs in Pages jobs. The reviewed database migration is a separate operation.
5. Rehearse against the configured Supabase project with distinct approved and
   unapproved accounts: email flows, direct REST/Storage reads and attempted
   writes, revocation, source hashes, PDF ranges, cache/CORS and mobile rendering.
6. Export progress and worksheet backups from the old origin; keep personal PDF
   originals and any legacy recovery downloads separately. Close old tabs.
   Browser storage cannot transfer automatically between Cloudflare and GitHub.
   Import and verify the backups on the new origin before retiring any old route.
7. Approve integration separately. For production, review the exact `main` SHA,
   the Pages artifact and SHA-256 listing, the protected-content manifest, hosted
   results and rollback plan. Only then enable Pages and approve that deployment.
   The deploy job reuses the artifact packaged by its checked main workflow run.

Retain the previous Pages artifact/content prefix for a Pages rollback. Roll back
only after explicit approval and new validation. Existing Cloudflare releases,
the Sites v48 archive, private review Worker, D1 and R2 recovery remain independent;
the migration does not alter their production approval records or deployed state.
