# Required CI for the stacked student migration

This configures review requirements only. It does not authorize integration,
publishing, deployment, or changes to repository rules/settings.

## Exact check names

Select check names from the **GitHub Actions** source, not workflow titles:

| Check name | Workflow | Require when |
| --- | --- | --- |
| `Validate PR head application (no deploy)` | `ChemAtlas PR head validation` | Now, for PR #6 and all main PRs |
| `Validate GitHub Pages application (no deploy)` | `ChemAtlas Pages validation and deployment` | After approved PR #6 integration and PR #8 retargeting to main, before PR #8 integration |

The first name already exists and passed on PR #6 at
`061e05363fdcc99ff814f96b140d2521748b589c`. Its workflow validates the exact PR
head, including Node/Python tests, Worker build/privacy/dry run and student
browser regressions. It now also triggers for PRs targeting
`codex/student-archive-recovery`, so PR #8 gets the same check while stacked.
It remains triggered for main PRs after retargeting.

The second name is explicit and unique; previously that Pages job appeared as
`validate`. It runs the Pages build/privacy and browser/security scenarios plus
the existing TypeScript/lint/Node/Python and Worker checks. Both validation jobs
run without deployment credentials. No path filters or job-level conditions
skip either validation job for its configured PR targets.

Do not require `validate`, `package`, `deploy`, a workflow title, Cloudflare
promotion checks, or `Validate student release (no deploy) (candidate)`.
The release-validation candidate job checks the pinned historical Stage 4
application by default; it does not establish that the latest PR head passed.
Packaging/deployment are intentionally skipped on development/PR events.

## Enable the common requirement now

1. Open repository **Settings > Rules > Rulesets > Protect ChemAtlas Main**.
   Keep it active, targeting main, with the existing PR/deletion/force-push and
   no-bypass settings. Zero approving reviews can remain as configured; this
   change does not alter the owner's separate approval requirement.
2. Enable **Require status checks to pass** and choose **Add checks**.
3. Add exactly **Validate PR head application (no deploy)**. Select
   **GitHub Actions** as the expected source if offered.
4. Leave **Require branches to be up to date before merging** unchecked during
   the stacked transition. Both jobs already validate the exact latest head.
   Up-to-date enforcement is a separate decision after integration and would
   require base synchronization. No merge queue is configured by this work.
5. Save. Confirm PR #6 recognizes its successful head check. If the selectable
   check is stale or missing, rerun its existing pull-request validation run;
   a manual workflow_dispatch run is not a substitute for a PR/push check.

Do not add the Pages requirement at this stage: PR #6 predates that workflow
and cannot report its check. With no bypass actors, requiring an absent check
would leave PR #6 blocked in Expected/Pending.

## Add the Pages requirement at the stack transition

Only after separate owner approval permits PR #6 integration:

1. Retarget PR #8 to main after PR #6 is integrated. Preserve the stacked
   history; reconcile and revalidate any integration changes. This document
   does not authorize merging, rebasing, or changing the PR base now.
2. Confirm both checks have run and passed on PR #8's current head under the
   pull-request trigger. Rerun CI if needed; earlier-head results do not count.
3. Edit the same ruleset and add **Validate GitHub Pages application (no deploy)**,
   expected source **GitHub Actions**. Keep the first requirement as well.
4. Save before considering PR #8 integration. The steady-state main requirement
   is exactly those two checks. New main PRs inherit both workflow definitions.
5. Review the actual integrated SHA and validated artifact separately before
   any deployment. Keep `CHEMATLAS_PAGES_ENABLED` disabled until authorized.

The Pages workflow still packages only an enabled push to main. Development
pushes, PR events and manual validation runs cannot deploy. The existing Pages
environment approval setup and production variables are separate release gates.

## Check-name verification

GitHub exposes the required context as each check run's `name`. The Actions UI
can show a workflow/job grouping, but the name to add is the exact job name
above. Verify current-head names/status/source through the PR Checks tab or:

```powershell
gh api repos/icebeluga/ChemAtlas/commits/<full-head-sha>/check-runs `
  --jq '.check_runs[] | {name,status,conclusion,source:.app.slug}'
```

Keep checks tied to GitHub Actions rather than allowing any app to supply the
same context. Required workflows skipped by filters remain pending, which is
why the stage boundary and PR triggers matter. For GitHub's exact behavior, see
[required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
and [job names](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idname).
