"""Add individually reviewed omitted 2008 MCQ items found on already-indexed PDF pages."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
path = ROOT / "public" / "questions.json"
catalog = json.loads(path.read_text())
topic_names = {topic_id: name for u in catalog["units"] for topic_id, name in u["topics"]}
unit_for = {topic_id: u for u in catalog["units"] for topic_id, _ in u["topics"]}

# source page is the one-based physical page in the compiled MEGA PDF.
# Topics were mapped from the question prompt and cross-checked against the
# 2008 diagnostic guide where it lists the question number.
items = [
    (18, 33, "4.5", ["3.4"], "Stoichiometry and gas volume at STP", "Use the balanced decomposition equation to find the amount of KClO₃ needed to produce 1.0 L of O₂ at STP."),
    (26, 34, "5.2", [], "Determine a rate from concentration changes and given reaction orders", "Use the rate data table for X + Y → Z and the stated first order in X and second order in Y to predict the rate for experiment 2."),
    (30, 35, "1.1", [], "Significant figures in density measurements", "Use the mass measurements for an empty flask and a flask filled to its 25.00 mL calibration mark to determine the appropriate significant figures for density."),
    (34, 36, "4.5", ["4.3"], "Balance a chemical equation and identify the coefficient for H₃PO₄", "Balance Ca₃(PO₄)₂(s) + H₃PO₄(l) → Ca(H₂PO₄)₂(s) using lowest whole-number coefficients."),
    (35, 36, "7.9", ["7.2"], "Predict equilibrium shifts after changes in concentration and temperature", "For H₂(g) + I₂(g) ⇌ 2 HI(g), determine which listed changes increase the amount of HI at equilibrium."),
    (44, 39, "9.8", ["4.9"], "Explain why a galvanic cell reaction produces electricity", "For the stated Cl₂/I⁻ redox reaction, choose the explanation that accounts for spontaneous electrical energy generation."),
    (45, 39, "3.3", [], "Interpret a cooling curve and identify when the sample contains the most liquid", "Use the labeled cooling curve for a sample that starts as a gas and is cooled at a constant rate."),
    (50, 40, "4.9", ["4.5"], "Determine electrons transferred in a balanced redox reaction", "Use the balanced permanganate and bromide reaction in acidic solution to determine the number of electrons transferred."),
    (55, 41, "7.4", ["7.3"], "Calculate the equilibrium constant from the reaction and equilibrium concentrations", "For 2 X(g) + Y(g) ⇌ 3 Z(g), use the stated equilibrium concentrations to calculate K."),
    (57, 41, "2.7", [], "Identify the hybridization of carbon in ethyne, H–C≡C–H", "Determine the hybridization of each carbon atom in the displayed ethyne structure."),
    (59, 42, "7.5", ["7.8"], "Interpret a particle diagram to compare amounts at equilibrium", "The diagram shows NO₂(g) and N₂O₄(g) at equilibrium. Determine what the depicted particle mixture establishes about K."),
    (61, 42, None, [], "Identify the functional group in the displayed structure of banana oil", "The question asks whether the displayed organic structure is an alcohol, amine, carboxylic acid, ester, or ketone."),
    (65, 43, "3.4", [], "Determine the pressure of gas collected over water", "Given the water temperature and atmospheric pressure, identify the needed step before determining the gas pressure in the collection tube."),
    (67, 43, "4.9", ["4.5"], "Balance a redox equation and identify the coefficient for water", "Balance the nitrite/dichromate reaction in acidic solution and determine the coefficient for H₂O(l)."),
    (73, 44, "3.1", ["3.3"], "Compare vapor pressure at the same temperature", "Two closed containers contain acetone liquid and vapor at the same temperature. Determine how their vapor pressures compare."),
]
existing = {q["id"] for q in catalog["questions"]}
records = []
for number, page, primary, related, description, preview in items:
    record_id = f"mcq-2008-{number}-{page}"
    if record_id in existing:
        continue
    topics = ([primary] if primary else []) + related
    record = {
        "id": record_id, "type": "MCQ", "year": "2008",
        "exam": "2008 AP Chemistry MCQ · Version A", "number": number, "pages": [page],
        "primaryUnit": unit_for[primary]["id"] if primary else None,
        "unitName": unit_for[primary]["name"] if primary else None,
        "primaryTopic": primary, "topicName": topic_names[primary] if primary else None,
        "secondaryTopics": related, "secondaryTopicNames": [topic_names[t] for t in related],
        "relatedTopics": topics, "topicParts": [], "multiConcept": len(topics) > 1,
        "classificationConfidence": 0.95 if primary else 0,
        "status": "classified" if primary else "legacy",
        "reviewReason": "Legacy content outside the current AP Chemistry framework: identification of organic functional groups." if primary is None else None,
        "textPreview": f"{number}. {preview}",
        "source": "AP Chemistry MEGA Compiled Test Bank.pdf", "sourcePagesOriginal": [page],
        # Retain the complete source page because a verified crop is not available.
        "sourceRegions": [], "fullText": preview,
        "extractionWarnings": ["Full source page is shown; no crop boundary has been manually verified."],
        "classificationRationale": ("Archived 2008 released-exam content. " + description + (" The 2008 diagnostic guide also lists this item under stoichiometry." if number in (18, 34) else "")) if primary else "The item tests recognition of an organic functional group, which is outside the current AP Chemistry course framework; kept in legacy content.",
        "classificationMethod": "Original source wording and page manually reviewed against the current CED; 2008 diagnostic guide cross-check where available" if primary else "Original source wording reviewed; current CED boundary check",
        "evidencePages": [page], "legacyConcepts": ["Organic functional-group identification"] if primary is None else [],
        "sourceAssets": ["/source/bank-01.pdf"],
    }
    records.append(record)
if not records:
    raise SystemExit("No new records; IDs already present")
catalog["questions"].extend(records)
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
print(f"Added {len(records)} omitted 2008 MCQs; catalog now has {len(catalog['questions'])} records.")
