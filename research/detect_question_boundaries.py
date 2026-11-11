#!/usr/bin/env python3
"""Suggest question-specific PDF crops using metadata, text layout, and page graphics.

The detector is deliberately conservative. It writes proposals and measured evidence; it
never mutates question metadata or the review manifest. Low-signal/scanned pages require
manual review and do not receive a fabricated full-page crop.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

import fitz

MCQ_START = re.compile(r"^\s*(?:question\s*)?(\d{1,3})\s*[.)]?\s+(\S.*)$", re.I)
FRQ_START = re.compile(r"^\s*(?:question\s+)?(\d{1,2})\s*[.)]\s+(\S.*)$", re.I)
CHOICE = re.compile(r"^\s*([A-E])\s*[.)]\s+\S", re.I)
SUBPART = re.compile(r"^\s*(?:\(([a-h])\)|([a-h])[.)])\s+\S", re.I)
CONTEXT_CUE = re.compile(r"(?:equation|following|data|refer|table|graph|diagram|reaction|based on|information|use the|shown|figure|below|above|at 25|[=⇌↔→Δ]|K[a-z]|pH|\b\d+(?:\.\d+)?\s*(?:mol|M|kJ|kPa|atm|°C))", re.I)


def _rect(value: Any) -> fitz.Rect | None:
    if value is None:
        return None
    try:
        box = fitz.Rect(value)
        if not box.is_empty and box.is_valid:
            return box
    except (TypeError, ValueError):
        pass
    return None


def _text_lines(page: fitz.Page) -> list[dict[str, Any]]:
    """Return line-level text and boxes in PyMuPDF's unrotated page coordinates."""
    result = []
    data = page.get_text("dict", sort=True)
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
            box = _rect(line.get("bbox"))
            if text and box:
                result.append({"text": text, "rect": box})
    return result


def _visual_rects(page: fitz.Page) -> list[fitz.Rect]:
    """Collect image placements and non-trivial vector drawing bounds."""
    found: list[fitz.Rect] = []
    try:
        for image in page.get_image_info(xrefs=True):
            box = _rect(image.get("bbox"))
            if box and box.width > 2 and box.height > 2:
                found.append(box)
    except (AttributeError, RuntimeError):
        pass
    try:
        for drawing in page.get_drawings():
            box = _rect(drawing.get("rect"))
            if box and box.width > 4 and box.height > 4:
                found.append(box)
    except (AttributeError, RuntimeError):
        pass
    return found


def _columns(lines: list[dict[str, Any]], page_width: float) -> list[tuple[float, float]]:
    """Infer one or two content columns from a large horizontal gutter."""
    centers = sorted(line["rect"].x0 + line["rect"].width / 2 for line in lines if len(line["text"]) > 2)
    if len(centers) < 8:
        return [(0.0, page_width)]
    gaps = [(centers[i + 1] - centers[i], i) for i in range(len(centers) - 1)]
    gap, index = max(gaps, default=(0.0, 0))
    if gap < page_width * 0.16:
        return [(0.0, page_width)]
    split = (centers[index] + centers[index + 1]) / 2
    left, right = centers[: index + 1], centers[index + 1 :]
    # Reject a split that merely separates a short equation/table row from the page body.
    if min(len(left), len(right)) < 4 or right[0] - left[-1] < page_width * 0.16:
        return [(0.0, page_width)]
    return [(0.0, split), (split, page_width)]


def _column_for(x: float, columns: list[tuple[float, float]]) -> int:
    return min(range(len(columns)), key=lambda i: 0 if columns[i][0] <= x <= columns[i][1] else min(abs(x-columns[i][0]), abs(x-columns[i][1])))


def _anchors(lines: list[dict[str, Any]], question_type: str) -> list[dict[str, Any]]:
    pattern = MCQ_START if question_type == "MCQ" else FRQ_START
    found = []
    for line in lines:
        match = pattern.match(line["text"])
        if not match:
            continue
        number = int(match.group(1))
        # AP MCQ questions usually range 1–75; open-response pages use a short sequence.
        if question_type == "MCQ" and not 1 <= number <= 100:
            continue
        if question_type == "FRQ" and not 1 <= number <= 20:
            continue
        found.append({"number": number, "rect": line["rect"], "text": line["text"]})
    return found


