# ChemAtlas — independent private student Worker

The stacked GitHub Pages + Supabase migration adds a separate static build. See
[its setup, security model, verification and approval gates](docs/pages-supabase/README.md).
The historical Worker build and release history below remain available. Pages is
inactive until the owner completes and approves the documented production handoff.

The student ChemAtlas application uses Vinext (Next.js-compatible UI), Vite, the
Cloudflare Vite plugin, and a Cloudflare Worker. The eight canonical source PDFs,
question catalog, question IDs, classifications, and worksheet generator are
preserved from `integration/chematlas-unified`.

**Do not deploy this branch until its owner has configured and verified a
Worker-level Cloudflare Access email allowlist.** The Wrangler source configuration
starts with `workers_dev: false`, `preview_urls: false`, and no public routes.
All assets must pass through the signed Access JWT check. A missing configuration,
token, or valid signature denies the request.

This student deployment excludes the ChatGPT Sites mock sign-in and connector
preview. Student requests to `/admin/**` and `/api/admin/**` are always blocked
rather than exposing the separate private question-review service.

## Development and verification (no deployment)

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run check
pnpm run check:private
pnpm run build
pnpm run check:private
pnpm test
python -m unittest discover -s tests -p 'test_*.py' -v
```

Local browser testing requires a **local-only simulated Cloudflare Access JWT**
configured for development or signed test fixtures. Without Access settings,
the built Worker fails closed. Never use a mock identity or `access.dev` in a
production or deployable configuration.

See [the step-by-step migration and release gate](docs/cloudflare-student-deployment.md).
For the original unified architecture and baseline tests, see
[the integration notes](docs/unified-integration.md) and
[verification record](docs/unified-verification.md).

## Boundaries

- The canonical catalog and eight original source PDFs stay under `public/`.
- The student application includes Question Bank, Practice Builder, PDF
  worksheets with shared stimuli, navigation, and browser progress.
- The Progress view supports JSON export/import for domain migrations.
- Locally imported personal PDFs reside in browser IndexedDB and are **not**
  part of the progress JSON; move those originals separately if needed.
- The existing private review Worker and its D1/R2 bindings are **not** part of
  this deployment. The student build uses original PDF fallback for review
  images until an independently authorized read-only integration is audited.
