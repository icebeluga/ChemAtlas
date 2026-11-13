# ChemAtlas Stage 2 executive summary

The recovered Sites v48 application adds the original student interface, separate Practice Builder, multi-draft worksheets and export stack. The Cloudflare repair pin inherits the existing integration and supplies the protected Worker build. The Question Bank restoration changes two files and still reads the Cloudflare catalog. GitHub's manual release workflow checks out the Cloudflare repair pin independently of the workflow's own commit.

| Report | Scope |
| --- | --- |
| [A. Source inventory](A-source-inventory.md) | Branches, ancestry, exact file comparison and external dependencies |
| [B. Feature comparison](B-feature-matrix.md) | Retention decisions and verification level |
| [C. Catalog reconciliation](C-catalog-reconciliation.md) | 109 Sites-only, zero Cloudflare-only, 864 shared records with field differences |
| [D. Architecture](D-integration-architecture.md) | Protected build, private-review separation, release pin and version-control safeguards |
| [E. Stage 3 plan](E-stage-3-implementation-plan.md) | Ordered integration, acceptance gates and rollback |

## Priority unresolved issues

1. **Catalog evidence.** Twenty-two of the 109 additions map to documented omissions. The other 87 need individual evidence. Six shared IDs have conflicting page spans and four change year. Check printed source identity before applying those differences.
2. **Visual parity.** A and C need a side-by-side reference run for student views. Historical unified browser tests cover a smaller integrated baseline.
3. **Hosted student behavior.** Actions logs confirm the pinned commit was deployed and passed anonymous post-deploy checks. The currently active Worker version, Access configuration and signed-in asset delivery still need confirmation during authorized release verification.
4. **Approved image delivery.** Preserve student PDF fallback and private review isolation. Decide separately whether students should receive approved images through a read-only channel.
5. **Crop confidence.** Retain proposal-only mode. Real-PDF holdout evidence still contains incomplete cases and source identity discrepancies.

Start Stage 3 from Cloudflare repair `63fd7e4b5287d74f66227742e8b2a4f47e37920f` and layer the Question Bank patch `dde51f0eea012e09cd24d780649485b0639e2cf6` before porting the rest of Sites v48. The audit branch uses the Cloudflare pin as its parent so its commit delta consists of audit documents only.
