# Owner-assisted Stage 6 verification

Use your normal Chrome browser and the approved account on the [isolated staging Worker](https://chematlas-student-stage6-test.chematlas-hub.workers.dev/). Artifact 14074740993 is the expected release. Production remains **NO-GO** pending the evidence below.

## Run one read-only check

1. Open staging in the signed-in tab. Open Chrome DevTools Console with Ctrl+Shift+J.
2. Review [owner-verify.js](owner-verify.js), open its Raw view, and run the source in the **staging tab's** Console. If Chrome blocks pasting into the Console, save the reviewed script as a DevTools snippet under Sources → Snippets and run it there.
3. Share the final JSON only. Expect 34 of 34 hashes to match, an empty failures array, and four admin entries with status 404 and workerDenial true. A redirect or failed version match means the run did not establish a valid staging session or release identity.

The verifier uses GET requests to same-origin staging paths and hashes the actual received bytes with SHA-256. It prints the catalog digest and any mismatches. It checks both catalogs, the worksheet data, all eight source PDFs, PDF worker, version metadata and JS/CSS. It does not read cookies, JWTs, storage, or credential fields. PowerShell's HTTP client cannot reuse the approved Chrome session here without a separate authentication mechanism, so the browser performs the comparison in one run.

## Four browser checks

- **Question Bank and detail.** Open Question Bank, select a unit or type and try a search. Open a result and confirm its question and source page render. Check browser Back restores the bank.
- **Deep link.** Open `/?view=detail&question=mcq-2008-1-29` on the staging hostname, then refresh. Confirm the same question and original source render.
- **Practice Builder and export.** Add one question to a temporary worksheet, open Practice Builder, preview, then choose Download PDF. Open the PDF and confirm the selected question is present and readable. Report any unexpected nearby question, printed answer or scoring text on a fallback page. Keep the PDF local.
- **Narrow layout.** Toggle Chrome's device toolbar with Ctrl+Shift+M while DevTools is focused, choose a mobile width around 390 px, and check that the bank and builder can be used without horizontal page overflow. The script covers signed-in admin UI, review API, backup, and backup import GET denial.

## Confirm the denied identity

In Cloudflare, go to Zero Trust → Insights → Logs → Access authentication logs. Filter to the staging Access application, the test time and a denied policy decision. Check that the event corresponds to the intended test and shows an identity-based policy decision. Share only the timestamp with timezone, staging application, identity provider if shown, decision and policy name or reason if shown. Omit the email, IP, cookies, tokens and full login URL.

If a log is unavailable, a tester may use an isolated browser profile with a genuine unapproved identity. Complete identity-provider sign-in and capture the subsequent Access denial for the staging app. A login page, missing OTP or provider error leaves the result inconclusive for post-authentication denial.

## Evidence to return

- Verifier JSON
- Bank/detail, deep link, builder/PDF and mobile pass or fail, with any symptom
- Denial event summary or post-authentication denial outcome

The latest read-only rollback evidence is in [readiness-recheck.md](readiness-recheck.md). Retain production version `af854526-9466-4c94-8091-c7d440c0c824` as the intended rollback candidate and recheck it before any separately authorized promotion.
