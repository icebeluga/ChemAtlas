# ChemAtlas — Overnight Website Recovery and UI Restoration Report

Date: 2026-11-10
Status: **Blocked after source investigation; no UI code was changed**

## A. Verified root cause

The currently saved and published ChemAtlas Site is version 48. Sites metadata confirms its source SHA is `2b63a49a778459253035ec2871a84d96a31b5400`, with an archive of 88 files (74,342,400 bytes; SHA-256 `d146621c04ee5914774f1ba6ab433c998667a995c374407e2071c76feecc4730`). Its latest production publish succeeded at 2026-11-09T01:10:13Z.

GitHub reports that SHA is not a commit in `icebeluga/ChemAtlas`. The original editing-session metadata identifies the conversation/thread but provides no accessible source checkpoint. The Site connector available here returns saved-version metadata and screenshot URLs but does not expose a source-archive retrieval/materialization operation.

This confirms that the Site's version-48 provenance is not reachable from the repository refs inspected here. It does **not** establish whether later edits were unsaved, were lost from a temporary workspace, or exist in a hidden Sites draft. The causal save failure remains unknown.

## B. Recovery results

- No exact Screenshot 2 source was recovered.
- No reconstructed UI was made. The provided task workspace contains the pasted note only; neither Screenshot 1 nor Screenshot 2 is present.
- The accessible GitHub default branch has the existing sidebar-era public page and styles. The private-review branch is 18 commits ahead of main and includes private review infrastructure plus small shared-file changes; its available public CSS still contains the sidebar layout. It is not a safe base for this public UI recovery.
- Current workspace contains no repository checkout. Authenticated `git ls-remote` failed because no Git credential was available to command-line Git.
- Catalog reconciliation is pending. The prior Phase 2 brief reports 1,542 indexed questions (1,266 MCQ and 276 FRQ), but this work did not independently validate IDs, duplicates, mappings, or newer-vs-older catalog differences.

## C. Technology and implementation

Repository `package.json` on main specifies React 19.2.6, TypeScript 5.9.3, Vinext 1.0.0-beta.5, Vite 8.0.13, Tailwind CSS 4.2.1, and PDF.js 6.4.299. These versions were inspected through GitHub's connected file access.

The Sites workflow skill was read to establish the supported source/archive workflow. No React, TypeScript, CSS, PDF, or browser implementation skill was applied because the source checkout and visual target were unavailable. No implementation, build, lint, or browser test ran.

## D. Visual comparison

No development screenshot exists because no development build could be created. Screenshot 2 was not included in the current task's attachments, so its layout, color, typography, card composition, and responsive behavior could not be directly measured. The Site's saved-version screenshot URL corresponds to version 48 and cannot substitute for the missing target image.

## E. Question catalog reconciliation

No catalog files were changed. No stable-ID comparison, schema audit, duplicate check, MCQ/FRQ recount, source-mapping check, or count-logic comparison was completed. The approximate 1,542-versus-1,651 discrepancy remains unverified; no questions were fabricated or added.

## F. Test results

| Check | Result |
| --- | --- |
| Current saved Site version and deployment | Verified: version 48; production deployment succeeded |
| Git branch/default-branch history | Verified through connected GitHub API |
| Version-48 source commit in GitHub | Not found |
| TypeScript | Not run; no checkout |
| Production build | Not run; no checkout |
| ESLint | Not run; no checkout |
| Browser and responsive checks | Not run; no local build or target screenshot |
| Navigation, filters, question/PDF, Practice Builder | Not tested |
| Catalog/data validation | Not run; full catalog comparison unavailable |

## G. GitHub checkpoints

Created and verified remote branch `work/public-ui-recovery` from `main` at `95c09c0cf1cd703cb8c30f7e23da47bb4571cc98`. Investigation checkpoint commit: `49cbf930d711adc7c2c07be7ad3f5c2ac22c8223`.

Changed file: `docs/public-ui-recovery-investigation.md` (this report). The remote branch head and committed file were read back through GitHub after the commit. No application code or catalog data is in this checkpoint.

## H. Deployment preparation

No deployment was prepared because no recovered or tested source tree exists. The existing Site is currently version 48, and its deployment is verified successful. No publish or save action was performed. A rollback procedure was not exercised; the Sites version history does expose saved versions, but this task did not attempt any production deployment or rollback.

## I. Unresolved issues

Blocking:
- Retrieve the version-48 source archive/original editing-session checkpoint, or provide an authenticated repository checkout.
- Provide Screenshot 1 and Screenshot 2.
- After inputs are available, compare candidates, restore/reconstruct the UI, reconcile catalog data, build, and run desktop/tablet/mobile and functional tests.
- Verify the supported deployment and rollback procedure for the existing Site using the recovered tested source.

Unverified:
- Whether an unpublished Sites draft exists.
- The cause of the later UI save failure.
- Catalog additions or removals behind the displayed count difference.
- Any Screenshot 2 interactions and responsive behavior.

## Parallel Task Compatibility

- Final branch and commit: `work/public-ui-recovery`, `49cbf930d711adc7c2c07be7ad3f5c2ac22c8223`.
- Shared files/interfaces affected: none by implementation; checkpoint adds only `docs/public-ui-recovery-investigation.md`.
- Conflicts detected: `work/private-review-deployment` touches `app/page.tsx`, `app/globals.css`, `package.json`, and `public/questions.json`, in addition to its review-system additions. No shared code was changed in this task.
- Catalog/API concerns: the private-review branch changes the public catalog file and adds private review APIs. Keep those changes isolated; no review routes, APIs, admin screens, D1/R2 resources, or catalog edits were copied into this branch.
- Recommended integration sequence: recover and test public UI/catalog changes on this branch; finish private-review work on its own branch; then perform a file-level compatibility review of shared app/catalog files before any merge; keep private APIs and Cloudflare resources separate; obtain explicit production approval before Site publication.

## Save-failure evidence matrix

| Hypothesis | Evidence | Conclusion |
| --- | --- | --- |
| Unsaved local changes | No local project checkout or working artifacts were supplied; original editor contents are unavailable. | Unknown |
| Unpublished Sites version | Sites reports version 48 as latest saved; no draft/checkpoint retrieval surface is exposed. | Unknown; no unpublished version verified |
| Git branch divergence | Version-48 SHA is absent from GitHub refs; review branches diverge from main but do not expose that SHA. | Repository/Site provenance divergence confirmed; cause unknown |
| Workspace loss | Current workspace has no project checkout. | Current workspace lacks source; earlier loss is unknown |

## Safety and parallel-task boundary

GitHub `main`, the published ChemAtlas Site, `work/private-review-deployment`, and private-review Cloudflare resources were not modified. No merges, cherry-picks, deployments, catalog edits, secrets, or question images were created.
