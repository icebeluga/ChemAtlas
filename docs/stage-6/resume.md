# Stage 6 follow-up

**NO-GO.** The active version is traced to its Git source. Qualification of that version for rollback and isolated hosted candidate tests remain pending.

## Production and rollback

- The owner verified Worker `chematlas-student-private` version `af854526-9466-4c94-8091-c7d440c0c824` at 100% traffic. The [successful GitHub deployment](https://github.com/icebeluga/ChemAtlas/actions/runs/43441051919) shows a manual dispatch running Wrangler, the pinned checkout SHA `63fd7e4b5287d74f66227742e8b2a4f47e37920f`, a built catalog of 1,542 records, and that exact UUID confirmed active after deployment. It verified Worker-level Access and anonymous redirects at deployment time.
- The [source inventory](../stage-5/rollback-source.json) identifies the catalog as `public/questions.json` with SHA-256 `ecd44472e2b0aa935d3e31ce67f7977ff090c6c2c946574921da4b7efc95defe`, and contains the eight source PDF hashes. This release predates the separate worksheet registries and fragment PDF. Those are source and build provenance findings. Authenticated live asset bytes and worksheet availability were not independently checked.
- The deploy log also records preceding version `d4e344f6-550f-47c4-bb44-3304e2174f6b`. The [earlier read-only preflight](https://github.com/icebeluga/ChemAtlas/actions/runs/43439889493) reported the same UUID, while building the pinned source for validation. It does not establish the source of that preceding UUID.
- The active version is the proposed rollback target for a future Stage 4 promotion. Obtain the live deployment ID, version/traffic allocation, and confirmation that the UUID is still selectable for rollback. Corroborate Access coverage and run an authorized signed-in baseline smoke, including the catalog hash and worksheet endpoint availability. Recheck the active UUID immediately before promotion. The present session lacks authorized Cloudflare dashboard/API access. Owner-provided read-only dashboard exports plus signed-in results can supply the missing evidence.

## Isolated staging preparation

The exact [sealed Stage 4 package](https://github.com/icebeluga/ChemAtlas/actions/runs/43501394152/artifacts/14074740993) is selected. Its tar SHA-256 is `e8ed2136875a8b1093a619c41eca5f4a96d9e17a1e4e5b11b29b25de63c79500`. Verify it before extraction into a clean workspace. Use [the config generator](staging-config.mjs) from the extracted root with a unique name of the form `chematlas-student-stage6-<suffix>`. It writes a sibling Wrangler config with public workers.dev and preview URLs disabled. It does not edit the sealed bundle or deploy. Record the overlay and confirm every sealed file retains its digest.

Have the owner provision or name an isolated Worker, attach a dedicated Access app to the isolated destination and configure its audience and team domain. Preserve Worker-first static assets and the sealed compatibility date. Keep private service and D1/R2 bindings absent. Verify protection before exposing the staging hostname and keep previews off. Only after that and authorization for the named staging Worker, use the pinned Wrangler version from the candidate to deploy the sealed bundle with the staging config. Have the owner manage any hostname or Access settings, and verify them before and after the staging deployment. Follow the [hosted acceptance checklist](hosted-checklist.md) on the isolated URL.

## Minimum owner participation

1. Provide sanitized read-only production deployment/version evidence or an authorized read-only dashboard session. The owner can perform the signed-in baseline asset checks and share status, count and hashes. Production write access is unnecessary.
2. Provide the isolated Worker name, protected URL and confirmation that the dedicated policy and bindings are in place. Explicitly authorize deployment of artifact 14074740993 to that Worker only if delegating the upload. Otherwise, the owner can deploy and supply its version UUID. Any Access-policy change requires separate authorization.
3. Arrange two genuine test sessions through the identity provider, one already allowed and one explicitly denied by the staging policy. The owner or designated testers can complete sign-in themselves and share sanitized outcomes. A fresh anonymous browser needs no account or credential. Capture the denial after authentication and run direct asset checks in all three sessions. Do not share credentials or session tokens.

The release workflow stays inactive and the approval record stays pending. The production release checkpoint is separate from staging authorization.
