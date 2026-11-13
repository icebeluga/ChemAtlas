"""Add only the two 2020 sample FRQs verified in source pages 113–118."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
questions_path = ROOT / "public" / "questions.json"
catalog = json.loads(questions_path.read_text())
units = {unit: {topic_id: name for topic_id, name in topics} for unit, topics in ((u["id"], u["topics"]) for u in catalog["units"])}
topic_names = {topic_id: name for mapping in units.values() for topic_id, name in mapping.items()}

def make_parts(entries):
    return [{"label": label, "topics": ids, "rationale": rationale,
             "topicNames": [topic_names[i] for i in ids], "textPreview": preview}
            for label, ids, rationale, preview in entries]

def make_question(number, first_page, primary_unit, primary_topic, ids, parts, preview, rationale):
    topics = [primary_topic] + [topic for topic in ids if topic != primary_topic]
    return {
        "id": f"frq-2020-sample-{number}-{first_page}", "type": "FRQ", "year": "2020",
        "exam": "2020 AP Chemistry Exam Sample Questions", "number": number,
        "pages": list(range(first_page, first_page + 3)), "primaryUnit": primary_unit,
        "unitName": next(u["name"] for u in catalog["units"] if u["id"] == primary_unit),
        "primaryTopic": primary_topic, "topicName": topic_names[primary_topic],
        "secondaryTopics": topics[1:], "secondaryTopicNames": [topic_names[t] for t in topics[1:]],
        "relatedTopics": topics, "topicParts": make_parts(parts), "multiConcept": True,
        "classificationConfidence": 0.96 if number == 1 else 0.88, "status": "classified",
        "reviewReason": None, "classificationRationale": rationale,
        "classificationMethod": "Manual review of original scanned source page against current CED",
        "evidencePages": list(range(first_page, first_page + 3)), "textPreview": preview,
        "source": "AP Chemistry MEGA Compiled Test Bank.pdf",
        "sourcePagesOriginal": list(range(first_page, first_page + 3)),
        "extractionWarnings": ["Scanned page image is authoritative; no selectable text layer."],
    }

records = [
    make_question(1, 113, "u7", "7.11",
        ["7.11", "7.12", "7.10", "7.9", "6.1", "4.2", "4.9", "2.7", "2.6", "3.1", "1.6"],
        [
            ("(a)", ["4.2", "4.9"], "Write the net ionic redox reaction between lead and chlorine.", "Lead metal is oxidized while chlorine forms chloride ions."),
            ("(b)", ["7.11"], "Write a solubility-product expression for lead phosphate.", "The prompt supplies the dissolution equilibrium and Ksp."),
            ("(c)", ["7.11"], "Calculate molar solubility from Ksp.", "Solve the lead-phosphate dissolution equilibrium."),
            ("(d)", ["7.11", "7.12"], "Compare phosphate and chloride for lowering dissolved lead.", "Use solubility and the common-ion effect to explain selective precipitation."),
            ("(e)", ["7.10", "7.11"], "Predict precipitation by comparing Q with Ksp.", "The prompt provides ion concentrations and asks whether lead concentration changes."),
            ("(f)", ["7.9", "6.1"], "Relate hot-water lead levels to dissolution enthalpy.", "Explain the temperature effect using Le Châtelier’s principle."),
            ("(g)", ["2.7"], "Evaluate a phosphate bond-angle claim using VSEPR.", "Interpret the supplied Lewis diagram and molecular geometry."),
            ("(h)", ["2.6"], "Select the resonance diagram consistent with equal P–O bonds.", "Connect resonance representation with measured bond lengths."),
            ("(i)", ["3.1"], "Identify an incorrect hydrogen-bond interaction.", "Inspect the particulate representation of phosphate in water."),
            ("(j)", ["1.6"], "Evaluate a claim using phosphorus and oxygen photoelectron spectra.", "Use peak height and atomic-structure evidence from the supplied spectra."),
        ],
        "Lead in drinking water; solubility equilibria, Ksp, precipitation, and multi-part applications of redox, VSEPR, resonance, hydrogen bonding, and photoelectron spectroscopy.",
        "Solubility equilibria (Ksp, molar solubility, common-ion effects, and Q versus Ksp) dominate the opening six parts. Later parts explicitly test VSEPR, resonance, hydrogen bonding, and photoelectron spectra.") ,
    make_question(2, 116, "u5", "5.8",
        ["5.8", "5.7", "5.11", "6.2", "6.1", "3.1", "3.9", "8.5", "4.5", "4.6"],
        [
            ("(a)", ["5.11"], "Identify the catalyst in the proposed mechanism.", "Trace the species regenerated after the elementary steps."),
            ("(b)", ["5.8", "5.7"], "Predict the effect of added ammonia on rate from the proposed steps.", "Use the mechanism and rate-determining step to justify the prediction."),
            ("(c)", ["6.2", "6.1"], "Check a potential-energy diagram against reaction enthalpy.", "Relate relative reactant and product energy to the stated ΔH."),
            ("(d)", ["3.1"], "Identify intermolecular forces in methanoic acid and methanol.", "Use the displayed molecular structures."),
            ("(e)", ["3.1", "3.9"], "Explain vapor composition during distillation.", "Connect relative vapor pressures to intermolecular-force strength and separation."),
            ("(f)", ["8.5", "4.5"], "Calculate methanoic-acid concentration from titration data.", "Use the balanced neutralization equation and the Trial 1 buret readings."),
            ("(g)", ["8.5", "4.6"], "Read a buret diagram and calculate delivered titrant volume.", "Determine the final reading and volume dispensed for Trial 3."),
            ("(h)", ["8.5", "4.5"], "Evaluate how water left in the flask affects calculated acid concentration.", "Reason from the moles required to reach the titration endpoint."),
        ],
        "Methanoic-acid synthesis and a proposed mechanism; the later parts test potential-energy diagrams, intermolecular forces and distillation, and acid-base titration.",
        "The mechanism and rate reasoning anchor the opening parts. Remaining subparts independently assess reaction energetics, intermolecular forces and separation, and acid-base titration.")
]

existing = {q["id"] for q in catalog["questions"]}
duplicates = [q["id"] for q in records if q["id"] in existing]
if duplicates:
    raise SystemExit(f"Refusing duplicate record IDs: {duplicates}")
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
    "questionRecords": len(catalog["questions"]),
    "pagesReferencedByQuestionRecords": len(referenced),
    "unreferencedPages": unlinked,
    "unresolvedPages": len(unlinked),
    "classified": statuses["classified"], "legacy": statuses["legacy"], "review": statuses["review"],
    "assignmentsByEvidence": dict(methods),
})
questions_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
for audit_path in (ROOT / "public" / "page-audit.json", ROOT / "research" / "page-audit.json"):
    audit_path.write_text(json.dumps(catalog["audit"], ensure_ascii=False, indent=2) + "\n")
print(f"Added {len(records)} scanned FRQs; catalog now has {len(catalog['questions'])} records and {len(referenced)} referenced source pages; {len(unlinked)} remain unlinked.")
