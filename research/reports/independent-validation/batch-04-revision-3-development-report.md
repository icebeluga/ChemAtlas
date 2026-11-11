# Batch 4 revision 3 — FRQ crop correction (development case)

## Frozen context

- Branch: `work/automatic-pdf-boundaries`
- Failure recorded under detector revision `e0bf22ddf1b2094cf5ec6f36db25005a7c9d74af`, SHA-256 `aa87de11393cbd864cd0b4551c09ae167a6a0d2e8f1c5ed5bdc91f4b33eedca8`.
- Corrected detector SHA-256: `245c187a20988b0528b3b4d0f4f8c505428ce98aceb26fe020fbc9e84a5920e1`.
- Sample 8, `frq-2024-4-2123`, remains development data. Its original revision-2 failure result and selection lock are unchanged.
- Regression suite: `python -m unittest discover -s tests -v` — **42 passed, 0 failed, 0 skipped**. Tesseract scanned-page regression executed.

## Before and after

The previous proposal used one rectangle per page: catalog page 2123 / PDF page 23 `[18, 40, 577, 797]`; catalog page 2124 / PDF page 24 `[18, 40, 577, 797]`. It included large writing areas, a response banner, page headers, footer and printed page number. The visual extraction was complete but failed cleanliness.

The revised detector emits four ordered regions:

| Order | Catalog / PDF page | Coordinates (PDF points) | Content |
|---:|---|---|---|
| 1 | 2123 / 23 | `[0.0, 69.5, 576.5, 402.5]` | Setup, calorimeter diagram, data table, part (a) |
| 2 | 2123 / 23 | `[12.0, 518.5, 565.0, 558.0]` | Part (b) |
| 3 | 2124 / 24 | `[31.5, 76.0, 583.5, 131.0]` | Part (c) |
| 4 | 2124 / 24 | `[54.5, 298.0, 514.0, 334.5]` | Part (d) |

The comparison panels were inspected against the original PDF. They retain all question setup, data, diagram and parts (a)–(d). They exclude the large blank response areas, exam response banners, running headers, copyright/footer notices, printed page 15, “GO ON” and Studocu overlay. The part prompts and diagram/table are readable, with the original soft-scan/bleed-through limitation.

## Verdict

- Completeness: **pass on visual review**.
- Cleanliness: **pass on visual review**; tight text-led segments replace full-page continuation crops.
- Readability: **pass with limitation** for the soft scan.
- Routing: **manual review remains required** because the page is raster scanned and graphics are not fully certifiable from OCR geometry.
- Validation status: development only; this repaired case is not an independent success.

Evidence files and SHA-256 values are recorded in `batch-04-revision-3-development-evidence-manifest.json`. The revision-2 failure report and original Batch 4 selection locks remain preserved unchanged.
