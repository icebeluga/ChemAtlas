"""Add verified 2014 AP Chemistry practice-exam FRQ 1 from compiled pages 200–201."""
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
path = ROOT / "public" / "questions.json"
catalog = json.loads(path.read_text())
if any(q["id"] == "frq-2014-practice-1-200" for q in catalog["questions"]):
    raise SystemExit("Refusing duplicate FRQ record")
topics = {topic_id: name for u in catalog["units"] for topic_id, name in u["topics"]}
unit_for = {topic_id: u for u in catalog["units"] for topic_id, _ in u["topics"]}
parts = [
    ("(a)", ["4.2", "4.8", "7.11"], "Write the net ionic neutralization and precipitation reactions for adding sulfuric acid to barium hydroxide."),
    ("(b)", ["8.5", "4.2"], "Identify the ions contributing to conductivity and explain its decrease as acid is added."),
    ("(c)", ["8.5", "4.5"], "Use the conductivity titration graph and reaction stoichiometry to calculate the original Ba(OH)₂ concentration."),
    ("(d)", ["7.11"], "Use Ksp to calculate [Ba²⁺] at the equivalence point."),
    ("(e)", ["7.11", "4.2"], "Explain the continued decrease in [Ba²⁺] as additional H₂SO₄ is added and BaSO₄ precipitates."),
]
topics_all = list(dict.fromkeys(t for _, ids, _ in parts for t in ids))
primary = "8.5"
record = {
    "id": "frq-2014-practice-1-200", "type": "FRQ", "year": "2014",
    "exam": "2014 AP Chemistry Practice Exam", "number": 1,
    "pages": [200, 201], "primaryUnit": unit_for[primary]["id"],
    "unitName": unit_for[primary]["name"], "primaryTopic": primary,
    "topicName": topics[primary], "secondaryTopics": [t for t in topics_all if t != primary],
    "secondaryTopicNames": [topics[t] for t in topics_all if t != primary],
    "relatedTopics": topics_all,
    "topicParts": [{"label": label, "topics": ids, "rationale": rationale,
                    "topicNames": [topics[t] for t in ids], "textPreview": rationale}
                   for label, ids, rationale in parts],
    "multiConcept": True, "classificationConfidence": 0.96,
    "status": "classified", "reviewReason": None,
    "textPreview": "A conductivity titration of Ba(OH)₂ with H₂SO₄ forms BaSO₄(s). Interpret the conductivity graph, write neutralization and precipitation equations, calculate the original concentration and [Ba²⁺] at equivalence, and explain the post-equivalence trend.",
    "source": "AP Chemistry MEGA Compiled Test Bank.pdf",
    "sourcePagesOriginal": [200, 201], "sourceRegions": [],
    "fullText": "A student monitors the conductivity of a 25.0 mL Ba(OH)₂ solution while titrating it with 0.10 M H₂SO₄. BaSO₄ precipitates (Ksp = 1.0 × 10⁻¹⁰). (a) Write the net ionic neutralization and precipitation equations. (b) Identify the conducting species during the first 30.0 mL addition and explain why conductivity decreases. (c) Use the graph to calculate the original Ba(OH)₂ molarity. (d) Calculate [Ba²⁺] at the equivalence point after exactly 30.0 mL H₂SO₄ is added. (e) Explain why [Ba²⁺] continues to decrease as the added H₂SO₄ volume increases from 30.0 mL to 31.0 mL.",
    "extractionWarnings": ["Question continues across two pages and includes a graph; both original full pages are retained. No crop boundary has been manually verified."],
    "classificationRationale": "The central task is a conductivity-monitored acid–base titration with an equivalence point, so acid–base titrations is primary. Subparts also require net ionic equations, reaction stoichiometry, and solubility-equilibrium reasoning for BaSO₄ precipitation.",
    "classificationMethod": "Both original source pages visually reviewed; subparts mapped against current CED",
    "evidencePages": [200, 201], "legacyConcepts": [], "sourceAssets": ["/source/bank-01.pdf"],
}
catalog["questions"].append(record)
catalog["includedSourcePages"] = sorted({p for q in catalog["questions"] for p in q.get("sourcePagesOriginal", q["pages"])})
referenced = set(catalog["includedSourcePages"])
unlinked = sorted(set(range(1, catalog["sourcePages"] + 1)) - referenced)
statuses = Counter(q["status"] for q in catalog["questions"])
types = Counter(q["type"] for q in catalog["questions"])
catalog["stats"].update({
    "questions": len(catalog["questions"]), "frq": types["FRQ"], "mcq": types["MCQ"],
    "classified": statuses["classified"], "review": statuses["review"], "legacy": statuses["legacy"],
    "multiConceptFrq": sum(q["type"] == "FRQ" and q.get("multiConcept") for q in catalog["questions"]),
})
methods = Counter(q.get("classificationMethod") for q in catalog["questions"] if q["status"] == "classified")
catalog["audit"].update({
    "questionRecords": len(catalog["questions"]), "pagesReferencedByQuestionRecords": len(referenced),
    "unreferencedPages": unlinked, "unresolvedPages": len(unlinked),
    "classified": statuses["classified"], "legacy": statuses["legacy"], "review": statuses["review"],
    "assignmentsByEvidence": dict(methods),
})
path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
for audit_path in (ROOT / "public" / "page-audit.json", ROOT / "research" / "page-audit.json"):
    audit_path.write_text(json.dumps(catalog["audit"], ensure_ascii=False, indent=2) + "\n")
