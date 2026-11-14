#!/usr/bin/env python3
"""Export one ChemAtlas question's stored source regions as vector PDF pages."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import fitz


def export_questions(root: Path, question_ids: list[str], output: Path) -> int:
    catalog = json.loads((root / "public/questions.json").read_text(encoding="utf-8"))
    questions = {q["id"]: q for q in catalog["questions"]}
    stimuli_path = root / "research/stimuli.json"
    stimuli_doc = json.loads(stimuli_path.read_text(encoding="utf-8")) if stimuli_path.exists() else {"stimuli": {}}
    stimuli = stimuli_doc.get("stimuli", {})
    selected = []
    for question_id in question_ids:
        question = questions.get(question_id)
        if question is None:
            raise ValueError(f"Unknown question id: {question_id}")
        if not question.get("sourceRegions"):
            raise ValueError(f"Question has no source regions: {question_id}")
        selected.append(question)

    source_docs: dict[str, fitz.Document] = {}
    result = fitz.open()
    count = 0

    def append_region(region: dict) -> None:
        nonlocal count
        page_number = region["page"]
        segment = next((s for s in catalog["sourceFiles"] if s["from"] <= page_number <= s["to"]), None)
        if segment is None:
            raise ValueError(f"No source segment maps page {page_number}")
        path = str(root / "public" / segment["url"].lstrip("/"))
        source = source_docs.get(path)
        if source is None:
            source = fitz.open(path)
            source_docs[path] = source
        source_page = source.load_page(page_number - segment["from"])
        clip = fitz.Rect(region["rect"])
        if not source_page.rect.contains(clip) or clip.is_empty:
            raise ValueError(f"Invalid crop for page {page_number}: {list(clip)}")
        target = result.new_page(width=clip.width, height=clip.height)
        target.show_pdf_page(target.rect, source, source_page.number, clip=clip, keep_proportion=False)
        count += 1

    try:
        emitted_stimuli: set[str] = set()
        for question in selected:
            for stimulus_id in question.get("stimulusIds", []):
                if stimulus_id in emitted_stimuli:
                    continue
                stimulus = stimuli.get(stimulus_id)
                if stimulus is None:
                    raise ValueError(f"Question {question['id']} references unknown stimulus {stimulus_id}")
                for region in stimulus["regions"]:
                    append_region(region)
                emitted_stimuli.add(stimulus_id)
            for region in question["sourceRegions"]:
                append_region(region)
        output.parent.mkdir(parents=True, exist_ok=True)
        result.save(output, garbage=4, deflate=True)
        return count
    finally:
        result.close()
        for source in source_docs.values():
            source.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("question_ids", nargs="+")
    parser.add_argument("output", type=Path)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    count = export_questions(args.root, args.question_ids, args.output)
    print(f"Exported {count} source region(s) for {', '.join(args.question_ids)} to {args.output}")


if __name__ == "__main__":
    main()
