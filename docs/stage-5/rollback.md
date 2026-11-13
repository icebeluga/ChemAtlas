# Student rollback

The historical verified rollback source is `63fd7e4b5287d74f66227742e8b2a4f47e37920f`. Its catalog contains 1,542 records and its release predates the separate worksheet export registries. The [rollback source inventory](rollback-source.json) records the previous catalog and bundled PDF hashes and the absence of the new worksheet exports. Rolling back to that version restores the older feature set. For later releases that include worksheet exports, the prior version restores its own matching registry and fragment PDF along with its code, catalog and PDF banks.

Before promotion, identify the active 100% student Worker version, verify it against its known-good release record, and retain that exact UUID. The proposed release script rejects a mismatch between that approved UUID and the active version. If deployment checks fail after the new version might be active, it attempts to restore the preflight UUID and verifies the reported version and anonymous Access. An error that prevents confirmation requires owner intervention through the Worker’s Deployments screen.

For an explicitly authorized manual rollback, choose the recorded UUID under **Cloudflare → Workers & Pages → chematlas-student-private → Deployments → Rollback**. Confirm 100% routing to that version. Recheck authorized and denied sessions, version identity if available, catalog and worksheet availability, source PDF requests, and denial of admin and backup paths. Account for open tabs that may still request newer bundle filenames. Preserve the rollback action and resulting version in the release record.

The rollback rehearsal is offline. It checks application and asset identity against historical Git blobs and validates package handling without touching a live Worker. Private review Worker versions, D1 backups and R2 backups require their own documented restoration and verification.

[Cloudflare Worker rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
