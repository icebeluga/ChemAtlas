"""Compare two ChemAtlas catalogs by stable question ID and field."""
import argparse
import json
from collections import Counter
from pathlib import Path


def index(catalog):
    questions = {question["id"]: question for question in catalog["questions"]}
    if len(questions) != len(catalog["questions"]):
        raise ValueError("Duplicate question IDs")
    return questions


def compare(before, after):
    old, new = index(before), index(after)
    changes = {}
    for question_id in sorted(old.keys() & new.keys()):
        left, right = old[question_id], new[question_id]
        fields = [key for key in sorted(left.keys() | right.keys())
                  if (key in left, left.get(key)) != (key in right, right.get(key))]
        if fields:
            changes[question_id] = fields

    def selected(fields):
        return {question_id: {
            field: {"before": old[question_id].get(field), "after": new[question_id].get(field)}
            for field in changed_fields if field in fields
        } for question_id, changed_fields in changes.items() if fields.intersection(changed_fields)}

    return {
        "before": dict(Counter(q["type"] for q in old.values())),
        "after": dict(Counter(q["type"] for q in new.values())),
        "commonIds": len(old.keys() & new.keys()),
        "addedIds": sorted(new.keys() - old.keys()),
        "removedIds": sorted(old.keys() - new.keys()),
        "changedFields": dict(sorted(Counter(field for fields in changes.values() for field in fields).items())),
        "changedTopLevelKeys": [key for key in sorted(before.keys() | after.keys())
                                if key != "questions" and before.get(key) != after.get(key)],
        "catalogCorrections": selected({"type", "pages", "sourcePagesOriginal", "stimulusIds", "year"}),
        "changedFieldsById": changes,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    args = parser.parse_args()
    print(json.dumps(compare(json.loads(args.before.read_text(encoding="utf-8")),
                             json.loads(args.after.read_text(encoding="utf-8"))), indent=2))
