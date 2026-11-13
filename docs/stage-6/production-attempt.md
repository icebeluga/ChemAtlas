# Production promotion preflight

**Blocked before deployment.** The owner explicitly authorized only the sealed production promotion subject to the Stage 5 safeguards, with no merge into main.

- Target: `chematlas-student-private`.
- Application SHA: `3c78883006beb48c2dab68443e6e93b87bb9a769`.
- GitHub Actions run `43501394152`, artifact `14074740993`.
- Sealed tar SHA-256: `e8ed2136875a8b1093a619c41eca5f4a96d9e17a1e4e5b11b29b25de63c79500`. Archive and manifest hashes matched. Stage 5 manifest verification passed against the exact application checkout, the reviewed inputs, the sealed build files and the validation evidence.
- Fresh read-only Wrangler checks confirmed deployment `b966bf0e-4be3-4191-aa47-c404108b85e8` with 100% traffic on `af854526-9466-4c94-8091-c7d440c0c824`. The exact rollback version was also retrievable directly as version 6.
- GitHub main at `25c4528307776533575f8f07993e35a851798156` runs the legacy release workflow. That workflow builds source `63fd7e4b5287d74f66227742e8b2a4f47e37920f`. The Stage 5 production workflow is still an inactive example, explicitly requires main, and expects an approval record and matching environment approval digest. The required approval record is absent from main.

The application passed [Stage 6 staging verification](owner-results.md). The authorized production execution remains blocked until the Stage 5 production workflow and approval record can be installed on main with separate authorization. No workflow was dispatched, no release was deployed, and no rollback or production setting change was made. Post-release application checks were not run. No change to main or the private review service was made.
