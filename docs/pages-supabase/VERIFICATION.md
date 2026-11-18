# Migration verification

## Identity

- Planning base: `origin/main`, `4f965e32ffaa3b6bce8ab6f99b22fe42643fce16`.
- Approved UI parent: PR #6, `061e05363fdcc99ff814f96b140d2521748b589c`.
- Branch: `codex/github-pages-supabase-migration` (stacked, no merge).
- Local runtime: Windows, Node `26.13.1`, pnpm `11.25.0`.
- CI runtime: Ubuntu 24.04, Node `24.22.1`, pnpm `11.25.0`, Python 3.12.

## Local results

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| ESLint | Passed; four existing warnings in design preview/capture scripts |
| Existing and migration Node tests | 108/108 passed; includes actual PostgreSQL RLS and artifact rejection cases |
| Pages production build and artifact scan | Passed; 14 public files, no protected source or detected question text |
| Chromium Pages browser suite | 7/7 passed |
| Historical Worker build | Passed |
| Worker source/built privacy check | Passed; 1,564 questions, nine units, 13 client assets |
| Wrangler dry run | Passed; no deployment |
| Python regression suite | Local run needs Tesseract; missing OCR produces 3 failures, 6 errors, 1 skip among 52 tests. The new workflow installs Tesseract before running the complete suite. Hosted result must be checked before review completion. |

The browser suite exercises anonymous and unapproved denials, absence of public
question/PDF/admin paths, invite and recovery password setup, token removal from
URLs, approved desktop and phone PDF painting, real worksheet generation and PDF
download/parsing, legacy progress/worksheet restoration, persisted drafts across
reload, logout, direct HTTP reads and attempted writes, self-approval denial and
revocation with an existing token. The desktop/phone screenshots were visually
inspected locally. They contain source questions and are excluded from public
CI uploads and the Pages artifact.

## Evidence limits and remaining release gates

The tests use the real migration in PGlite PostgreSQL with real RLS and deliberately
broad preexisting Storage policies. The browser uses the actual static build and
Supabase client against loopback Auth/REST/Storage protocol fixtures; Auth itself
is simulated. This establishes local application behavior and database policies,
not hosted Supabase Auth/gateway configuration. No production SQL, upload,
deployment, merge, repository visibility change, or production credential use
was performed.

Before production, complete the manual actions and approved hosted rehearsal in
README.md. Verify Auth emails, the actual bucket/policy inventory, CORS, caching,
PDF range requests, protected-content hashes and both approved/unapproved real
accounts. Resolve public repository copies, protect main and the Pages environment,
and approve the exact application SHA and validated artifact separately. Transfer
browser data by exports/imports across origins. Existing Cloudflare/private-review
services and historical release approval records remain unchanged.
