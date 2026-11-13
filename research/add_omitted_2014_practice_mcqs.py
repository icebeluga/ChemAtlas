"""Add visually/text-verified missing MCQs 17, 24, and 28 from 2014 Practice Exam."""
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
path = ROOT / "public" / "questions.json"
catalog = json.loads(path.read_text())
topics = {topic_id: name for u in catalog["units"] for topic_id, name in u["topics"]}
unit_for = {topic_id: u for u in catalog["units"] for topic_id, _ in u["topics"]}
items = [
    {"number": 17, "page": 179, "primary": "8.5", "related": ["4.5"],
     "preview": "A student repeats the weak-acid titration using an indicator instead of a pH meter. If the indicator changes color slightly past the equivalence point, determine whether the calculated acid concentration is slightly above or below the actual value.",
     "rationale": "The item tests interpretation of an acid titration endpoint and the effect of endpoint error on the calculated acid concentration."},
    {"number": 24, "page": 180, "primary": "5.8", "related": ["5.7"],
     "preview": "For the proposed two-step mechanism for 2 NO(g) + O₂(g) → 2 NO₂(g), identify the statement consistent with the elementary steps and the rate law.",
     "rationale": "Use the proposed mechanism, including its slow elementary step, to determine the rate law and evaluate mechanistic claims."},
    {"number": 28, "page": 183, "primary": "7.11", "related": ["3.8", "4.2"],
     "preview": "Ag⁺(aq) + Cl⁻(aq) ⇌ AgCl(s). Choose the particle diagram representing ions present in significant concentrations after dilute AgNO₃ is mixed with excess NaCl; Ksp(AgCl) = 1.8 × 10⁻¹⁰.",
     "rationale": "Apply solubility equilibrium and the common-ion effect to identify the significant dissolved ions in a particulate representation."},
]
existing = {q["id"] for q in catalog["questions"]}
records=[]
for item in items:
    n,p,primary,related=item["number"],item["page"],item["primary"],item["related"]
    rid=f"mcq-2014-practice-{n}-{p}"
    if rid in existing: continue
    records.append({
        "id":rid,"type":"MCQ","year":"2014","exam":"2014 AP Chemistry Practice Exam","number":n,
        "pages":[p],"primaryUnit":unit_for[primary]["id"],"unitName":unit_for[primary]["name"],
        "primaryTopic":primary,"topicName":topics[primary],"secondaryTopics":related,
        "secondaryTopicNames":[topics[t] for t in related],"relatedTopics":[primary]+related,
        "topicParts":[],"multiConcept":bool(related),"classificationConfidence":0.95,
        "status":"classified","reviewReason":None,"textPreview":f"{n}. {item['preview']}",
        "source":"AP Chemistry MEGA Compiled Test Bank.pdf","sourcePagesOriginal":[p],"sourceRegions":[],
        "fullText":item["preview"],
        "extractionWarnings":["The full source page is displayed because no crop boundary was manually verified."],
        "classificationRationale":item["rationale"],
        "classificationMethod":"Original practice-exam source page visually reviewed; mapped against current CED",
        "evidencePages":[p],"legacyConcepts":[],"sourceAssets":["/source/bank-01.pdf"],
    })
if not records: raise SystemExit("No missing MCQs to add")
catalog["questions"].extend(records)
catalog["includedSourcePages"]=sorted({p for q in catalog["questions"] for p in q.get("sourcePagesOriginal",q["pages"])})
referenced=set(catalog["includedSourcePages"])
unlinked=sorted(set(range(1,catalog["sourcePages"]+1))-referenced)
statuses=Counter(q["status"] for q in catalog["questions"]); types=Counter(q["type"] for q in catalog["questions"])
catalog["stats"].update({"questions":len(catalog["questions"]),"frq":types["FRQ"],"mcq":types["MCQ"],"classified":statuses["classified"],"review":statuses["review"],"legacy":statuses["legacy"],"multiConceptFrq":sum(q["type"]=="FRQ" and q.get("multiConcept") for q in catalog["questions"])})
methods=Counter(q.get("classificationMethod") for q in catalog["questions"] if q["status"]=="classified")
catalog["audit"].update({"questionRecords":len(catalog["questions"]),"pagesReferencedByQuestionRecords":len(referenced),"unreferencedPages":unlinked,"unresolvedPages":len(unlinked),"classified":statuses["classified"],"legacy":statuses["legacy"],"review":statuses["review"],"assignmentsByEvidence":dict(methods)})
path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n")
for p in (ROOT/"public"/"page-audit.json",ROOT/"research"/"page-audit.json"):p.write_text(json.dumps(catalog["audit"],ensure_ascii=False,indent=2)+"\n")
invpath=ROOT/"research"/"unlinked-page-inventory.json"; inv=json.loads(invpath.read_text())
entry=next((e for e in inv["entries"] if e["page"]==183),None)
if entry is None: raise SystemExit("Expected page 183 to be in the unlinked inventory")
inv["entries"].remove(entry);inv["page_count"]=len(inv["entries"]);invpath.write_text(json.dumps(inv,ensure_ascii=False,indent=2)+"\n")
with (ROOT/"research"/"unlinked-page-inventory.csv").open("w",newline="",encoding="utf-8") as f:
 w=csv.DictWriter(f,fieldnames=inv["entries"][0].keys());w.writeheader();w.writerows(inv["entries"])
counts=Counter(e["triage_category"] for e in inv["entries"])
actions={"Exam directions / cover / contents":"Retain as supporting material unless image shows a prompt","Scoring guidelines / rubric":"Retain as supporting material unless image shows a prompt","Answer key / worked solutions":"Retain as supporting material unless image shows a prompt","Exam reference tables / equations":"Retain as supporting material unless image shows a prompt","Response space / continuation page":"Retain as supporting material unless image shows a prompt","Teacher or AP Reading commentary":"Retain as supporting material unless image shows a prompt","Scanned/blank/low-text page; image review required":"Inspect page image before deciding","Question-like content; inspect":"Inspect page image before deciding","Numbered question-like content; inspect":"Inspect page image before deciding","Other extracted text; manual review required":"Inspect page image before deciding"}
summary=["# Unlinked source-page triage inventory","",f"Generated from the source PDF text layer and OCR where available. Scope: **{len(inv['entries'])} pages**. This is a screening inventory, not visual confirmation that a page is or is not a question.","","| Automated triage label | Pages | What to do next |","|---|---:|---|"]
for label,n in counts.most_common():summary.append(f"| {label} | {n} | {actions.get(label,'Inspect page image before deciding')} |")
summary += ["","**Interpretation:** Automated labels come from text and OCR patterns; they are triage only. Every unlinked page still needs visual disposition. Scanned pages with little text remain explicitly flagged for image review.","","## Confirmed and cataloged during this review","","- Compiled PDF page 38: 2008 AP Chemistry MCQ 41, Version A.","- Compiled PDF page 183: 2014 AP Chemistry Practice Exam MCQ 28, with particle-diagram choices.","- Compiled PDF pages 200–201: 2014 AP Chemistry Practice Exam FRQ 1, including its conductivity graph and continued parts.",""]
(ROOT/"research"/"unlinked-page-inventory-summary.md").write_text("\n".join(summary))
print(f"Added {len(records)} 2014 practice MCQs; catalog {len(catalog['questions'])}, {len(referenced)} referenced pages, {len(unlinked)} unlinked pages.")
