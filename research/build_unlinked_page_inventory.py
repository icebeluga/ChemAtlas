"""Create an evidence-first triage inventory; classifications are hypotheses, not edits."""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
audit = json.loads((ROOT / "page-audit.json").read_text())
geometry = json.loads((ROOT / "page-geometry.json").read_text())
unlinked = audit["unreferencedPages"]

PATTERNS = [
    ("Answer key / worked solutions", "high", re.compile(r"answer key|answers to the .* exam|\bans\s*:|correct answer|worked solution|answer explanation|multiple.choice diagnostics|diagnostic guide", re.I)),
    ("Scoring guidelines / rubric", "high", re.compile(r"scoring guidelines|scoring guide|scoring rubric|scoring worksheet|free.response scoring|scoring standards", re.I)),
    ("Exam reference tables / equations", "high", re.compile(r"standard reduction potentials|equations and constants|periodic table|thermodynamic data|gases, liquids, and solutions|reference (?:table|sheet)|electrochemical series", re.I)),
    ("Exam directions / cover / contents", "high", re.compile(r"free.response questions|multiple.choice questions|directions|table of contents|ap chemistry examination|ap chemistry:.*exam", re.I)),
    ("Teacher or AP Reading commentary", "high", re.compile(r"how well did students perform|student performance|mean score|common errors|teachers that might help|ap reading|students often|students frequently", re.I)),
    ("Response space / continuation page", "high", re.compile(r"additional page for answering|continued from the previous page|continue your response|space for your response|answer in the space", re.I)),
]

def load_ocr(page: int) -> str:
    path = ROOT / "ocr" / f"{page}.txt"
    return path.read_text(errors="replace") if path.exists() else ""

def classify(text: str, anchors: list) -> tuple[str, str, str]:
    for label, confidence, pattern in PATTERNS:
        if pattern.search(text):
            match = pattern.search(text)
            excerpt = text[max(0, match.start()-55):match.end()+100]
            return label, confidence, " ".join(excerpt.split())
    if anchors:
        head = " ".join(text.split())[:220]
        if re.search(r"\bANS\s*:", text, re.I):
            return "Answer explanation / solutions", "high", head
        return "Numbered question-like content; inspect", "medium", head
    if re.search(r"(?:\([A-E]\)|\b[A-E]\))", text) and re.search(r"\bwhich|\bwhat|\bcalculate|\bdetermine|\bexplain", text, re.I):
        return "Question-like content; inspect", "medium", " ".join(text.split())[:220]
    if len(text.strip()) < 45:
        return "Scanned/blank/low-text page; image review required", "low", " ".join(text.split())[:220]
    return "Other extracted text; manual review required", "low", " ".join(text.split())[:220]

rows = []
for page in unlinked:
    item = geometry.get(str(page), {})
    pdf_text = item.get("text", "") or ""
    ocr_text = load_ocr(page)
    text = pdf_text if len(pdf_text.strip()) >= 45 else ocr_text
    anchors = item.get("anchors", []) or []
    kind, confidence, evidence = classify(text, anchors)
    rows.append({
        "page": page,
        "triage_category": kind,
        "rule_confidence": confidence,
        "text_source": "PDF text layer" if text == pdf_text and pdf_text.strip() else "OCR" if ocr_text.strip() else "none",
        "pdf_text_chars": len(pdf_text.strip()),
        "ocr_text_chars": len(ocr_text.strip()),
        "question_number_anchors": ",".join(str(a.get("num", "")) for a in anchors),
        "evidence_excerpt": evidence,
        "full_text_reviewed_visually": "no",
        "catalog_change": "none",
    })

with (ROOT / "unlinked-page-inventory.csv").open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader(); writer.writerows(rows)
(ROOT / "unlinked-page-inventory.json").write_text(json.dumps({
    "scope": "Every source page not currently referenced by a question record",
    "page_count": len(rows),
    "method": "PDF text layer and available OCR triage with excerpted rule evidence; not visual review or confirmed content classification",
    "entries": rows,
}, ensure_ascii=False, indent=2))

counts = {}
for row in rows:
    counts[row["triage_category"]] = counts.get(row["triage_category"], 0) + 1
with (ROOT / "unlinked-page-inventory-summary.md").open("w", encoding="utf-8") as f:
    f.write("# Unlinked source-page triage inventory\n\n")
    f.write(f"Generated from the source PDF text layer and OCR where available. Scope: **{len(rows)} pages**. This is a screening inventory, not visual confirmation that a page is or is not a question. No catalog record was changed.\n\n")
    f.write("| Automated triage label | Pages | What to do next |\n|---|---:|---|\n")
    for label, count in sorted(counts.items(), key=lambda x: (-x[1], x[0])):
        action = "Inspect page image before deciding" if "inspect" in label.lower() or "review" in label.lower() or "question-like" in label.lower() else "Retain as supporting material unless image shows a prompt"
        f.write(f"| {label} | {count} | {action} |\n")
    f.write("\n**Interpretation:** the categories are generated from text patterns and anchor metadata. ‘High’ means a strong text phrase match, not image verification. Scanned pages with no usable text remain explicitly flagged. The CSV and JSON keep a per-page excerpt, available OCR/text-layer lengths, and a visual-review flag.\n")
print(f"Wrote {len(rows)} page records; {sum(r['full_text_reviewed_visually']=='no' for r in rows)} remain unverified visually.")
for label, count in sorted(counts.items(), key=lambda x: (-x[1], x[0])):
    print(f"{count:4}  {label}")
