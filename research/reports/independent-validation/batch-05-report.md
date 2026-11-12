# Independent validation Batch 5 — samples 17–21

## Frozen revision and lock

- Branch: `work/automatic-pdf-boundaries`
- Detector revision: `34dbaf1cf2804f6c32c45affdb2adfa92a7a86b1`
- Detector SHA-256: `11648b5870d8a988b7ec0150b6efa7ad5417a358517aa7301f091d23d852a736`
- Pre-render selection lock: `batch-05-lock.json`; all five questions were selected before proposal generation.
- Baseline suite at frozen revision: 45 passed, 0 failed, 0 skipped.
- All five locked cases were visually scored before any detector edit.

## Question results

| Sample / source | Proposed crop | Completeness | Cleanliness | Readability | Routing / result |
|---|---|---|---|---|---|
| 17 `mcq-1984-53-128`, bank-01 p.128 | `[14,381.78,221.58,542.55]` | **Fail:** stem and choice E are clipped at right edge | Fail for usable extraction | Fail: clipped | **False automatic approval** |
| 18 `frq-2016-1-385`, bank-02 pp.385–386 | `[29.12,260.7,575.07,679.51]`; `[48,48.15,577.82,510.13]` | Visible 2019 Q1 parts a–h and figures are present; catalog ID says 2016, source says 2019 | Minor excess heading/directions/example content | Pass | Correct manual review for provenance mismatch; identity unresolved |
| 19 `mcq-2002-15-754`, bank-03 p.754 | `[14,296.4,306,425.96]` | **Fail:** shared heating graph for Q15–16 omitted | Fail as usable extraction | Text readable, but required graph absent | **False automatic approval** |
| 20 `frq-2010-4-921`, bank-04 pp.921–922 | `[26,148.15,587.6,591.38]`; `[48.72,52.41,583.41,380]` | Pass: parts a–c present | Minor: heading and worked example retained | Pass | Correctly manual-routed for continuation |
| 21 `frq-2011-1-1220`, bank-05 p.1220 | `[26,294.3,585.27,567.07]` | **Fail:** referenced balanced-combustion equation above stem is outside crop | Fail as complete extraction | Text readable, dependent equation missing | Correctly manual-routed because graphics expected but none included |

## Metrics (n=5; frozen detector)

- Complete and clean: **0/5**.
- Complete with minor cleanliness issue: **1/5**.
- Critical incomplete extraction: **3/5**.
- Source/catalog identity unresolved: **1/5**.
- Correctly routed for review: **3/5** (including the identity discrepancy).
- False automatic approvals: **2/2 automatic approvals**.
- Independent success count: **0**; development/provenance cases are excluded from later success measurements.

The three extraction failures reveal distinct gaps: text-edge clipping despite full answer-marker coverage; missing shared stimulus on a neighboring region; and a formula dependency above the question body. The FRQ year mismatch shows the catalog identity check also needs to detect source/catalog conflicts. All findings are recorded against the frozen detector hash. Earlier frozen-validation results remain unchanged.

Batch panels and exact detector proposals are preserved in `batch-05-panels/` and `batch-05-proposals.json`. No detector edits were made during scoring.