inventory_path = ROOT / "research" / "unlinked-page-inventory.json"
inventory = json.loads(inventory_path.read_text())
removed = [e for e in inventory["entries"] if e["page"] in (200, 201)]
if {e["page"] for e in removed} != {200, 201}:
    raise SystemExit("Expected both question pages in the unlinked inventory")
inventory["entries"] = [e for e in inventory["entries"] if e["page"] not in (200, 201)]
inventory["page_count"] = len(inventory["entries"])
inventory_path.write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n")
with (ROOT / "research" / "unlinked-page-inventory.csv").open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=inventory["entries"][0].keys())
    writer.writeheader(); writer.writerows(inventory["entries"])
counts = Counter(e["triage_category"] for e in inventory["entries"])
summary = ["# Unlinked source-page triage inventory", "", f"Generated from the source PDF text layer and OCR where available. Scope: **{len(inventory['entries'])} pages**. This is a screening inventory, not visual confirmation that a page is or is not a question.", "", "| Automated triage label | Pages | What to do next |", "|---|---:|---|"]
actions = {"Exam directions / cover / contents": "Retain as supporting material unless image shows a prompt", "Scoring guidelines / rubric": "Retain as supporting material unless image shows a prompt", "Answer key / worked solutions": "Retain as supporting material unless image shows a prompt", "Exam reference tables / equations": "Retain as supporting material unless image shows a prompt", "Response space / continuation page": "Retain as supporting material unless image shows a prompt", "Teacher or AP Reading commentary": "Retain as supporting material unless image shows a prompt", "Scanned/blank/low-text page; image review required": "Inspect page image before deciding", "Question-like content; inspect": "Inspect page image before deciding", "Numbered question-like content; inspect": "Inspect page image before deciding", "Other extracted text; manual review required": "Inspect page image before deciding"}
for label, n in counts.most_common(): summary.append(f"| {label} | {n} | {actions.get(label, 'Inspect page image before deciding')} |")
summary += ["", "**Interpretation:** Automated labels come from text and OCR patterns; they are triage only. Every unlinked page still needs visual disposition. Scanned pages with little text remain explicitly flagged for image review.", "", "## Confirmed and cataloged during this review", "", "- Compiled PDF page 38: 2008 AP Chemistry MCQ 41, Version A.", "- Compiled PDF pages 200–201: 2014 AP Chemistry Practice Exam FRQ 1; both pages include a question or continuation content and are linked to one multi-page question record.", ""]
(ROOT / "research" / "unlinked-page-inventory-summary.md").write_text("\n".join(summary))
print(f"Added 2014 practice FRQ 1; {len(catalog['questions'])} records, {len(referenced)} referenced pages, {len(unlinked)} unlinked pages.")
