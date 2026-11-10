# ChemAtlas Public UI Recovery — Investigation Checkpoint

Date: 2026-11-10
Branch: work/public-ui-recovery
Base: main at 95c09c0cf1cd703cb8c30f7e23da47bb4571cc98

## Verified Site state
- Site project: appgprj_6aef507724448191a521d9deccde9f2f
- Latest saved version: 48
- Version 48 source: 2b63a49a778459253035ec2871a84d96a31b5400
- Version 48 archive metadata: tar, 74,342,400 bytes, 88 files, SHA-256 d146621c04ee5914774f1ba6ab433c998667a995c374407e2071c76feecc4730
- Latest publish deployment appgdep_6af11d6f95388191b7d0264581de98c3 succeeded at 2026-11-09T01:10:13Z for the existing Site URL.
- The Sites connector exposes version metadata and screenshot URLs here, but no source-archive retrieval/materialization operation. No Site save or deployment was performed.

## Git source investigation
- Repository default branch: main at 95c09c0cf1cd703cb8c30f7e23da47bb4571cc98.
- GitHub reports the version 48 source SHA as absent: commit lookup for 2b63a49a778459253035ec2871a84d96a31b5400 returned “No commit found.”
- Authenticated git clone was unavailable in this workspace (Git could not obtain credentials); GitHub's connected read/write API was used for remote history and this checkpoint.
- Available branches: main, work/online-question-image-review, work/private-review-deployment, work/question-crop-verification, work/question-image-review-dashboard, backup/crop-checkpoint-482a83d.
- work/private-review-deployment is 18 commits ahead of main, with main as merge base. Its changes add private review routes/storage and make small app/page.tsx, globals.css, package.json, and catalog edits. It is not a safe public UI recovery base; no screenshot-2 target source was identified there.
- The default branch's app/globals.css and app/page.tsx are the existing sidebar-era public interface. The only supplied attachment in this task workspace is the pasted task note; the two referenced comparison screenshots are not present.

## Save-failure evidence matrix
| Hypothesis | Evidence | Conclusion |
| --- | --- | --- |
| Unsaved local changes | No local project checkout or working artifacts supplied; original editor session content cannot be read here. | Unknown |
| Unpublished Sites version | Sites reports latest saved version 48, and exposes only saved versions; no draft/checkpoint retrieval surface is available. | Unknown; no unpublished version verified |
| Git branch divergence | Version 48 SHA is not in GitHub; available public/review branches do not expose the provided SHA. | Confirmed divergence between Site provenance and reachable Git refs; causal path unknown |
| Workspace loss | Current task workspace has no repository checkout. | Current workspace lacks source; whether an earlier checkout was lost is unknown |

## Catalog and implementation status
- No question catalog changes were made.
- Independent comparison of catalog IDs, duplicate/source mappings, totals, and changes is pending because the repository checkout and full catalog data are unavailable through the current source access path.
- No source was reconstructed. Implementing a substitute without Screenshot 2 or verified current source would risk replacing existing behavior and inventing visual details.
- No TypeScript, build, lint, browser, responsive, navigation, question/PDF, or catalog validation was run.

## Blockers and next recovery inputs
1. Provide a repository checkout or enable authenticated Git access for this workspace.
2. Provide Screenshot 1 and Screenshot 2 as attachments.
3. If available, provide/export the Site version 48 source archive or the original editing-session checkpoint/source.
4. If the original source cannot be recovered, proceed with a labeled reconstruction after obtaining Screenshot 2 and a usable local repository checkout.

## Safety and parallel task boundary
- GitHub main and the existing public Site were not modified.
- work/private-review-deployment and all private-review Cloudflare resources were not modified.
- No production deployment, merge, cherry-pick, catalog edit, or generated question image was made.
