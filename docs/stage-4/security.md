# Authentication and isolation

The local built student Worker used an ephemeral RSA key and an intercepted fixture JWKS. Requests passed through the production fetch entry and Workers Static Assets router. Neither a real Cloudflare tenant nor private review storage participated.

| Check | Observed |
| --- | --- |
| Student page, JS and CSS | Signed GET 200, anonymous GET 403 |
| Student and rollback catalogs, builder, worksheet registries and fragments, PDF worker and all eight source PDFs | Signed HEAD 200, anonymous HEAD 403, malformed token GET 403. The signed browser also fetched the assets needed to render and export. |
| Admin UI/API, backup and import, percent-encoded admin and doubled slash path | 404 with valid and absent credentials. Signed POST denied as well. |
| Private cache | Tested status responses use `Cache-Control: private, no-store`. |
| JWT rules | Automated fixtures exercise correct audience, signature and identity, as well as failure paths. |
| Built package | Asset router runs the Worker first. Public Worker and preview URLs disabled in the config. Only ASSETS appears in the dry-run binding output. No review-dashboard or private storage implementation matched the client or server JS scan. Legacy shared CSS contains review styling, and protected source assets and the rollback catalog are present. |
| Hosted edge | **Release blocker.** Requires authorized and denied real identities and anonymous direct requests to the candidate in an isolated, protected Cloudflare environment. |

No live Access policy, D1/R2, private Worker, private review data or existing release pin was changed.
