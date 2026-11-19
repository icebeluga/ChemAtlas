# Local live Supabase rehearsal, 2026-11-18

Branch: `codex/github-pages-supabase-migration`. Starting commit:
`31bf1189f6b45cb2020bba335ba5f586f45bb9f1` (PR #8). The starting checkout
was clean. PR #8 remains stacked on PR #6; neither PR was merged.

The ignored root `.env.local` selects the owner's ChemAtlas project and
`shared/releases/chematlas-2026-11-18-v1`, with a publishable client key only.
No administrative upload credential, service-role key, SQL migration, or
production policy change was used for this rehearsal.

## Findings and fixes

The development server returned its HTML fallback for the PDF worker and
favicon because its public directory is deliberately disabled. The same
explicit two-file allowlist now serves those assets in development as well as
the static build. HTTP regression coverage verifies their bytes, MIME types,
HEAD behavior, rejected writes, and exclusion of protected public assets.

The owner's in-app browser subsequently reached approved access but failed to
import the development `components/student-app.tsx` module through its Windows
`@fs` URL. React removed the UI because the lazy component had no error
boundary. The server returned HTTP 200 for that module when checked directly;
the precise cause of the embedded browser's failed module request remains
unconfirmed. Serving the validated static build at the **same origin** restored
the existing session and Question Bank without another login.

The student application now has an error boundary with a reload action. It
leaves authentication and saved browser data intact. A browser regression
blocks the application chunk, verifies the recovery screen, then allows the
chunk and verifies reload restores access without another password sign-in.

Fixture tests can use `CHEMATLAS_PAGES_TEST_DIR` so their simulated project
build never replaces the live local preview. See the README for commands.

## Verified against the live project

- The owner entered their credentials directly in the browser. No password,
  authentication request body, token, or authenticated storage snapshot was
  collected or exported.
- The approved session survived reloads and the development-to-static server
  change at `http://127.0.0.1:5173/ChemAtlas/`.
- The redesigned Question Bank loaded live protected content and showed its
  existing 735-question classified browsing view. The protected source package
  still contains 1,564 total question records, including other catalog states.
- A real source PDF rendered a visible PDF.js canvas, including after another
  session restoration. This used the authenticated private Storage source.
- Adding a question created a saved worksheet selection. Practice Builder
  restored it across route navigation and generated a one-page worksheet PDF;
  its PDF canvas also painted. This live check did not independently parse a
  downloaded worksheet file.
- The restored in-app tab reported no new browser console errors.
- Six fresh anonymous requests (catalog and original PDF, each through a public
  URL, authenticated URL without credentials, and publishable-key-only request)
  were all denied with HTTP 400.
- The real-project static artifact passed the privacy scan: 14 allowed public
  files, no protected source bytes or detected question text.

## Automated validation

- TypeScript passed.
- ESLint passed with the same four existing preview/tool warnings.
- 109 Node tests passed, including the new development HTTP regression.
- Eight isolated Pages browser scenarios passed, including failed-chunk
  recovery, real PDF painting and parsed worksheet download with fixture
  content, saved progress/drafts, logout, invitation/recovery callbacks,
  unapproved denial, direct RLS denial, and revocation.
- Fixture and live-project static build privacy scans passed.

The browser fixture uses simulated Auth with actual embedded PostgreSQL RLS.
Its results do not substitute for hosted-user verification.

## Remaining hosted checks before deployment

Keep the owner's restored session intact while they test the site. Live logout
was deferred during blank-page recovery. A separately confirmed, unapproved
Auth account is required for hosted denial checks; the owner must create or
invite it without an active approval row and sign in manually in a separate
profile. Public signup should remain disabled.

Still pending: hosted unapproved-user/direct API denials, approved-user write
denials, actual progress-attempt/export/import verification, independent live
worksheet-download parsing, hosted logout, refresh-token renewal, and local
invitation/recovery email callbacks. The latter require the owner to allow
`http://127.0.0.1:5173/ChemAtlas/` as a redirect in addition to the Pages URL.
SMTP/mail delivery and GitHub Pages redirect behavior need their own rehearsal.

No GitHub Pages or Cloudflare deployment, repository visibility change, branch
merge, production SQL execution, or production authorization change occurred.
The original public-repository source/history exposure noted in the migration
README is unchanged. Require passing CI and separate owner approval of the
exact application SHA and validated artifact before production deployment.
