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
SHARED_GROUP = re.compile(r"^\s*questions?\s+(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})\s+(?:refer|use|are|will|should|answer)\b", re.I)
PAGE_BOILERPLATE = re.compile(r"(?:GO ON TO THE NEXT PAGE|END OF EXAM|Copyright|(?:www\.|apcentral\.)?collegeboard\.com|^\s*Version\s+[A-Z]\s*$)", re.I)
PAGE_FOOTER = re.compile(r"(?:GO ON TO THE NEXT PAGE|END OF EXAM|S\s*T\s*O\s*P|Copyright|collegeboard\.com|Web or Mass distribution prohibited|Unauthorized copying or reuse)", re.I)


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


def _columns(lines: list[dict[str, Any]], page_width: float,
             page_questions: list[dict[str, Any]] | None = None) -> list[tuple[float, float]]:
    """Infer one or two content columns from a large horizontal gutter."""
    # Existing crop metadata is a location estimate, not a final boundary. Across
    # the questions on a page, however, its repeated left/right placement is a
    # useful column signal and is more stable than line-center gaps on equations.
    hints = []
    for item in page_questions or []:
        for region in item.get("sourceRegions", []):
            box = _rect(region.get("rect")) if region.get("rect") else None
            if box and box.width <= page_width * 0.68:
                hints.append((box.x0 + box.x1) / 2)
    anchor_x = []
    for item in page_questions or []:
        number = int(item.get("number") or 0)
        kind = item.get("type", "MCQ")
        pattern = MCQ_START if kind == "MCQ" else FRQ_START
        for line in lines:
            match = pattern.match(line["text"])
            if match and int(match.group(1)) == number:
                anchor_x.append((line["rect"].x0 + line["rect"].x1) / 2)
                break
    positions = hints or anchor_x
    if len(positions) >= 2:
        centers = sorted(positions)
        gap, index = max(((centers[i + 1] - centers[i], i) for i in range(len(centers) - 1)), default=(0, 0))
        if gap >= page_width * 0.20:
            split = (centers[index] + centers[index + 1]) / 2
            if page_width * 0.25 <= split <= page_width * 0.75:
                overlap = min(20.0, page_width * 0.025)
                return [(0.0, min(page_width, split + overlap)), (max(0.0, split - overlap), page_width)]
        # Several tight stored regions all on one side indicate a column even
        # when the opposite column has no catalog question on this page.
        if len(hints) >= 2 and max(centers) - min(centers) <= page_width * 0.20:
            center = sum(hints) / len(hints)
            if center < page_width * 0.45:
                return [(0.0, page_width / 2), (page_width / 2, page_width)]
            if center > page_width * 0.55:
                return [(0.0, page_width / 2), (page_width / 2, page_width)]
    # Paragraph starts form more reliable column clusters than line centers,
    # which vary with wrapping and can put a false gutter inside a long line.
    starts = sorted(line["rect"].x0 for line in lines if len(line["text"]) > 12)
    if len(starts) >= 8:
        gaps = [(starts[i + 1] - starts[i], i) for i in range(len(starts) - 1)]
        gap, index = max(gaps, default=(0, 0))
        left_count, right_count = index + 1, len(starts) - index - 1
        split = (starts[index] + starts[index + 1]) / 2
        if gap >= page_width * 0.18 and min(left_count, right_count) >= 3 and page_width * .24 <= split <= page_width * .76:
            overlap = min(20.0, page_width * 0.025)
            return [(0.0, min(page_width, split + overlap)), (max(0.0, split - overlap), page_width)]
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
    pattern = re.compile(r"^\s*(?:question\s*)?(\d{1,3})\s*[.)]\s*(.*)$", re.I) if question_type == "MCQ" else FRQ_START
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
    columns = _columns(lines, bounds.width, page_questions)
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
        # Multi-page FRQs commonly continue with (c), (d), etc. and do not
        # repeat the numbered question heading. Refine a broad stored estimate
        # from those measurable subpart markers and nearby graphics, but keep
        # the result manual because the missing question heading is unverified.
        continuation_parts = []
        if question_type == "FRQ" and prior:
            continuation_parts = [line for line in lines
                                  if SUBPART.match(line["text"])
                                  and prior.x0 - 40 <= line["rect"].x0 + line["rect"].width / 2 <= prior.x1 + 40]
        if continuation_parts:
            first_part = min(continuation_parts, key=lambda line: line["rect"].y0)
            footer_top = min((line["rect"].y0 for line in lines
                              if PAGE_FOOTER.search(line["text"]) and line["rect"].y0 > bounds.y1 - 220),
                             default=bounds.y1 - 48)
            later_questions = [a for a in anchors if a["number"] > expected and a["rect"].y0 > first_part["rect"].y0]
            stop_y = min([footer_top] + [a["rect"].y0 - 10 for a in later_questions])
            continuation_text = [line for line in lines
                                 if line["rect"].y1 >= first_part["rect"].y0 - 2
                                 and line["rect"].y0 < stop_y - 3
                                 and not PAGE_BOILERPLATE.search(line["text"])]
            labels = []
            for line in continuation_parts:
                match = SUBPART.match(line["text"])
                label = (match.group(1) or match.group(2)).lower()
                if label not in labels:
                    labels.append(label)
            visual_continuation = [box for box in visual
                                   if box.y1 >= first_part["rect"].y0 - 24
                                   and box.y0 < stop_y - 4
                                   and box.width < bounds.width * .97]
            boxes = [line["rect"] for line in continuation_text] + visual_continuation
            if boxes:
                union = boxes[0]
                for box in boxes[1:]:
                    union |= box
                candidate = _expand(union, 20, 16, bounds)
            else:
                candidate = prior
            score = 0.36 if text_chars >= 25 else 0.08
            return {"page": page_number, "rect": [round(v, 2) for v in candidate],
                    "confidence": score, "confidenceBand": "low", "manualReview": True,
                    "signals": {"textCharacters": sum(len(line["text"]) for line in continuation_text),
                                "pageTextCharacters": text_chars, "questionStartFound": False,
                                "questionStartMatches": len(matching), "nextQuestionBoundaryFound": bool(later_questions),
                                "answerChoiceMarkers": 0, "answerChoiceSequence": False,
                                "frqSubpartMarkers": len(labels), "frqSubpartLabels": labels,
                                "frqSubpartSequence": all(ord(b) == ord(a) + 1 for a, b in zip(labels, labels[1:])),
                                "graphicsIncluded": len(visual_continuation), "linkedStimulusRegions": 0,
                                "columnCount": len(columns), "pageRotation": int(page.rotation),
                                "continuationPageDetected": True},
                    "reasons": ["No repeated numbered FRQ heading was found; a page continuation was estimated from subpart labels and nearby page graphics, and remains manual-review only."]}
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
    starts = [a for a in anchors if (a["number"] in page_anchor_numbers or expected < a["number"] <= expected + 3)
              and _column_for((a["rect"].x0+a["rect"].x1)/2, columns) == column_index]
    next_starts = [a for a in starts if anchor and a["rect"].y0 > anchor["rect"].y0 + 4 and a["number"] != expected]
    next_start = min(next_starts, key=lambda a:a["rect"].y0) if next_starts else None
    shared_groups = []
    for line in lines:
        group = SHARED_GROUP.match(line["text"])
        if group:
            shared_groups.append({"first": int(group.group(1)), "last": int(group.group(2)), "rect": line["rect"], "text": line["text"]})
    target_groups = [group for group in shared_groups if group["first"] <= expected <= group["last"]]
    target_group = min(target_groups, key=lambda group: abs(group["rect"].y0 - anchor["rect"].y0)) if target_groups else None
    next_group = min((group for group in shared_groups if group["rect"].y0 > anchor["rect"].y0 and group is not target_group), key=lambda group: group["rect"].y0, default=None)

    # The prior remains the spatial anchor. A modest context lead includes equations or
    # shared setup printed immediately before the number without taking the previous item.
    intro_context = []
    context_visual = []
    if anchor:
        earlier_questions = [a for a in anchors if a["number"] != expected
                             and a["rect"].y1 < anchor["rect"].y0
                             and _column_for((a["rect"].x0+a["rect"].x1)/2, columns) == column_index]
        prior_question_bottom = max((a["rect"].y1 for a in earlier_questions), default=-1)
        preceding = [line for line in lines
                     if 0 < anchor["rect"].y0 - line["rect"].y1 <= 130
                     and _column_for(line["rect"].x0 + line["rect"].width / 2, columns) == column_index
                     and line["rect"].y0 >= prior_question_bottom
                     and CONTEXT_CUE.search(line["text"])]
        intro_context = preceding[-3:]
        context_visual = [box for box in visual
                          if 0 < anchor["rect"].y0 - box.y1 <= 140
                          and _column_for((box.x0+box.x1)/2, columns) == column_index
                          and box.y0 >= prior_question_bottom]
        top = anchor["rect"].y0 - 14
        if target_group and target_group["rect"].y0 < anchor["rect"].y0:
            top = min(top, target_group["rect"].y0 - 12)
        if context_visual:
            top = min(top, min(box.y0 for box in context_visual) - 12)
        if intro_context:
            top = min(top, min(line["rect"].y0 for line in intro_context) - 12)
        if prior and anchor["rect"].y0 - prior.y0 <= 150:
            top = min(top, prior.y0)
        top = max(bounds.y0, top)
        if next_start:
            bottom = next_start["rect"].y0 - 10
        else:
            # Existing coordinates are only an estimate. They must not extend a
            # measured question back into a broad exam-header/page crop.
            bottom = min(bounds.y1 - 28, anchor["rect"].y1 + 120)
    elif prior:
        top, bottom = prior.y0, prior.y1
    else:
        return {"page": page_number, "rect": None, "confidence": 0.0, "confidenceBand": "low",
                "manualReview": True, "signals": {"textCharacters": text_chars, "questionStartFound": False},
                "reasons": ["No usable stored crop or numbered question start was found; no page-sized crop was generated."]}

    # Bound the question using extracted content in its column. Ignore standard
    # page furniture and do not union broad legacy crop coordinates back into it.
    footer_start = min((line["rect"].y0 for line in lines
                        if PAGE_FOOTER.search(line["text"]) and line["rect"].y0 > bounds.y1 - 170),
                       default=bounds.y1 - 44)
    body_lines = [line for line in lines
                  if anchor and line["rect"].y1 >= anchor["rect"].y0 - 3
                  and line["rect"].x0 >= col_x0 - 18
                  and col_x0 <= line["rect"].x0 + line["rect"].width / 2 <= col_x1
                  and line["rect"].y0 < footer_start - 4
                  and not PAGE_BOILERPLATE.search(line["text"])]
    if next_start:
        body_lines = [line for line in body_lines if line["rect"].y0 < next_start["rect"].y0 - 4]
    if next_group:
        body_lines = [line for line in body_lines if line["rect"].y0 < next_group["rect"].y0 - 6]
    if body_lines and not next_start:
        bottom = min(bounds.y1 - 24, max(line["rect"].y1 for line in body_lines) + 18)
    if next_group:
        bottom = min(bottom, next_group["rect"].y0 - 8)
    band = fitz.Rect(col_x0, top, col_x1, max(top + 1, bottom))
    included_text = [line for line in lines if line["rect"].intersects(band)
                     and line["rect"].x0 >= col_x0 - 18
                     and col_x0 <= line["rect"].x0 + line["rect"].width / 2 <= col_x1
                     and line["rect"].y0 < footer_start - 4
                     and not PAGE_BOILERPLATE.search(line["text"])
                     and (not next_group or line["rect"].y0 < next_group["rect"].y0 - 6)
                     and (line["rect"].y1 >= anchor["rect"].y0 - 3 or line in intro_context
                          or (target_group and target_group["rect"].y0 <= line["rect"].y0 < anchor["rect"].y0))]
    included_text = [line for line in included_text
                     if not (line["rect"].y0 >= bounds.y1 - 48 and re.fullmatch(r"\s*\d{1,3}\s*", line["text"] or ""))]
    catalog_tokens = {word for word in re.findall(r"[a-z]{3,}", str(question.get("fullText") or "").lower())
                      if word not in {"the", "and", "for", "that", "with", "which", "from", "into", "this", "are", "was", "were", "each", "following", "above", "below"}}
    crop_tokens = {word for line in included_text for word in re.findall(r"[a-z]{3,}", line["text"].lower())}
    catalog_text_coverage = round(len(catalog_tokens & crop_tokens) / len(catalog_tokens), 2) if catalog_tokens else None
    visual = _visual_rects(page)
    included_visual = [box for box in visual if box.intersects(band)]
    linked = _stimulus_context(question, stimuli, page_number)
    interposed_questions = [a for a in anchors if linked and a["number"] != expected
                            and min(item.y1 for item in linked) < a["rect"].y0 < anchor["rect"].y0
                            and _column_for((a["rect"].x0+a["rect"].x1)/2, columns) == column_index]
    ambiguous_linked_context = bool(interposed_questions)
    for box in linked:
        top = min(top, box.y0)
        bottom = max(bottom, box.y1)
    if next_start:
        bottom = min(bottom, next_start["rect"].y0 - 10)
    if next_group:
        bottom = min(bottom, next_group["rect"].y0 - 8)
    if prior and next_start and anchor and 0 <= anchor["rect"].y0 - prior.y0 <= 150:
        top = min(top, prior.y0)
    body_text = [line for line in included_text
                 if anchor and line["rect"].y1 >= anchor["rect"].y0 - 3
                 and (not next_start or line["rect"].y0 < next_start["rect"].y0 - 4)]
    visual_in_band = []
    if body_text:
        text_top = min(line["rect"].y0 for line in body_text)
        text_bottom = max(line["rect"].y1 for line in body_text)
        question_visual_cue = bool(re.search(r"\b(graph|figure|diagram|table|shown|illustrat|curve|structure|in the box)\b",
                                             (str(question.get("fullText") or "") + " " + " ".join(line["text"] for line in body_text)), re.I))
        for box in visual:
            if not box.intersects(fitz.Rect(col_x0, top, col_x1, max(top + 1, bottom))):
                continue
            # Skip page-wide decorative rules and distant objects; retain graphics
            # overlapping the question body, or explicitly requested by its text.
            # Mere proximity can pull in a neighboring question's table/diagram.
            overlaps_text = box.y1 >= text_top - 8 and box.y0 <= text_bottom + 8
            requested_context = question_visual_cue and box.y1 >= text_top - 110 and box.y0 <= text_bottom + 36
            if box.width / max(1, bounds.width) < .96 and box.x0 >= col_x0 - 18 and box.y0 < footer_start - 4 and (overlaps_text or requested_context):
                visual_in_band.append(box)
    elif linked:
        visual_in_band = [box for box in visual if any(box.intersects(item) for item in linked)]
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
    if question_type == "FRQ" and prior and prior.width >= bounds.width * .8:
        # FRQ equations and labeled diagrams often span the sheet even when their
        # selectable text boxes are fragmented. Keep the catalog's broad x extent
        # while still refining the vertical boundary from measured content.
        left = min(left, prior.x0)
        right = max(right, prior.x1)
    candidate = _expand(fitz.Rect(left, max(bounds.y0, top), right, min(bounds.y1, max(top+1,bottom))),
                        0, 0, bounds)
    # Where a crop estimate is tighter than inferred content, include the full union.
    # A broad prior rectangle is evidence to inspect, not an automatic reason to
    # re-expand a measured crop. Nearby PDF graphics are handled above.

    region_text_chars = sum(len(line["text"]) for line in included_text)
    choice_labels = []
    if question_type == "MCQ":
        for line in included_text:
            if anchor and line["rect"].y0 < anchor["rect"].y0 - 2:
                continue
            if next_start and line["rect"].y0 >= next_start["rect"].y0 - 4:
                continue
            # PyMuPDF often emits the label ("A)") and its answer text as
            # separate lines/spans. Accept both joined and standalone labels.
            match = CHOICE.match(line["text"]) or re.match(r"^\s*([A-E])\s*[.)]?\s*$", line["text"], re.I)
            if match and match.group(1).upper() not in choice_labels:
                choice_labels.append(match.group(1).upper())
    choices = len(choice_labels)
    choice_sequence = len(choice_labels) >= 3 and choice_labels[0] == "A" and all(ord(b) == ord(a) + 1 for a, b in zip(choice_labels, choice_labels[1:]))
    expected_choice_count = 0
    if question_type == "MCQ":
        full_text = str(question.get("fullText") or "")
        expected_choice_count = len(set(re.findall(r"(?m)^\s*([A-E])\s*[.)]\s+", full_text)))
        if expected_choice_count < 3:
            expected_choice_count = 0
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
        "textCharacters": region_text_chars,
        "catalogTextCoverage": catalog_text_coverage,
        "pageTextCharacters": text_chars,
        "questionStartFound": bool(anchor),
        "questionStartMatches": len(matching),
        "nextQuestionBoundaryFound": bool(next_start),
        "answerChoiceMarkers": choices,
        "answerChoiceSequence": choice_sequence,
        "expectedAnswerChoiceMarkers": expected_choice_count,
        "answerChoiceCoverage": choices >= expected_choice_count if expected_choice_count else None,
        "frqSubpartMarkers": subparts,
        "frqSubpartLabels": subpart_labels,
        "frqSubpartSequence": subpart_sequence,
        "graphicsIncluded": len(visual_in_band),
        "linkedStimulusRegions": len(linked),
        "independentQuestionStartsBetweenStimulusAndTarget": len(interposed_questions),
        "sharedQuestionGroupDetected": bool(target_group),
        "followingSharedQuestionGroupBoundary": bool(next_group),
        "introContextLinesIncluded": len(intro_context),
        "columnCount": len(columns),
        "pageRotation": int(page.rotation),
    }
    # This is an evidence score, not a model-confidence claim. Text-poor scans are always
    # routed to manual review, even when a prior rectangle exists.
    score = 0.0
    score += 0.32 if anchor else 0
    score += 0.18 if next_start else 0
    score += 0.18 if region_text_chars >= 80 else (0.08 if region_text_chars >= 25 else 0)
    score += 0.14 if (choice_sequence if question_type == "MCQ" else subparts >= 1) else 0
    score += 0.10 if visual_in_band or linked else 0
    score += 0.08 if prior else 0
    score = round(min(1.0, score), 2)
    choices_incomplete = bool(expected_choice_count and (choices < expected_choice_count or not choice_sequence))
    text_mismatch = catalog_text_coverage is not None and len(catalog_tokens) >= 5 and catalog_text_coverage < .20
    manual = region_text_chars < 25 or not anchor or score < 0.58 or choices_incomplete or ambiguous_linked_context or text_mismatch
    reasons = []
    if text_chars < 25:
        reasons.append("Sparse extractable text on the page; likely scanned or image-only. OCR/manual boundary review is required.")
    elif region_text_chars < 25:
        reasons.append("Very little extractable text falls inside this question crop; manual boundary review is required.")
    if not anchor:
        reasons.append("Expected numbered question start was not located near the metadata estimate.")
    if not next_start:
        reasons.append("No subsequent question boundary was found; the bottom follows extracted question content and nearby graphics, excluding page boilerplate.")
    if prior and (prior.y0 < candidate.y0 - 40 or prior.y1 > candidate.y1 + 40 or prior.width > candidate.width * 1.8):
        reasons.append("Stored crop differs materially from the measured content region; inspect the proposal for image-only content.")
    if question_type == "MCQ" and choices < 3 and not expected_choice_count:
        reasons.append(f"Only {choices} distinct answer-choice markers were detected.")
    if choices_incomplete:
        reasons.append(f"Detected {choices} of {expected_choice_count} answer-choice markers recorded in the question text; manual review is required to avoid a clipped MCQ.")
    if text_mismatch:
        reasons.append(f"Only {catalog_text_coverage:.0%} of distinctive catalog terms appear in the proposed crop; verify that the detected page region matches this question.")
    if question_type == "FRQ" and subparts == 0:
        reasons.append("No lettered FRQ subparts were detected in the candidate region.")
    if signals["columnCount"] > 1:
        reasons.append("A multi-column page layout was detected; the crop is constrained to the nearest column.")
    if signals["pageRotation"]:
        reasons.append(f"Page rotation of {signals['pageRotation']} degrees was detected and retained in the source page geometry.")
    if linked:
        reasons.append("Linked shared-stimulus source regions were included as required context.")
    if target_group:
        reasons.append(f"Shared context for Questions {target_group['first']}–{target_group['last']} was located from the PDF text.")
    if ambiguous_linked_context:
        reasons.append("Independent question starts fall between the linked shared stimulus and this question; separating the shared context requires manual review.")
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


