# Stage 6 release decision

**NO-GO pending authenticated staging evidence.**

## Staging evidence

- The owner retrieved `/student-version.json` with a genuine approved account. The response matched application `3c78883006beb48c2dab68443e6e93b87bb9a769`, workflow `84edb90d838e53ee63db81f4c60afd922e650bcf`, catalog count 1,564, and catalog SHA-256 `96d67555cb3474aab1d49df6a7a38f1282e4617cb07c3a707d73c679f2bbf7e9`. This verifies the served version metadata. Independent hashing of the served catalog is pending.
- The owner reported that an unapproved account could not access staging. The observation does not establish whether the identity provider completed authentication and Access then rejected the identity, or whether the session stayed at a login challenge. A sanitized Access denial event or explicit denial after successful identity-provider authentication would confirm the remaining gate.
- Anonymous probes previously verified signed Access challenges across 44 paths.
- The verification browser reached Cloudflare sign-in and did not establish a signed-in session. The authenticated Question Bank, deep link, Practice Builder and export, live catalog and asset hashes, PDF rendering and source downloads, and authenticated admin/backup denial remain pending. Continue with the [hosted checklist](hosted-checklist.md).

## Production rollback inventory

A read-only Cloudflare API check returned deployment `b966bf0e-4be3-4191-aa47-c404108b85e8` with 100% traffic on `af854526-9466-4c94-8091-c7d440c0c824`. The version was retrievable directly and appeared first among six versions returned in the Worker inventory. This establishes that the exact current version is retained and available as the intended rollback candidate. Recheck it immediately before any authorized promotion and retain the deployment/source correlation in [resume.md](resume.md). A rollback was not executed and future rollback execution has not been tested on production.

Production and main were untouched. The next decision requires the outstanding authenticated checks and separate explicit owner approval for any promotion.
