# Worksheet recovery invariants

- Archive the exact observed legacy source string and its content identity in the existing worksheet IndexedDB before presenting it as saved recovery data. Keep each distinct snapshot, including snapshots superseded by a later old-tab write. If archival fails, retain the observation for retry and explain that it is available only in the current tab.
- Keep the original localStorage keys and historical migration and acknowledgment records intact. Compare against the original migration. Historical broad acknowledgments carry raw data but cannot prove which drafts were recovered.
- Present each archived snapshot separately. Acknowledge only the identity on the selected snapshot, and check its outstanding recoverable drafts again in the transaction. Later snapshots remain independent.
- Give recovered entries stable provenance that distinguishes original draft IDs and exact normalized revisions. Append recovered copies and write their receipts in the same transaction. A retry may recover outstanding entries. An aborted transaction leaves both the existing worksheets and receipts intact.
- Preserve the ordinary v1 import and download behavior. Recovery writes append copies and respect the worksheet limit. Downloads label the exact raw snapshot or the worksheet collection they contain. A success message follows commit.

## Recovery states and rollout

An observed change moves from memory to the archive when its transaction commits. Recoverable drafts can be restored individually. The archived snapshot remains visible until acknowledged, even when every draft has a receipt. A snapshot with unparseable or unsupported content remains available in its original form. Acknowledgment clears the prompt for that snapshot and retains its archive. Quota failures leave earlier commits intact and expose any unarchived observations separately.

The current app can preserve an older write only after it observes and durably captures it. An older writer can replace a save before observation, and browser storage can be cleared. At rollout, ask users to export their worksheets, close every older ChemAtlas tab, and reopen the updated app before continuing to edit. The download for an unarchived observation should be saved before closing the tab.