def _stimulus_context(question: dict[str, Any], stimuli: dict[str, Any], page_number: int) -> list[fitz.Rect]:
    rects = []
    for stimulus_id in question.get("stimulusIds", []):
        stimulus = stimuli.get(stimulus_id, {})
        for region in stimulus.get("regions", []):
            if region.get("page") == page_number:
                box = _rect(region.get("rect"))
                if box:
                    rects.append(box)
    return rects


def _expand(box: fitz.Rect, dx: float, dy: float, bounds: fitz.Rect) -> fitz.Rect:
    return fitz.Rect(max(bounds.x0, box.x0 - dx), max(bounds.y0, box.y0 - dy), min(bounds.x1, box.x1 + dx), min(bounds.y1, box.y1 + dy))


def analyze_page(page: fitz.Page, question: dict[str, Any], region: dict[str, Any] | None,
                 page_questions: list[dict[str, Any]], stimuli: dict[str, Any],
                 page_number: int) -> dict[str, Any]:
    bounds = page.rect * page.derotation_matrix if page.rotation else page.rect
    lines = _text_lines(page)
    visual = _visual_rects(page)
    text_chars = sum(len(line["text"]) for line in lines)
    question_type = question.get("type", "MCQ")
    prior = _rect((region or {}).get("rect"))
    anchors = _anchors(lines, question_type)
    columns = _columns(lines, bounds.width)
    prior_center = (prior.x0 + prior.x1) / 2 if prior else bounds.width / 2
    expected = int(question.get("number") or 0)
    matching = [a for a in anchors if a["number"] == expected]
    if prior:
        matching.sort(key=lambda a: abs(a["rect"].y0 - prior.y0) + abs((a["rect"].x0+a["rect"].x1)/2-prior_center))
    elif matching:
        matching.sort(key=lambda a: abs((a["rect"].x0+a["rect"].x1)/2-prior_center))
    anchor = matching[0] if matching else None

    # If catalog metadata is incomplete, accept a numbered line only when uniquely inside
    # the stored estimate. This avoids guessing from page-wide numbering in tables.
    if anchor is None and prior:
        nearby = [a for a in anchors if prior.x0 - 30 <= a["rect"].x0 <= prior.x1 + 30 and prior.y0 - 100 <= a["rect"].y0 <= prior.y1]
        if len(nearby) == 1 and (not expected or nearby[0]["number"] == expected):
            anchor = nearby[0]
    if anchor is None:
        return {"page": page_number, "rect": [round(v, 2) for v in prior] if prior else None,
                "confidence": 0.08 if prior else 0.0, "confidenceBand": "low", "manualReview": True,
                "signals": {"textCharacters": text_chars, "questionStartFound": False,
                            "questionStartMatches": len(matching), "nextQuestionBoundaryFound": False,
                            "answerChoiceMarkers": 0, "answerChoiceSequence": False,
                            "frqSubpartMarkers": 0, "frqSubpartLabels": [], "frqSubpartSequence": False,
                            "graphicsIncluded": 0, "linkedStimulusRegions": len(_stimulus_context(question, stimuli, page_number)),
                            "columnCount": 0, "pageRotation": int(page.rotation)},
                "reasons": ["Expected numbered question start was not located; the prior crop is retained unchanged for manual review." ]
                           + (["Sparse extractable text; likely scanned or image-only page."] if text_chars < 25 else [])}

    center_x = (anchor["rect"].x0 + anchor["rect"].x1) / 2 if anchor else prior_center
    column_index = _column_for(center_x, columns)
    col_x0, col_x1 = columns[column_index]
    page_anchor_numbers = {int(q.get("number") or -1) for q in page_questions if q.get("type", question_type) == question_type}
    starts = [a for a in anchors if a["number"] in page_anchor_numbers and _column_for((a["rect"].x0+a["rect"].x1)/2, columns) == column_index]
    next_starts = [a for a in starts if anchor and a["rect"].y0 > anchor["rect"].y0 + 4 and a["number"] != expected]
    next_start = min(next_starts, key=lambda a:a["rect"].y0) if next_starts else None

    # The prior remains the spatial anchor. A modest context lead includes equations or
    # shared setup printed immediately before the number without taking the previous item.
    intro_context = []
    context_visual = []
    if anchor:
        preceding = [line for line in lines
                     if 0 < anchor["rect"].y0 - line["rect"].y1 <= 130
                     and _column_for(line["rect"].x0 + line["rect"].width / 2, columns) == column_index
                     and CONTEXT_CUE.search(line["text"])]
        intro_context = preceding[-3:]
        earlier_questions = [a for a in anchors if a["number"] != expected
                             and a["rect"].y1 < anchor["rect"].y0
                             and _column_for((a["rect"].x0+a["rect"].x1)/2, columns) == column_index]
        context_visual = [box for box in visual
                          if 0 < anchor["rect"].y0 - box.y1 <= 140
                          and _column_for((box.x0+box.x1)/2, columns) == column_index
                          and not earlier_questions]
        top = anchor["rect"].y0 - 46
        if context_visual:
            top = min(top, min(box.y0 for box in context_visual) - 12)
        if intro_context:
            top = min(top, min(line["rect"].y0 for line in intro_context) - 12)
        if prior and anchor["rect"].y0 - prior.y0 <= 150:
            top = min(top, prior.y0)
        top = max(bounds.y0, top)
        if next_start:
            bottom = next_start["rect"].y0 - 10
        elif prior:
            bottom = max(prior.y1, anchor["rect"].y1 + 28)
        else:
            bottom = min(bounds.y1, anchor["rect"].y1 + 120)
    elif prior:
        top, bottom = prior.y0, prior.y1
    else:
        return {"page": page_number, "rect": None, "confidence": 0.0, "confidenceBand": "low",
                "manualReview": True, "signals": {"textCharacters": text_chars, "questionStartFound": False},
                "reasons": ["No usable stored crop or numbered question start was found; no page-sized crop was generated."]}

    # Include source text and graphics within the candidate band and selected column.
    # Keep a wider prior if it already contains content not visible to text extraction.
    band = fitz.Rect(col_x0, top, col_x1, max(top + 1, bottom))
    included_text = [line for line in lines if line["rect"].intersects(band)]
    visual = _visual_rects(page)
    included_visual = [box for box in visual if box.intersects(band)]
    linked = _stimulus_context(question, stimuli, page_number)
    for box in linked:
        top = min(top, box.y0)
        bottom = max(bottom, box.y1)
    if next_start:
        bottom = min(bottom, next_start["rect"].y0 - 10)
    if prior:
        # Don't discard vector/image-only material preserved by the editor's previous crop.
        if not next_start:
            top, bottom = min(top, prior.y0), max(bottom, prior.y1)
        else:
            top = min(top, prior.y0) if prior.y0 < (anchor["rect"].y0 if anchor else prior.y0) else top
    visual_in_band = [box for box in visual if box.intersects(fitz.Rect(col_x0, top, col_x1, max(top+1,bottom)))]
    content_boxes = [line["rect"] for line in included_text] + visual_in_band + linked + context_visual
    if anchor:
        content_boxes.append(anchor["rect"])
    if content_boxes:
        content_top = min(box.y0 for box in content_boxes)
        content_bottom = max(box.y1 for box in content_boxes)
        top = min(top, content_top - 12)
        bottom = max(bottom, content_bottom + 14)
    if next_start:
        content_bottom = max((box.y1 for box in content_boxes), default=anchor["rect"].y1 if anchor else top)
        safe_bottom = next_start["rect"].y0 - 10
        bottom = min(safe_bottom, max(content_bottom + 26, anchor["rect"].y1 + 26 if anchor else top + 40))
        if prior and 0 <= prior.y1 - content_bottom <= 72:
            bottom = min(safe_bottom, max(bottom, prior.y1))
    # Tighten to the measured content width with a generous horizontal margin. This keeps
    # unrelated neighboring columns out while retaining diagrams, tables, and equations.
    content_x = [box for box in content_boxes if box.intersects(fitz.Rect(col_x0, top, col_x1, max(top+1,bottom)))]
    if content_x:
        left = max(col_x0, min(box.x0 for box in content_x) - 22)
        right = min(col_x1, max(box.x1 for box in content_x) + 22)
    else:
        left, right = col_x0, col_x1
    candidate = _expand(fitz.Rect(left, max(bounds.y0, top), right, min(bounds.y1, max(top+1,bottom))),
                        0, 0, bounds)
    # Where a crop estimate is tighter than inferred content, include the full union.
    if prior and not candidate.contains(prior) and not next_start:
        candidate |= prior
        candidate &= bounds

    choice_labels = []
    if question_type == "MCQ":
        for line in included_text:
            match = CHOICE.match(line["text"])
            if match and match.group(1).upper() not in choice_labels:
                choice_labels.append(match.group(1).upper())
    choices = len(choice_labels)
    choice_sequence = len(choice_labels) >= 3 and choice_labels[0] == "A" and all(ord(b) == ord(a) + 1 for a, b in zip(choice_labels, choice_labels[1:]))
    subpart_labels = []
    if question_type == "FRQ":
        for line in included_text:
            match = SUBPART.match(line["text"])
            if match:
                label = (match.group(1) or match.group(2)).lower()
                if label not in subpart_labels:
                    subpart_labels.append(label)
    subparts = len(subpart_labels)
    subpart_sequence = len(subpart_labels) >= 1 and all(ord(b) == ord(a) + 1 for a, b in zip(subpart_labels, subpart_labels[1:]))
    signals = {
        "textCharacters": text_chars,
        "questionStartFound": bool(anchor),
        "questionStartMatches": len(matching),
        "nextQuestionBoundaryFound": bool(next_start),
        "answerChoiceMarkers": choices,
        "answerChoiceSequence": choice_sequence,
        "frqSubpartMarkers": subparts,
        "frqSubpartLabels": subpart_labels,
        "frqSubpartSequence": subpart_sequence,
        "graphicsIncluded": len(visual_in_band),
        "linkedStimulusRegions": len(linked),
        "introContextLinesIncluded": len(intro_context),
        "columnCount": len(columns),
        "pageRotation": int(page.rotation),
    }
    # This is an evidence score, not a model-confidence claim. Text-poor scans are always
    # routed to manual review, even when a prior rectangle exists.
    score = 0.0
    score += 0.32 if anchor else 0
    score += 0.18 if next_start else 0
    score += 0.18 if text_chars >= 80 else (0.08 if text_chars >= 25 else 0)
    score += 0.14 if (choice_sequence if question_type == "MCQ" else subparts >= 1) else 0
    score += 0.10 if visual_in_band or linked else 0
    score += 0.08 if prior else 0
    score = round(min(1.0, score), 2)
    manual = text_chars < 25 or not anchor or score < 0.58
    reasons = []
    if text_chars < 25:
        reasons.append("Sparse extractable text; likely scanned or image-only page. OCR/manual boundary review is required.")
    if not anchor:
        reasons.append("Expected numbered question start was not located near the metadata estimate.")
    if not next_start:
        reasons.append("No subsequent question boundary was found on this page; the prior bottom or last detected content was retained conservatively.")
    if question_type == "MCQ" and choices < 3:
        reasons.append(f"Only {choices} distinct answer-choice markers were detected.")
    if question_type == "FRQ" and subparts == 0:
        reasons.append("No lettered FRQ subparts were detected in the candidate region.")
    if signals["columnCount"] > 1:
        reasons.append("A multi-column page layout was detected; the crop is constrained to the nearest column.")
    if signals["pageRotation"]:
        reasons.append(f"Page rotation of {signals['pageRotation']} degrees was detected and retained in the source page geometry.")
    if linked:
        reasons.append("Linked shared-stimulus source regions were included as required context.")
    if context_visual:
        reasons.append("Nearby diagram/table/image content above the question number was included as context.")
    if intro_context:
        reasons.append("Nearby equation/setup text above the question number was included as introductory context.")
    return {"page": page_number, "rect": [round(v, 2) for v in candidate], "confidence": score,
            "confidenceBand": "high" if score >= .78 else ("medium" if score >= .58 else "low"),
            "manualReview": manual, "signals": signals, "reasons": reasons}


