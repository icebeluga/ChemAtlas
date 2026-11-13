# ChemAtlas Stage 6 release-readiness report

**NO-GO for production.** The sealed candidate passed integrity verification. Real-identity hosted checks and live rollback verification are outstanding. Owner approval for production has not been requested.

## Candidate and evidence

| Item | Verified value |
| --- | --- |
| Application SHA | `3c78883006beb48c2dab68443e6e93b87bb9a769` |
| Validation workflow SHA | `84edb90d838e53ee63db81f4c60afd922e650bcf` |
| Release-control branch and base | [Stage 5 controls](https://github.com/icebeluga/ChemAtlas/tree/release/chematlas-stage5-controls) at `c09f6c44df2b2e65aeb7942da09d0bfdab9499ef` |
| Stage 6 evidence branch | `verification/chematlas-stage6-hosted` |
| Exact artifact | [Run 43501394152, artifact 14074740993](https://github.com/icebeluga/ChemAtlas/actions/runs/43501394152/artifacts/14074740993) |
| Artifact ZIP SHA-256 | `220e3379e7a4c2497492da6fff13374068a6bec9bc516bbddc0783c2911102e9` |
| Sealed package SHA-256 | `e8ed2136875a8b1093a619c41eca5f4a96d9e17a1e4e5b11b29b25de63c79500` |
| Release manifest SHA-256 | `6107a2797b6b2d9d4d52526d1a13baec13e554d36889cba3b5019194d69af00a` |
| Student catalog | 1,564 records at `public/student-questions.json`, SHA-256 `96d67555cb3474aab1d49df6a7a38f1282e4617cb07c3a707d73c679f2bbf7e9` |

Downloaded the original GitHub artifact and compared the ZIP and embedded tar digests with Stage 5. The sealed and input manifests matched the Git records byte for byte. The Stage 5 verifier passed against the clean exact application checkout, including every dist file and seven evidence logs, worksheet registries and fragment PDF, eight source PDFs, six shared-stimulus groups and 17 links. The Actions run passed with 41 Node and 51 Python tests. The retained [sealed manifest](../stage-5/stage4-verified-build.json) contains individual hashes. Its local Worker smoke used synthetic tokens and an older emulator compatibility date. The Wrangler dry run used the configured date. The artifact was reused without rebuilding.

## Hosted and live status

| Required check | Stage 6 result |
| --- | --- |
| Isolated allowed identity | Blocked. No authorized isolated candidate endpoint or genuine allowed test session was available. |
| Isolated explicitly denied identity | Blocked. No genuine denied test session was available. |
| Isolated anonymous browser | Pending the isolated candidate endpoint. See the separate existing-production HTTP observation below. |
| Candidate routes, assets and admin | Stage 5 synthetic smoke passed. Hosted identity tests, deep links, byte checks and admin/backup denial are pending. No private service endpoint or data was used. |
| Production deployment ID, active version and allocation | Unknown. Cloudflare dashboard required sign-in and no authorized Cloudflare API session was available. |
| Deployed application, catalog and worksheet identities | Unknown. Anonymous probes cannot establish resource availability, contents or version behind the edge challenge. |
| Verified live rollback UUID | Unknown. The Stage 5 rollback source is historical evidence and requires corroboration against the current deployment. |

[Sanitized production probe results](production-anonymous.json) record 28 unauthenticated HTTP GETs, all of which returned HTTP 302 to the student Access login path, including direct resource requests. These probes concern the existing production hostname only. An Access login redirect shows the anonymous request was challenged at that path. It does not establish that the resource exists behind Access or that the Worker independently denies an authenticated student.

## GitHub release readiness

GitHub reports `main` at `25c4528307776533575f8f07993e35a851798156` with `protected: false`. The rulesets endpoint returned HTTP 403 with a private-repository plan restriction. No governance setting was changed. See [Stage 5 governance](../stage-5/governance.md).

Reviewed the inactive workflow and Cloudflare script. They bind the release to an exact application SHA, workflow SHA, reviewed inputs and artifact digests. Authorization requires the owner approval digest, matching hosted evidence and an approved rollback UUID. The Cloudflare script rechecks the currently active UUID before deployment. The [pending release record](pending-release.json) contains the verified fields and deliberately fails the approval gate. Keep the templates inactive while hosted evidence and rollback provenance are missing. The documentation branch is available for review, and a production-control PR is deferred until those facts can be populated.

The active production pin and workflow, main branch, live Access policies and private review service were not changed.

## Resolve the blockers

1. Identify and authorize a separate protected student Worker for this rehearsal. Give it its own Worker name, Access application or scoped destination, and audience. Confirm its host and configuration are isolated from production and private review. Have Access protection in place before exposing the hostname. Keep previews disabled unless protected and explicitly in scope. Use only the student static asset binding and the intended Access variables, without private service, D1 or R2 bindings. Use the verified tar and record the isolated deployment UUID and environment-only settings. [Cloudflare Workers Access configuration](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
2. Run the [hosted acceptance matrix](hosted-checklist.md) in separate genuine allowed, explicitly denied and anonymous sessions. Record time, status, redirects, expected hashes and outcomes without personal identifiers or credentials.
3. Through an authorized read-only dashboard session, inspect the existing production student Worker's Deployments and Access configuration. Record deployment ID, version IDs, traffic split and applicable route coverage. Tie the active UUID to a known-good application and artifact record, corroborating with the authorized version endpoint where available and direct catalog, worksheet and PDF evidence. A split deployment or uncertain provenance blocks the Stage 5 single-version rollback path.
4. Complete the approval record using verified evidence and the [Stage 5 manifest contract](../stage-5/manifest.md), then prepare a reviewable release PR and issue a new go/no-go report. Request separate owner approval after that report before merging, activating the workflow, changing the pin or deploying. Use the exact Stage 5 promotion procedure and verify the approved rollback UUID immediately before deployment.

Before distributing worksheets as answer-free, review every full-page fallback. Source pages may include neighboring questions, printed answers or scoring material.
