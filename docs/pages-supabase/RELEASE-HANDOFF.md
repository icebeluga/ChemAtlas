# GitHub Pages release handoff

This is a review handoff, not deployment authorization. Do not merge PR #6 or
PR #8, enable production publishing, or deploy without the owner's explicit
approval of the final application SHA and validated artifact.

## Scope

Release work covers the Question Bank, source PDF viewing, Practice Builder,
saved progress transfer, Supabase authentication and student authorization, and
the static GitHub Pages artifact. Review queue, Source page audit, Legacy
content, and Manage test banks are preserved without redesign, optimization,
new dedicated coverage, or removal. Do not expand their scope during handoff.

## Candidate identity

- Branch: `codex/github-pages-supabase-migration`, still stacked on PR #6.
- Owner-approved UI parent: `061e05363fdcc99ff814f96b140d2521748b589c`.
- Protected content source: `31bf1189f6b45cb2020bba335ba5f586f45bb9f1`.
- Bucket: existing private `chematlas-content`.
- Content prefix: `shared/releases/chematlas-2026-11-18-v1/`.
- Content inventory: 15 protected assets plus one manifest, 68,008,487 bytes.
- Content-manifest SHA-256:
  `4c8ed0e1bfd4d2a6a7e775ef306829567bc8704f0e1bbdd4d685ab2428435822`.

Record the final application commit and public artifact file hashes in the
local handoff receipt and PR #8 after final checks. Do not approve a moving
branch name. A change after validation requires a new artifact and appropriate
checks. The application SHA is separate from the unchanged content source SHA.

The production SQL and protected-content upload have already been completed.
**Do not apply the migration or upload that package again.** No administrative
credentials are required for the student build or hosted student verification.

## Verification evidence

The local hosted evidence stays in ignored `outputs/hosted-verification/`.
It includes sanitized check receipts, the downloaded worksheet PDF, private
progress exports, and screenshots. Do not commit or upload those private
artifacts to public GitHub Actions artifacts or Pages. Only sanitized summary
results belong in PR #8.

The rehearsal established live approved reads, real PDF painting, a downloaded
seven-page worksheet, unapproved denials for every protected object and listing,
unapproved upload denial, and logout/refresh-token revocation in a separate
disposable session. Final live progress-transfer, responsive, canary-write,
and email-callback outcomes must be recorded individually; simulated tests
must not be described as live hosted verification.

Two fixes accompany the rehearsal: the Pages development server serves its
explicit PDF-worker/favicon allowlist, and failed application downloads show
reload recovery instead of a blank page. Progress replacement uses an explicit
in-app confirmation, with cancellation preserving current data. The Vite HTTP
fixture runs in an owned child process so its Linux configuration-loader
workers cannot leave CI hanging after a passed test.

Required automated checks are TypeScript, lint, Node tests, the isolated Pages
browser suite, static build/privacy checks, and the existing CI validation
including Worker build/privacy/dry run and Python tests. None is a deployment.

## Manual verification gates

- Use a disposable Storage canary outside the verified chemistry release for
  approved-user insert, overwrite, delete, copy, and move denial checks. Confirm
  its original bytes remain unchanged. Never test deletion on chemistry files.
- Preserve the approved and unapproved users and their approval statuses. Keep
  their existing profiles separate. Test logout only in a disposable session.
- A fresh invitation is necessary to repeat the invitation callback: the
  existing test account is confirmed and its old invitation was consumed.
  Any additional invitation account stays unapproved. Do not delete existing
  accounts or use administrative credentials to bypass this setup.
- Verify recovery/invitation landing, password setup entered by the owner,
  removal of tokens from the address bar, and final approval gating. An email
  API HTTP 200 alone does not prove delivery or successful callback completion.
- Keep the production Site URL on GitHub Pages. The allowed local callback is
  `http://127.0.0.1:5173/ChemAtlas/`; adding it does not deploy the application.

Supabase logout revokes the session's refresh token, but a previously issued
access JWT remains valid until its expiry. The live check confirmed this
behavior while the application itself stayed signed out after reload. Do not
claim immediate invalidation of copied access tokens, or change production
policies to alter this behavior during the rehearsal.

## GitHub Pages promotion, only after approval

1. Finish the outstanding hosted gates and record the final SHA, artifact
   digests, CI result, known limitations, and rollback reference in the handoff.
2. Have the owner review the stacked PRs. After separately approved integration
   of PR #6, retarget PR #8 to `main`, resolve any integration changes, and rerun
   CI. No merge is authorized by this document.
3. Verify repository variables for the actual Supabase URL, publishable key,
   and content prefix. Never supply an administrative key to Vite or Pages.
4. Verify main-branch protections and the protected `github-pages` environment.
   Follow [the staged required-CI setup](REQUIRED-CI.md): require the common
   PR-head check now, then add the uniquely named Pages check at the stack
   transition so PR #6 is not blocked by a workflow it does not contain.
   The existing workflow limits packaging/deployment to an enabled push to
   `main`; development branches and manual validation runs cannot deploy.
5. Only after the owner approves the exact merged SHA and validated artifact,
   enable publishing and approve the environment deployment. Confirm the site
   at `https://icebeluga.github.io/ChemAtlas/`, including the builder entry and
   protected authorization behavior.

Before changing origin, export personal progress and worksheet drafts from the
old site and import them at the new origin. Personal PDF originals are stored
separately in IndexedDB and need separate transfer. Keep the Cloudflare student
deployment available as the existing fallback; its production configuration,
Sites archive, private review Worker, and D1/R2 recovery are unchanged.

The repository remains public as requested. Supabase protects its private
Storage objects and the public Pages artifact excludes protected data; this
does not hide copies already present in public GitHub source/history.
