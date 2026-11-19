# Worksheet recovery invariants

- Archive the exact observed legacy source string and its content identity in the existing worksheet IndexedDB before presenting it as saved recovery data. Keep each distinct snapshot, including snapshots superseded by a later old-tab write. If archival fails, retain the observation for retry and explain that it is available only in the current tab.
- Keep the original localStorage keys and historical migration and acknowledgment records intact. Compare against the original migration. Historical broad acknowledgments carry raw data but cannot prove which drafts were recovered.
- Present each archived snapshot separately. Acknowledge only the identity on the selected snapshot, and check its outstanding recoverable drafts again in the transaction. Later snapshots remain independent.
- Give recovered entries stable provenance that distinguishes original draft IDs and exact normalized revisions. Append recovered copies and write their receipts in the same transaction. A retry may recover outstanding entries. An aborted transaction leaves both the existing worksheets and receipts intact.
- Keep archive-only dispositions separate from recovery receipts. A disposition targets the selected snapshot ID and entry index, refers to the immutable entry in that snapshot, and leaves the worksheet collection and source unchanged.
- Preserve the ordinary v1 import and download behavior. Recovery writes append copies and respect the worksheet limit. A success message follows commit.

## Recovery states and rollout

An observed change moves from memory to the archive when its transaction commits. Outstanding entries can be recovered or explicitly kept archived without importing. An ordinary recovery writes a worksheet and receipt together. If a competing keep action commits first, a stale ordinary recovery is rejected. If recovery commits first, a competing keep action leaves that receipt and worksheet intact.

A snapshot with only recovered entries can be acknowledged. A snapshot with archive-only choices moves to **Archived legacy snapshots** once all its entries have been resolved. The archive retains the source and lets the user explicitly recover an entry that was kept there. This later action writes the same idempotent receipt as ordinary recovery. Unparseable or unsupported content remains available as archived source. Quota failures leave earlier commits intact and expose unarchived observations separately.

The current app can preserve an older write only after it observes and durably captures it. An older writer can replace a save before observation, and browser storage can be cleared. At rollout, ask users to export their worksheets, close every older ChemAtlas tab, and reopen the updated app before continuing to edit. The download for an unarchived observation should be saved before closing the tab.

## Restoring downloaded source

Browser storage contains a JavaScript string. Source export is lossless when decoding produces the same sequence of UTF-16 code units. A well-formed string is written directly to `.json` in UTF-8. To reconstruct it, decode the bytes with `new TextDecoder("utf-8", { ignoreBOM: true, fatal: true })` so a leading `U+FEFF` is retained. Valid v1 backups in this form can be imported as usual.

Strings containing isolated surrogates use a UTF-8 `.utf16-source.json` envelope. Its `format` must equal `chematlas-legacy-source-utf16-code-units-v1`. Reading the UTF-8 file and running `JSON.parse(text).source` reconstructs the exact string, including isolated surrogates. For example, use the browser console on a disposable page and select the downloaded file when prompted.

```js
const picker = document.createElement("input");
picker.type = "file";
picker.onchange = async () => {
  const envelope = JSON.parse(await picker.files[0].text());
  if (envelope.format !== "chematlas-legacy-source-utf16-code-units-v1" || typeof envelope.source !== "string") {
    throw new Error("Unexpected archive format");
  }
  window.restoredLegacySource = envelope.source;
};
picker.click();
```

The envelope is an archive container. Worksheet import still validates a v1 backup before saving anything.