def apply_high_confidence(catalog: dict[str, Any], proposals: dict[str, Any]) -> tuple[dict[str, Any], int]:
    """Return a separate catalog value with only fully high-confidence crops replaced."""
    by_id = {item.get("id"): item for item in proposals.get("questions", [])}
    output_questions = []
    applied = 0
    for original in catalog.get("questions", []):
        question = dict(original)
        proposal = by_id.get(question.get("id"))
        regions = proposal.get("regions", []) if proposal else []
        eligible = bool(regions) and all(
            not region.get("manualReview") and region.get("confidenceBand") == "high" and region.get("rect")
            for region in regions
        )
        if eligible:
            question["sourceRegions"] = [{"page": region["page"], "rect": region["rect"]} for region in regions]
            applied += 1
        output_questions.append(question)
    return {**catalog, "questions": output_questions}, applied


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="ChemAtlas checkout root")
    parser.add_argument("--catalog", type=Path, help="Question catalog JSON (default: ROOT/public/questions.json)")
    parser.add_argument("--stimuli", type=Path, help="Shared-stimulus metadata (default: ROOT/research/stimuli.json when present)")
    parser.add_argument("--pdf-root", type=Path, help="Root containing source PDF paths (default: ROOT/public)")
    parser.add_argument("--output", type=Path, default=Path("question-boundary-proposals.json"))
    parser.add_argument("--apply-high-confidence", action="store_true", help="write a separate catalog with only non-manual high-confidence regions applied")
    parser.add_argument("--catalog-output", type=Path, help="required with --apply-high-confidence; never overwrites the input catalog")
    args = parser.parse_args()
    catalog_path = args.catalog or args.root / "public/questions.json"
    stimuli_path = args.stimuli or args.root / "research/stimuli.json"
    stimuli = json.loads(stimuli_path.read_text(encoding="utf-8")) if stimuli_path.exists() else None
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    result = detect(catalog, args.pdf_root or args.root / "public", stimuli)
    if args.apply_high_confidence and not args.catalog_output:
        parser.error("--catalog-output is required with --apply-high-confidence")
    if args.catalog_output and not args.apply_high_confidence:
        parser.error("--catalog-output requires --apply-high-confidence")
    applied = 0
    if args.apply_high_confidence:
        updated_catalog, applied = apply_high_confidence(catalog, result)
        args.catalog_output.parent.mkdir(parents=True, exist_ok=True)
        args.catalog_output.write_text(json.dumps(updated_catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"questions": result["questionCount"], "manualReview": result["manualReviewCount"], "highConfidenceApplied": applied, "output": str(args.output), "catalogOutput": str(args.catalog_output) if args.catalog_output else None}))


if __name__ == "__main__":
    main()
