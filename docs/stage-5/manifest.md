# Student release manifest fields

All digests use lowercase SHA-256. Git commits are full lowercase 40-character SHAs. Use the candidate Git tree to determine source provenance.

| Document | Required fields and meaning |
| --- | --- |
| Reviewed source input | `schema_version` (1), `application_sha`, `inputs` containing `catalog` (path/count/SHA-256), `assets` (path to digest), `worksheet_assets` (file to digest), `source_pdfs` (URL, global page range, byte count and digest), and `shared_stimuli` (groups/links). |
| Sealed build | `schema_version` (1), `identity` (release ID, application SHA, validation workflow SHA, catalog hash/count), exact `inputs`, `build_files` (every dist file path and digest), `checks` (result and log digest), and null Worker version/previous known-good fields before deployment. |
| Owner approval JSON | `schema_version` (1), `application_sha`, `validation_workflow_sha`, numeric `run_id` and `artifact_id`, `package_sha256`, `release_manifest_sha256`, `hosted_access` and `previous_known_good`. |
| Hosted evidence in approval | `result` must be `passed`, `application_sha` and `package_sha256` must match the approved artifact, and `evidence` is a link to the authorized isolated environment's recorded results. |
| Prior release in approval | `application_sha`, exact Cloudflare `worker_version` UUID, and `manifest_reference` to immutable prior artifact or version evidence, including its source catalog, export asset availability and PDF hashes. |
| Deployment record | Sealed manifest plus `promotion_workflow_sha`, populated `previous_known_good`, `status` and actual `cloudflare_worker_version` when observed. Retain the preflight and post-deploy job logs with it. |

A source-input manifest identifies a reviewed source. A successful check and matching archive establish package identity. Owner approval binds that exact archive to an isolated hosted test and a verified rollback version.
