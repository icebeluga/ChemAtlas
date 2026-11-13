# ChemAtlas production release

**Controlled production release fully verified.** This supersedes [the preflight blocker](production-attempt.md).

| Record | Value |
| --- | --- |
| Target | `chematlas-student-private` |
| Sealed application SHA | `3c78883006beb48c2dab68443e6e93b87bb9a769` |
| Sealed package | Run 43501394152, artifact 14074740993, tar SHA-256 `e8ed2136875a8b1093a619c41eca5f4a96d9e17a1e4e5b11b29b25de63c79500` |
| Promotion | [Successful run 43521727574](https://github.com/icebeluga/ChemAtlas/actions/runs/43521727574), workflow SHA `df2128fe8245eea0fe521c9cbdbcb70220f72253` |
| Deployment record | [Artifact 14082938465](https://github.com/icebeluga/ChemAtlas/actions/runs/43521727574/artifacts/14082938465) |
| Cloudflare deployment ID | `6df2b920-7435-468e-b1a3-c852043fd49b` |
| Active Worker | `2002b172-9aa4-4975-881e-49abaf268b4f`, version 7, 100% traffic |
| Retained rollback | `af854526-9466-4c94-8091-c7d440c0c824`, version 6 |

On November 13, 2026, read-only Wrangler commands confirmed deployment allocation and retrieved both exact Worker version records. The downloaded deployment record ZIP matched GitHub's SHA-256. The record reports promotion of the active UUID and matches the sealed release manifest's identity, inputs, build hashes and check evidence. The promotion job passed its authorization, package verification and guarded Cloudflare checks. Seven independent anonymous probes returned signed Access challenges with the same production Access identity as before promotion.

## Owner-performed production acceptance

| Check | Owner-reported result |
| --- | --- |
| Approved-user authentication | PASS |
| Updated Question Bank | PASS |
| Question details and source PDF rendering | PASS |
| Practice Builder, worksheet preview, and PDF download | PASS |
| Unauthorized-user denial | PASS |

These five checks were performed by the owner in production. The assistant independently verified the Cloudflare and GitHub deployment metadata and anonymous Access behavior. The deployed package record identifies 1,564 catalog entries, SHA-256 `96d67555cb3474aab1d49df6a7a38f1282e4617cb07c3a707d73c679f2bbf7e9`, and validation workflow `84edb90d838e53ee63db81f4c60afd922e650bcf`. ## Authenticated production version verification

**PASS.** The owner retrieved `/student-version.json` from live production using their approved Cloudflare Access account. All five reported fields matched the sealed release manifest.

| Field | Verified value |
| --- | --- |
| `application_sha` | `3c78883006beb48c2dab68443e6e93b87bb9a769` |
| `catalog_count` | `1564` |
| `catalog_sha256` | `96d67555cb3474aab1d49df6a7a38f1282e4617cb07c3a707d73c679f2bbf7e9` |
| `release_id` | `chematlas-student-3c78883006beb48c2dab68443e6e93b87bb9a769` |
| `workflow_sha` | `84edb90d838e53ee63db81f4c60afd922e650bcf` |

Keep version 6 as the rollback candidate. Its exact version record remains retrievable. No rollback or redeployment was performed. Documentation was committed on the verification branch. No Access policy or private review service change was made.