def detect(catalog: dict[str, Any], pdf_root: Path, stimuli_doc: dict[str, Any] | None = None) -> dict[str, Any]:
    stimuli = (stimuli_doc or {}).get("stimuli", {})
    questions = catalog.get("questions", [])
    by_page: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for q in questions:
        for page in set(q.get("pages", []) or q.get("sourcePagesOriginal", [])):
            by_page[int(page)].append(q)
    cache: dict[str, fitz.Document] = {}
    results = []
    try:
        for q in questions:
            regions = list(q.get("sourceRegions") or [])
            pages = sorted({int(r["page"]) for r in regions} | {int(p) for p in (q.get("pages") or q.get("sourcePagesOriginal") or [])})
            if not pages:
                results.append({"id": q.get("id"), "manualReview": True, "regions": [], "reasons": ["Question metadata contains no source page."]})
                continue
            out_regions = []
            for page_number in pages:
                source = next((entry for entry in catalog.get("sourceFiles", []) if int(entry["from"]) <= page_number <= int(entry["to"])), None)
                if not source:
                    out_regions.append({"page": page_number, "rect": None, "confidence": 0, "confidenceBand": "low", "manualReview": True, "signals": {}, "reasons": ["No source PDF mapping exists for this page."]})
                    continue
                path = pdf_root / source["url"].lstrip("/")
                if not path.exists():
                    out_regions.append({"page": page_number, "rect": None, "confidence": 0, "confidenceBand": "low", "manualReview": True, "signals": {}, "reasons": [f"Source PDF is not available locally: {path}"]})
                    continue
                if str(path) not in cache:
                    cache[str(path)] = fitz.open(path)
                doc = cache[str(path)]
                source_page = page_number - int(source["from"])
                if source_page < 0 or source_page >= doc.page_count:
                    out_regions.append({"page": page_number, "rect": None, "confidence": 0, "confidenceBand": "low", "manualReview": True, "signals": {}, "reasons": ["Catalog page offset is outside the source PDF."]})
                    continue
                # PyMuPDF text blocks and graphics are expressed in unrotated page points.
                source_page_obj = doc.load_page(source_page)
                page_regions = [r for r in regions if int(r["page"]) == page_number]
                if page_regions:
                    prior_rects = [_rect(r.get("rect")) for r in page_regions]
                    prior_rects = [r for r in prior_rects if r]
                    region = {"page": page_number, "rect": list(prior_rects[0])} if prior_rects else page_regions[0]
                    for prior_rect in prior_rects[1:]:
                        merged = fitz.Rect(region["rect"]) | prior_rect
                        region["rect"] = list(merged)
                    if source_page_obj.rotation and region.get("rect"):
                        unrotated_prior = fitz.Rect(region["rect"]) * source_page_obj.derotation_matrix
                        region = {**region, "rect": list(unrotated_prior)}
                else:
                    region = None
                proposal = analyze_page(source_page_obj, q, region, by_page[page_number], stimuli, page_number)
                # Transform proposed rectangles through the page's rotation matrix so output
                # coordinates match the displayed PDF page used by the crop editor.
                if proposal.get("rect") and source_page_obj.rotation:
                    rotated = fitz.Rect(proposal["rect"]) * source_page_obj.rotation_matrix
                    proposal["rect"] = [round(v, 2) for v in rotated]
                out_regions.append(proposal)
            results.append({"id": q.get("id"), "type": q.get("type"), "number": q.get("number"),
                            "sourceDocument": q.get("source"), "regions": out_regions,
                            "manualReview": any(r.get("manualReview", True) for r in out_regions),
                            "confidence": round(min((r.get("confidence", 0) for r in out_regions), default=0), 2)})
    finally:
        for doc in cache.values():
            doc.close()
    return {"schemaVersion": 1, "method": "pymupdf-text-layout-plus-page-graphics", "questionCount": len(results),
            "manualReviewCount": sum(bool(q.get("manualReview")) for q in results), "questions": results}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="ChemAtlas checkout root")
    parser.add_argument("--catalog", type=Path, help="Question catalog JSON (default: ROOT/public/questions.json)")
    parser.add_argument("--stimuli", type=Path, help="Shared-stimulus metadata (default: ROOT/research/stimuli.json when present)")
    parser.add_argument("--pdf-root", type=Path, help="Root containing source PDF paths (default: ROOT/public)")
    parser.add_argument("--output", type=Path, default=Path("question-boundary-proposals.json"))
    args = parser.parse_args()
    catalog_path = args.catalog or args.root / "public/questions.json"
    stimuli_path = args.stimuli or args.root / "research/stimuli.json"
    stimuli = json.loads(stimuli_path.read_text(encoding="utf-8")) if stimuli_path.exists() else None
    result = detect(json.loads(catalog_path.read_text(encoding="utf-8")), args.pdf_root or args.root / "public", stimuli)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"questions": result["questionCount"], "manualReview": result["manualReviewCount"], "output": str(args.output)}))


if __name__ == "__main__":
    main()
