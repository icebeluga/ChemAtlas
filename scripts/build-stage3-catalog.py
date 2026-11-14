"""Combine pinned catalogs using the Stage 2 ledgers and verified source pages."""
import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path

BASE = "63fd7e4b5287d74f66227742e8b2a4f47e37920f"
SITES = "6f4a568382eef820418a9f84fe97bd5cbd21d721"
BASE_BLOB = "3eef99956b037611afc9b5a60a056f1cbbb311b0"
SITES_BLOB = "126f4b46fb1cdb8868dc199eb74974a3898f719a"
APPROVED = {
    "2008 AP Chemistry MCQ · Version A": {
        18: [33], 26: [34], 30: [35], 34: [36], 35: [36], 41: [38],
        44: [39], 45: [39], 50: [40], 55: [41], 57: [41], 59: [42],
        61: [42], 65: [43], 67: [43], 73: [44],
    },
    "2014 AP Chemistry Practice Exam": {17: [179], 24: [180], 28: [183], 1: [200, 201]},
    "2020 AP Chemistry Exam Sample Questions": {1: [113, 114, 115], 2: [116, 117, 118]},
}


def load_snapshot(path, expected):
    data = path.read_bytes()
    actual = hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()
    if actual != expected:
        raise ValueError(f"{path}: expected blob {expected}, got {actual}")
    return json.loads(data)


def pages(question):
    return question.get("sourcePagesOriginal") or question["pages"]


def identity(question):
    return question["exam"], question["type"], question["number"]


def indexed(rows):
    result = {row["id"]: row for row in rows}
    if len(result) != len(rows):
        raise ValueError("Duplicate ID in input")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("baseline", "sites", "additions", "shared", "output"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    catalog = load_snapshot(args.baseline, BASE_BLOB)
    archive = load_snapshot(args.sites, SITES_BLOB)
    prior = indexed(catalog["questions"])
    proposed = indexed(archive["questions"])
    with args.additions.open() as file:
        additions = indexed(list(csv.DictReader(file)))
    with args.shared.open() as file:
        shared = indexed(list(csv.DictReader(file, delimiter="\t")))
    if additions.keys() != proposed.keys() - prior.keys() or not prior.keys() <= proposed.keys():
        raise ValueError("Addition ledger differs from pinned snapshots")

    added = []
    decisions = []
    identities = {identity(q) for q in prior.values()}
    source_slots = {(page, q["number"]) for q in prior.values() for page in pages(q)}
    topics = {topic for unit in catalog["units"] for topic, _ in unit["topics"]}
    for id_, row in additions.items():
        q = proposed[id_]
        source_pages = pages(q)
        decision = {"id": id_, "source": SITES, "fields": sorted(q), "pages": source_pages}
        if row["evidence group"] == "investigate":
            decision.update(disposition="pending_addition",
                            reason="Printed booklet and prompt identity require verification",
                            same_identity=sorted(k for k, v in prior.items() if identity(v) == identity(q)),
                            same_printed_slot=sorted(k for k, v in prior.items() if v["number"] == q["number"]
                                                     and set(source_pages).intersection(pages(v))))
        else:
            slots = {(page, q["number"]) for page in source_pages}
            if (APPROVED[q["exam"]][q["number"]] != source_pages or identity(q) in identities or
                    slots & source_slots or q.get("sourceRegions") or q.get("stimulusIds") or
                    any(not 1 <= page <= 300 for page in source_pages) or
                    set(q.get("relatedTopics") or []) - topics or
                    (q.get("primaryTopic") and q["primaryTopic"] not in topics)):
                raise ValueError(f"Source identity or reference check failed: {id_}")
            identities.add(identity(q))
            source_slots.update(slots)
            added.append(q)
            decision.update(disposition="accepted_addition", reason=row["evidence group"],
                            validation="Archived visual audit and local pinned bank-01.pdf text/OCR. Unique ID and printed slot. Full source pages.")
        decisions.append(decision)

    missing = object()
    for id_, before in prior.items():
        after = proposed[id_]
        fields = sorted(key for key in before.keys() | after.keys()
                        if before.get(key, missing) != after.get(key, missing))
        if not fields:
            if id_ in shared:
                raise ValueError(f"Unexpected shared ledger row: {id_}")
            continue
        if fields != sorted(shared[id_]["changed top-level fields"].split(",")):
            raise ValueError(f"Shared ledger field mismatch: {id_}")
        decisions.append({"id": id_, "source": SITES, "retained_source": BASE, "fields": fields,
                          "disposition": "pending_shared_changes",
                          "reason": "Retain baseline record until source, classification or geometry evidence is confirmed."})

    if (len(prior), len(added), len(shared), len(decisions)) != (1542, 22, 864, 973):
        raise ValueError("Unexpected migration totals")
    records = [*catalog["questions"], *added]
    counts = Counter(q["status"] for q in records)
    types = Counter(q["type"].lower() for q in records)
    included = sorted({p for q in records for p in pages(q)})
    unreferenced = sorted(set(range(1, catalog["sourcePages"] + 1)) - set(included))
    catalog.update(questions=records, includedSourcePages=included, stats={
        "questions": len(records), **types, **counts,
        "multiConceptFrq": sum(q["type"] == "FRQ" and q["multiConcept"] for q in records),
    })
    catalog["audit"].update(questionRecords=len(records), pagesReferencedByQuestionRecords=len(included),
                            unreferencedPages=unreferenced, unresolvedPages=len(unreferenced), **counts,
                            assignmentsByEvidence=dict(Counter(q.get("classificationMethod") or "unspecified" for q in records)),
                            coverageNote="Stage 3 candidate with 22 independently identified source omissions.")
    args.output.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    (args.output / "questions.stage3-v1.json").write_bytes(data)
    (args.output / "catalog-decisions.jsonl").write_text(
        "".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in decisions), encoding="utf-8")
    print(json.dumps({"catalog": catalog["stats"], "decisions": Counter(r["disposition"] for r in decisions),
                      "sha256": hashlib.sha256(data).hexdigest()}, indent=2))


if __name__ == "__main__":
    main()
