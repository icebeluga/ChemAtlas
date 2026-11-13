# Stage 6 staging deployment

Artifact 14074740993 was deployed only to `chematlas-student-stage6-test`. The Cloudflare deployments API confirmed version `462adae6-b789-4e37-9cd6-266db85b3b7c` at 100% of staging traffic.

- Sealed tar SHA-256 `e8ed2136875a8b1093a619c41eca5f4a96d9e17a1e4e5b11b29b25de63c79500`. All 88 sealed files matched the manifest before deployment. The overlay changed only the Worker name fields and enabled the protected staging hostname.
- Uploaded application SHA `3c78883006beb48c2dab68443e6e93b87bb9a769`. Sealed student catalog has 1,564 records and SHA-256 `96d67555cb3474aab1d49df6a7a38f1282e4617cb07c3a707d73c679f2bbf7e9`. Signed-in live response verification is pending.
- Post-deploy settings showed static `ASSETS` and exactly the expected two Access variables with matching values. Preview URLs were disabled. No private review, D1, or R2 bindings were present.
- Signed anonymous Access redirects verified across 44 paths, covering the application, deep links, static bundles, both catalogs, all eight source PDFs, worksheet assets, and admin/backup routes. These are edge challenge results. Signed-in admin denial remains pending.
- The owner confirmed the approved-users policy attachment. The Wrangler OAuth application's Access listing returned no results, so policy identity relied on dashboard confirmation and signed edge evidence.
- The sealed config uses compatibility date 2026-11-12 and disabled observability, differing from the Hello World placeholder. The deployment retained the verified Access variables.
- Genuine allowed and denied session results remain pending. Production promotion remains blocked.
