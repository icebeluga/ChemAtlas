# ChemAtlas — private Cloudflare student deployment runbook

**Production updates require owner approval.**

Source: `integration/chematlas-unified` at `cb3fcca3782778b07e948e4be9468e2b55dcd65b`.
Student baseline: `deployment/cloudflare-student`.
Asset routing repair: `fix/cloudflare-student-deployment`.
Worker script: `worker/index.ts`.
Worker configuration: `wrangler.student.jsonc`.
Private review Worker: `chematlas-private-question-review` (not changed).

## Architecture and isolation

Vinext runs the student Next.js-compatible interface inside Cloudflare Workers.
The Vite plugin builds the Worker and assets. Use the generated Wrangler
configuration for upload so the server modules and the matching client asset
manifest come from the same build. The separate private review
Worker retains its own Cloudflare Access policy and D1/R2 storage; no D1/R2
review bindings are declared on the student Worker.

No ChatGPT Sites hosting manifest, local ChatGPT sign-in, external connector
preview, or review development API is loaded by the student Vite configuration.
The original files may remain in the repository for historical or separate
development purposes but are not in the student deployment path.

The student Worker explicitly returns 404 for `/admin`, `/admin/**`,
`/api/admin`, and `/api/admin/**`. It checks a signed Cloudflare Access JWT
before invoking Vinext. The JWT must match both the configured Access team's
HTTPS issuer and the student application's unique AUD, have a valid signature,
be unexpired, and contain an email claim. This **does not implement a local
email allowlist**: Cloudflare Zero Trust enforces the allowlist before requests
reach the Worker.

Cloudflare Workers with Static Assets may lack `ctx.access` even after Access
authentication, so the app validates the `Cf-Access-Jwt-Assertion` header.
The source Wrangler config sets `assets.run_worker_first: true` to route
**all** HTML, scripts, CSS, catalog JSON, API and original PDF requests through
the guard. The built Wrangler output must retain this setting. The Worker serves
`/_next/static/` GET and HEAD requests through `env.ASSETS` after verification.
The server-side `dist/server/_next/static/` modules are Worker imports. Browser
assets are under `dist/client/_next/static/` and must be uploaded through the
asset directory in the generated Wrangler configuration.
If the Access header is not forwarded in the final runtime, do **not** weaken
the guard; treat it as a release blocker and resolve the routing first.

## Local preparation (safe, no Cloudflare changes)

Prerequisites: Node >=22.13, pnpm 11.25 and project source.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run check
pnpm run check:private
pnpm run build
pnpm run check:private --built
pnpm exec wrangler deploy --config dist/server/wrangler.json --dry-run
pnpm test
python -m unittest discover -s tests -p 'test_*.py' -v
```

Inspect `dist/server/wrangler.json`: `workers_dev=false`,
`preview_urls=false`, `assets.run_worker_first=true`, no public route,
and no private-review D1/R2 bindings. Do not deploy if any differ.

A local worker preview without Access identity returns 503 when bindings are
missing, or 403 for a missing JWT when bindings exist. For browser QA, prepare
an **ignored, local-only** copy of the generated Wrangler config with an
`access.dev` simulation and use its matching audience in local bindings.
Do not commit or deploy that copy. Cloudflare documents local Access
simulations, but because Static Assets can remove `ctx.access` from the
Worker, the JWT header delivery still needs separate verification using a
real protected preview after approval.

## Cloudflare Access setup for a new Worker

For the existing student Worker, use the update steps below and retain its
current Access policy. These setup steps apply to a new installation.

1. Enable Cloudflare Zero Trust in the intended Cloudflare account. Configure
   **One-Time PIN** as an identity provider/login method. Do not configure
   domain-wide or public registration access.
2. Prepare the Cloudflare Worker named `chematlas-student-private` **with
   no routes and both workers.dev and preview URLs disabled**. The initial
   upload, if eventually approved, is not an accessible website. Do not connect
   Git auto-deploys or create public preview links.
3. In **Workers & Pages > chematlas-student-private > Access**, select
   **Protect this Worker behind Access**, choose **All traffic** (not Previews
   only), and create or select a restrictive, separate student policy.
4. In **Zero Trust > Access controls > Policies/Applications**, configure
   **Allow > Include > Emails** and enter **only the owner's exact email**.
   The owner supplies this email during setup. Require the One-Time PIN login
   method where supported. Do not include `Everyone`, a full email domain,
   Cloudflare account members, or broad groups. Do not configure `Bypass`,
   `Service Auth` for students, or an unrestricted alternate Allow policy.
5. Confirm the Access application destination type is **worker** for this
   Worker and covers production **and** preview URLs. Worker-level protection
   covers all associated routes, custom domains, and workers.dev hostnames.
   Check no more-specific hostname or path Access rule overrides it.
6. Set two distinct student-only Worker environment variables/secrets from
   the actual Access app: `CF_ACCESS_TEAM_DOMAIN`, such as
   `your-team.cloudflareaccess.com`, and
   `CHEMATLAS_STUDENT_ACCESS_AUD` equal to its **Application Audience (AUD)
   Tag**. No secrets, IDs, or email addresses are stored in Git.
7. Keep `workers_dev=false`, `preview_urls=false`, and zero public
   routes during setup. Only after the owner approves the Access policy
   **and** a verified protected endpoint may a hostname/preview be enabled.

## Update the existing protected student Worker

Use these steps after production approval. Confirm in the dashboard that the
existing Worker-level Access policy covers all traffic and that both student
Access bindings are present. Record the active version for rollback. The
checked-in configuration disables `workers.dev` for safe preparation, while the
existing production site uses that hostname. Preserve it with a release-only
copy of the generated configuration in the same directory, so the `../client`
asset directory and module paths still resolve.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run check:private --built
node --input-type=module -e 'import { readFileSync, writeFileSync } from "node:fs"; const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8")); config.workers_dev = true; writeFileSync("dist/server/wrangler.release.json", JSON.stringify(config));'
pnpm exec wrangler deploy --config dist/server/wrangler.release.json --keep-vars --dry-run
pnpm exec wrangler deploy --config dist/server/wrangler.release.json --keep-vars
```

