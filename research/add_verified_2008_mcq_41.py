"""Add the visually verified, previously unlinked 2008 MCQ 41 (compiled PDF p. 38)."""
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
catalog_path = ROOT / "public" / "questions.json"
catalog = json.loads(catalog_path.read_text())
if any(q["id"] == "mcq-2008-41-38" for q in catalog["questions"]):
    raise SystemExit("Refusing duplicate record mcq-2008-41-38")

topic_names = {topic_id: name for u in catalog["units"] for topic_id, name in u["topics"]}
unit = next(u for u in catalog["units"] if any(t[0] == "4.5" for t in u["topics"]))
q = {
    "id": "mcq-2008-41-38", "type": "MCQ", "year": "2008",
    "exam": "2008 AP Chemistry MCQ · Version A", "number": 41,
    "pages": [38], "primaryUnit": unit["id"], "unitName": unit["name"],
    "primaryTopic": "4.5", "topicName": topic_names["4.5"],
    "secondaryTopics": ["4.3"], "secondaryTopicNames": [topic_names["4.3"]],
    "relatedTopics": ["4.5", "4.3"], "topicParts": [], "multiConcept": False,
    "classificationConfidence": 0.97, "status": "classified", "reviewReason": None,
    "textPreview": "41. A particle diagram shows H₂(g) and N₂(g) in a closed container. Which diagram represents the mixture after N₂(g) + 3 H₂(g) → 2 NH₃(g) proceeds as far as possible?",
    "source": "AP Chemistry MEGA Compiled Test Bank.pdf", "sourcePagesOriginal": [38],
    "sourceRegions": [],
    "fullText": "A particle diagram shows H₂(g) and N₂(g) in a closed container. Determine which of five particle-diagram choices represents the products and any excess reactants after N₂(g) + 3 H₂(g) → 2 NH₃(g) proceeds as far as possible.",
    "extractionWarnings": ["The five answer choices are diagrams; the original full page is retained as the authoritative display."],
    "classificationRationale": "The item is keyed as a stoichiometry question in the 2008 diagnostic guide. Apply the balanced-equation particle ratio to determine the limiting reactant and final particle counts; particle diagrams represent the reaction at the particulate level.",
    "classificationMethod": "Original source page visually reviewed; cross-checked against the 2008 exam answer key and diagnostic guide; mapped to current CED",
    "evidencePages": [38], "legacyConcepts": [], "sourceAssets": ["/source/bank-01.pdf"],
}
catalog["questions"].append(q)
catalog["includedSourcePages"] = sorted({p for item in catalog["questions"] for p in item.get("sourcePagesOriginal", item["pages"])})
referenced = set(catalog["includedSourcePages"])
unlinked = sorted(set(range(1, catalog["sourcePages"] + 1)) - referenced)
statuses = Counter(item["status"] for item in catalog["questions"])
types = Counter(item["type"] for item in catalog["questions"])
catalog["stats"].update({
    "questions": len(catalog["questions"]), "frq": types["FRQ"], "mcq": types["MCQ"],
    "classified": statuses["classified"], "review": statuses["review"], "legacy": statuses["legacy"],
    "multiConceptFrq": sum(item["type"] == "FRQ" and item.get("multiConcept") for item in catalog["questions"]),
})
methods = Counter(item.get("classificationMethod") for item in catalog["questions"] if item["status"] == "classified")
catalog["audit"].update({
    "questionRecords": len(catalog["questions"]), "pagesReferencedByQuestionRecords": len(referenced),
    "unreferencedPages": unlinked, "unresolvedPages": len(unlinked),
    "classified": statuses["classified"], "legacy": statuses["legacy"], "review": statuses["review"],
    "assignmentsByEvidence": dict(methods),
})
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
for path in (ROOT / "public" / "page-audit.json", ROOT / "research" / "page-audit.json"):
    path.write_text(json.dumps(catalog["audit"], ensure_ascii=False, indent=2) + "\n")

inventory_path = ROOT / "research" / "unlinked-page-inventory.json"
inventory = json.loads(inventory_path.read_text())
entry = next((e for e in inventory["entries"] if e["page"] == 38), None)
if entry is None:
    raise SystemExit("Page 38 is not in the current unlinked-page inventory")
inventory["entries"].remove(entry)
inventory["page_count"] = len(inventory["entries"])
inventory_path.write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n")
csv_path = ROOT / "research" / "unlinked-page-inventory.csv"
with csv_path.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=inventory["entries"][0].keys())
    writer.writeheader()
    writer.writerows(inventory["entries"])

counts = Counter(e["triage_category"] for e in inventory["entries"])
summary = ["# Unlinked source-page triage inventory", "", "Generated from the source PDF text layer and OCR where available. Scope: **{} pages**. This is a screening inventory, not visual confirmation that a page is or is not a question. Catalog update: page 38 was visually confirmed as 2008 MCQ 41 and cataloged; no other page status is inferred.".format(len(inventory["entries"])), "", "| Automated triage label | Pages | What to do next |", "|---|---:|---|"]
actions = {
    "Exam directions / cover / contents": "Retain as supporting material unless image shows a prompt",
    "Scoring guidelines / rubric": "Retain as supporting material unless image shows a prompt",
    "Answer key / worked solutions": "Retain as supporting material unless image shows a prompt",
    "Exam reference tables / equations": "Retain as supporting material unless image shows a prompt",
    "Response space / continuation page": "Retain as supporting material unless image shows a prompt",
    "Teacher or AP Reading commentary": "Retain as supporting material unless image shows a prompt",
    "Scanned/blank/low-text page; image review required": "Inspect page image before deciding",
    "Question-like content; inspect": "Inspect page image before deciding",
    "Numbered question-like content; inspect": "Inspect page image before deciding",
    "Other extracted text; manual review required": "Inspect page image before deciding",
}
for label, count in counts.most_common():
    summary.append(f"| {label} | {count} | {actions.get(label, 'Inspect page image before deciding')} |")
summary += ["", "**Interpretation:** Automated labels come from text and OCR patterns; they are triage only. Every unlinked page still needs visual disposition. Scanned pages with little text remain explicitly flagged for image review.", "", "## Confirmed and cataloged during this review", "", "- Compiled PDF page 38: 2008 AP Chemistry MCQ 41 (Version A), a particle-diagram stoichiometry question. The entire page is kept visible because no crop boundary has been manually verified.", ""]
(ROOT / "research" / "unlinked-page-inventory-summary.md").write_text("\n".join(summary))
print(f"Added 2008 MCQ 41; catalog has {len(catalog['questions'])} records, {len(referenced)} referenced pages, {len(unlinked)} unresolved pages.")
