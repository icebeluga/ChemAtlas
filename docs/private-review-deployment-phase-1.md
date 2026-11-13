# ChemAtlas Private Review Deployment — Phase 1

This configuration is a separate, not-yet-provisioned private review deployment. It does not change `.openai/hosting.json`, the published ChemAtlas Site, or the public question catalog.

## Compatibility inventory

| Area | Current state | Phase 1 result |
|---|---|---|
| UI/runtime | React + TypeScript, Next-compatible Vinext on Vite/Cloudflare | Existing dashboard remains in place; its server page is Edge-compatible and requires owner Access identity outside local development. |
| Current review API | `scripts/vite/question-review-plugin.mjs`, Vite `apply: "serve"` middleware | Kept for local development, refactored to the shared filesystem adapter. It is not used as a production API. |
| Review metadata | `research/question-image-review.json` | Local-only adapter remains. Cloud deployment uses owner-scoped D1 rows and a migration. No hosted filesystem fallback exists. |
| PNGs | `research/question-images/` | Local adapter remains. Hosted image bytes use immutable owner-scoped R2 object keys and D1 metadata. |
| PDF rendering | Browser `pdfjs-dist` canvas rendering in the existing dashboard | Image generation remains in the browser/offline processing environment. Native PyMuPDF/Python and heavy PDF work do not run inside Workers. |
| Cloudflare bindings | No D1/R2 bound in `.openai/hosting.json`; published Site overview had no database bindings | Separate Wrangler config is supplied with placeholder D1 ID and distinct D1/R2 names. No resources were created. |
| Authentication | Existing dashboard was development-only; no app-level admin auth | Hosted route/API verifies Cloudflare Access JWT signature, issuer, audience, expiry, and configured owner email. The Access application/policy itself still needs to be created. |

## Persistent data model

`drizzle/0001_question_image_review.sql` creates:

- `review_records`: owner-scoped question/stimulus review payload and current status.
- `review_history`: append-only decision history.
- `crop_revisions`: immutable source-relative crop snapshots and notes.
- `image_objects`: D1 metadata/checksum/size reference for PNGs in R2.
- `stimulus_links`: question-to-shared-stimulus associations required to validate approvals.

The canonical catalog remains `public/questions.json`; this database intentionally stores only review state and not a second copy of all question data. D1 owner IDs come from the verified Access JWT subject.

R2 keys have this shape:

```text
owners/{access-sub}/question-images/{questionId}/{revision}-segment-{n}.png
owners/{access-sub}/question-images/_stimuli/{stimulusId}/{revision}-segment-{n}.png
```

Revision keys are immutable: saving different bytes to an existing revision fails. A changed crop must have a new revision, which the dashboard's crop workflow already creates. The image endpoint is authenticated and returns private, no-store PNG responses.

## Routes

The hosted route handlers preserve the existing endpoint paths and response shapes:

- `GET /api/admin/question-review`: manifest, shared stimuli, and currently accepted image references.
- `POST /api/admin/question-review`: validate PNG and save it to R2 plus its D1 object metadata.
- `PUT /api/admin/question-review`: save notes/decision/crop revisions, require rejection reasons, ensure accepted/rejected images exist, require accepted shared stimuli, and invalidate question approvals when a stimulus is no longer accepted.
- `GET|HEAD /api/admin/question-review/image/{folder}/{filename}`: authenticated image retrieval.
- `GET /api/admin/question-review/backup`: streaming TAR.GZ export from D1/R2.
- `POST /api/admin/question-review/backup/import`: restore compatible review backup records and images.

The current backup import handler caps the compressed and decompressed archive at 48 MiB to stay within Worker memory constraints. Larger archives need an offline/batch R2 restore path before the full generated-image collection is migrated. Export streams PNG bodies from R2 one object at a time.

## Local workflow

The existing UI continues to run with the filesystem-backed development API:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Local state defaults to `research/question-image-review.json` and `research/question-images/`. `CHEMATLAS_REVIEW_MANIFEST` and `CHEMATLAS_REVIEW_IMAGES` may point to alternate local test paths. The hosted API never falls back to these files.

## Cloud resource setup required later

No Cloudflare resources were created or billed in Phase 1. Once deployment is authorized:

1. Create a separate Cloudflare Worker/site for the private review app; do not deploy this config to the existing published Site.
2. Create D1 database `chematlas-private-review` and R2 bucket `chematlas-private-review-images` in the target account/region.
3. Replace the D1 placeholder ID in `wrangler.private-review.jsonc` with the newly created database ID.
4. Set `CHEMATLAS_REVIEW_OWNER_EMAIL`, `CF_ACCESS_TEAM_DOMAIN` (the full `team.cloudflareaccess.com` hostname), and `CF_ACCESS_AUD` (the Access application's audience tag) using protected environment configuration. Do not put tokens or credentials in frontend code or source control.
5. Create a Cloudflare Access self-hosted application for the private hostname and allow only the owner email. The application policy protects the page; the Worker independently verifies Access JWT signature and configured identity for every review API request.
6. Run the migration against the newly created D1 database, then deploy the separate private Worker.

Preparation and validation commands (after Cloudflare resources are created and values filled in):

```bash
pnpm build
pnpm exec wrangler d1 migrations apply chematlas-private-review --local --config wrangler.private-review.jsonc
pnpm exec wrangler d1 migrations apply chematlas-private-review --remote --config wrangler.private-review.jsonc
pnpm exec wrangler dev --config wrangler.private-review.jsonc
pnpm exec wrangler deploy --config wrangler.private-review.jsonc
```

`wrangler.private-review.jsonc` is deliberately separate from `.openai/hosting.json`. The placeholder ID is not a deployable resource ID. Do not run the remote migration or deploy until the private hostname, resources, Access policy, and owner values have been reviewed.

## Image processing and migration boundary

Question PNG generation still uses the dashboard's existing browser PDF.js rendering and source mappings. Workers only validate, store, retrieve, and review generated PNGs. PyMuPDF or other native PDF extraction remains an offline/batch workflow. Original source PDFs and question records are unchanged.

Existing local JSON and PNG files are not automatically copied to cloud resources by this code. A separate one-time migration/import is required after D1/R2 provisioning; the hosted backup importer supports small archives up to 48 MiB. Cloud persistence tests in this branch use a D1-compatible test double and local filesystem/R2 adapters; they do not prove durability of an actual Cloudflare account/database.