Run the signed-in and anonymous checks below after deploying. Roll back to the
previous version if the protected hostname, asset routing, or authorization
checks fail.

### Authorized users (dashboard-only, no code changes)

Edit the separate **student** Access policy's `Allow > Include > Emails`
list. Add a complete email address to grant access, or remove it to deny
new sessions. Cloudflare Access manages OTP sign-in and sessions. When
revoking someone, also revoke their active Access sessions in Zero Trust
and verify denial in a new browser session. Do not edit the separate review
policy. A URL alone never grants admission.

## Browser and security release checklist

Run the hosted checks against the actual protected Worker after approval. Unit tests
of JWT verification alone **do not count as Cloudflare authentication
verification**. Record the URL, UTC timestamp, tested email, HTTP status,
and screenshot/log for each result.

- [ ] Owner gets the One-Time PIN challenge and, after login, loads the home
      page, Question Bank and Practice Builder.
- [ ] An email not in the allowlist cannot obtain a usable Access session;
      no catalog, source PDF, static asset, or API response is returned.
- [ ] Anonymous/incognito browser is redirected to Access or denied before
      any ChemAtlas content appears, including HTML, JSON, JS, CSS, PNG, and PDF.
- [ ] Check the production URL, a version/preview URL (if deliberately enabled),
      workers.dev URL (if enabled), and every custom domain or route. Verify
      the **Worker-level All traffic** policy applies in each case.
- [ ] Direct request to `/questions.json`, `/curriculum-topics.json`,
      `/source/bank-01.pdf` through `bank-08.pdf`, and a `/_next/static/`
      asset does not expose data to an anonymous or unauthorized request.
      Test without following login redirects; if following redirects, check
      content body and MIME type rather than treating the login HTML as data.
- [ ] `/admin/question-review`, `/api/admin/question-review`, backup and
      image routes return 404 on the **student** Worker, including for an
      authenticated student.
- [ ] The existing private review Worker still allows its owner and denies
      ordinary students; its D1/R2 data has not changed.
- [ ] Browser navigation, mobile menu, search, filters, Back/Forward, MCQ/FRQ
      detail, next/previous, practice sessions, print/save PDF, and shared
      stimulus once per worksheet all work.
- [ ] Eight original source PDFs load by original page mapping; the canonical
      question count, IDs and classifications match the source checkpoint.
- [ ] Progress JSON exported from the original domain imports correctly on
      the protected domain. Note locally imported personal PDF blobs require
      separate transfer.
- [ ] Access JWT without correct audience, issuer, signature or expiry fails.
      Missing auth bindings fail 503; absent JWT fails 403.
- [ ] Production build and built config pass private-config assertions.
- [ ] Owner explicitly confirms unauthorized access denial **before**
      enabling any address that could serve content.

## Verification limitations and remaining blockers

- Cloudflare account, owner email, Zero Trust team domain, application AUD,
  approved email list, and live Access policy are not available in GitHub.
  Nothing in the repository can truthfully assert that live Access works.
- Cloudflare's Static Assets router does not propagate `ctx.access` to the
  Worker; JWT header verification in an approved protected environment must
  be tested end to end. Never bypass the worker JWT check to force a demo.
- The original student interface calls a private question-review API in the
  unified branch. The independent student build intentionally does **not**
  request or expose the private administrator API. Source PDF fallback remains.
  A future read-only accepted-image API needs a narrowly scoped proxy,
  separate authorization, CORS/asset audit, and explicit owner approval.
- Progress JSON contains attempts, topic overrides, and session count, not
  binary PDFs uploaded into IndexedDB on the original domain. The eight
  canonical source PDFs remain bundled normally.
- Browser and hosted authentication checks cannot be marked passed until
  performed. The presence of build output or passing unit tests is not an
  authorization to publish.

References:
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
