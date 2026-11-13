"""Compile only reviewed question regions into a vector-preserving fragment bank.

The source crop box limits placement. Redaction also removes text and pixels outside
that box so neighboring stems cannot leak through selection or text extraction.
"""
import json
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

import fitz

PUBLIC = Path(__file__).resolve().parents[1] / "public"
catalog = json.loads((PUBLIC / "questions.json").read_text())
registry = json.loads((PUBLIC / "worksheet-sources.json").read_text())
questions = {q["id"]: q for q in catalog["questions"]}


@lru_cache
def document(url):
    return fitz.open(PUBLIC / url.lstrip("/"))


def lookup(n):
    source = next(s for s in catalog["sourceFiles"] if s["from"] <= n <= s["to"])
    return document(source["url"]), n - source["from"]


def append_fragment(output, n, coords, original_number=None, verify_pixels=False):
    source, index = lookup(n)
    original = source[index]
    box = fitz.Rect(coords)
    assert original.rect.contains(box) and box != original.rect and not box.is_empty
    with fitz.open() as temp:
        temp.insert_pdf(source, from_page=index, to_page=index, links=False, annots=False, widgets=False)
        page = temp[0]
        bounds = page.rect
        for rect in [(0, 0, bounds.x1, box.y0), (0, box.y1, bounds.x1, bounds.y1),
                     (0, box.y0, box.x0, box.y1), (box.x1, box.y0, bounds.x1, box.y1)]:
            if not fitz.Rect(rect).is_empty:
                page.add_redact_annot(rect, fill=False, cross_out=False)
        has_image = any(fitz.Rect(image["bbox"]).intersects(box) for image in original.get_image_info())
        if original_number is not None and not has_image:
            # Remove only an isolated printed stem number, never a choice or an
            # OCR number over a scan. The worksheet draws its own numbering.
            words = original.get_text("words", clip=box)
            numbers = [word for word in words if word[4] == f"{original_number}."
                       and not any(other[5:7] == word[5:7] and other[0] < word[0] for other in words)]
            if len(numbers) == 1:
                number_box = fitz.Rect(numbers[0][:4]) + (-.4, -.2, .4, .2)
                if not any(word != numbers[0] and fitz.Rect(word[:4]).intersects(number_box) for word in words):
                    page.add_redact_annot(number_box, fill=False, cross_out=False)
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS if has_image or not verify_pixels
                              else fitz.PDF_REDACT_IMAGE_REMOVE,
                              graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                              text=fitz.PDF_REDACT_TEXT_REMOVE)
        if verify_pixels:
            before = original.get_pixmap(clip=box, alpha=False, annots=False)
            after = page.get_pixmap(clip=box, alpha=False, annots=False)
            assert (before.width, before.height) == (after.width, after.height)
            if before.samples != after.samples:
                changed = sum(abs(a - b) > 24 for a, b in zip(before.samples, after.samples))
                assert changed <= .001 * len(before.samples), "Redaction changes the crop"
        # Discard unreachable source streams before copying the bounded page.
        page.set_cropbox(box)
        output.insert_pdf(temp, links=False, annots=False, widgets=False)
    return {"kind": "region", "page": n, "rect": coords, "fragment": len(output) - 1}


# These boundaries include prompts, figures, instructions needed to answer, and subparts.
# The long kinetics FRQ splits before the second experimental setup and at part (c).
frq = {
    1: [(6, [42, 295, 560, 698])],
    2: [(7, [42, 110, 560, 388])],
    3: [(8, [42, 58, 557, 411]), (8, [42, 412, 557, 662]), (9, [42, 60, 557, 327])],
    4: [(10, [42, 118, 563, 533])],
    5: [(11, [42, 56, 562, 526])],
    6: [(12, [42, 56, 562, 600])],
    7: [(13, [42, 110, 562, 560])],
    8: [(14, [42, 54, 562, 560])],
}
additional = {
    "mcq-2014-40-187": (187, [44, 291, 294, 452]),
    "mcq-2002-47-616": (616, [40, 294, 294, 378]),
    "mcq-2016-2-1053": (1053, [62, 413, 295, 554]),
    "mcq-2018-20-1202": (1202, [44, 42, 291, 238]),
    "mcq-2019-3-1303": (1303, [33, 483, 580, 648]),
    "mcq-2023-6-1720": (1720, [319, 544, 591, 668]),
}
# Verified against the printed source. The lightweight inline notation stores
# subscripts and charges explicitly and does not infer them from OCR.
structured = {
    "mcq-1994-21-680": (
        "When a solution of sodium chloride is vaporized in a flame, the color of the flame is",
        ["blue", "yellow", "green", "violet", "white"],
    ),
    "mcq-2013-19-959": (
        "A 0.20 mol sample of MgCl_{2}(s) and a 0.10 mol sample of KCl(s) are dissolved in water and diluted to 500 mL. What is the concentration of Cl^{-} in the solution?",
        ["0.15 M", "0.30 M", "0.50 M", "0.60 M", "1.0 M"],
    ),
    "mcq-2012-18-1354": (
        "Solid Al(NO_{3})_{3} is added to distilled water to produce a solution in which the concentration of nitrate, [NO_{3}^{-}], is 0.10 M. What is the concentration of aluminum ion, [Al^{3+}], in this solution?",
        ["0.010 M", "0.033 M", "0.066 M", "0.10 M", "0.30 M"],
    ),
    "mcq-2022-2-1617": (
        "Which of the following questions about the components in a mixture could be investigated with a paper chromatography experiment?",
        ["Do the components have different densities?", "Do the components have different molecular masses?",
         "Do the components have different molecular polarities?", "Do the components have different average molecular speeds?"],
    ),
}

# Repair the four inherited crops whose first stem line starts above y=55.
stem_tops = {
    "mcq-2012-56-1362": 46, "mcq-2012-66-1367": 43,
    "mcq-2012-68-1367": 43, "mcq-2012-71-1368": 43,
}

manifest = {}
with fitz.open() as output:
    for id, record in registry["questions"].items():
        if id in structured:
            continue
        q = questions[id]
        regions = frq[q["number"]] if q["type"] == "FRQ" else [(p["page"], p["rect"]) for p in record["pages"]]
        if id in stem_tops:
            n, (left, _, right, bottom) = regions[0]
            regions = [(n, [left, stem_tops[id], right, bottom])]
        manifest[id] = {"blocks": [append_fragment(output, n, rect, q["number"] if i == 0 else None) for i, (n, rect) in enumerate(regions)]}
    for id, (n, rect) in additional.items():
        assert id in questions
        manifest[id] = {"blocks": [append_fragment(output, n, rect, questions[id]["number"])]}
    for id, (stem, choices) in structured.items():
        assert id in questions
        manifest[id] = {"blocks": [{"kind": "paragraph", "text": stem}, {"kind": "choices", "choices": choices}]}
    shared = append_fragment(output, 32, [61, 316, 322, 415])
    stem = append_fragment(output, 32, [32, 487, 350, 510], 17)
    manifest["mcq-2008-17-32"] = {"context": "2008-a-reactions-15-17", "blocks": [stem]}
    manifest["frq-2006-6-25"] = {"blocks": [
        append_fragment(output, 25, [42, 70, 562, 353], 6),
        append_fragment(output, 25, [42, 363, 562, 585]),
        append_fragment(output, 26, [42, 70, 562, 425]),
    ]}
    contexts = {"2008-a-reactions-15-17": [{"kind": "paragraph", "text": "Use the following reactions."}, shared]}
    checkpoint = json.loads(Path(__file__).with_name("worksheet-extraction-checkpoint.json").read_text())
    records = {id: row for batch in checkpoint.values() for id, row in batch["records"].items()}
    assert records.keys() == questions.keys()
    assert set(manifest) == {id for id, row in records.items() if row["status"] == "previously_ready"}

    for id, row in records.items():
        if not row["status"].startswith("staged_"):
            continue
        start = len(output)
        key = row.get("context")
        if key == "2008-a-reactions":
            key = "2008-a-reactions-15-17"

        def compile_regions(regions):
            return [append_fragment(output, r["page"], r["rect"], verify_pixels=True) for r in regions]

        try:
            context = compile_regions(row["shared"]) if key and key not in contexts else None
            blocks = compile_regions(row["regions"])
        except (AssertionError, ValueError, RuntimeError, fitz.mupdf.FzErrorBase):
            if len(output) > start:
                output.delete_pages(start, len(output) - 1)
            row.update(status="fragment_validation_failed",
                       detail="The proposed region changed during redaction and needs visual verification.")
            continue
        if context:
            contexts[key] = context
        manifest[id] = {"blocks": blocks, **({"context": key} if key else {})}
        row["status"] = row["status"].replace("staged_", "new_ready_")

    output.save(PUBLIC / "worksheet-fragments.pdf", garbage=4, deflate=True, no_new_id=True)
    print(f"{len(manifest)} question objects, {len(output)} bounded PDF fragments")

(PUBLIC / "worksheet-content.json").write_text(json.dumps({
    "questions": manifest, "contexts": contexts,
    "review": {id: row["detail"] for id, row in records.items() if id not in manifest},
}, separators=(",", ":")) + "\n")

groups = defaultdict(Counter)
source_keys = defaultdict(list)
for id, row in records.items():
    q = questions[id]
    key = (q["source"], q["year"] or "Unknown", q["type"])
    groups[key][row["status"]] += 1
    source_keys[(q["source"], q["type"], q["number"], tuple(row.get("pages", [])))].append(id)
    row.update(source=q["source"], year=q["year"], type=q["type"])

report = {
    "catalog_records": len(questions),
    "unique_ids": len(questions),
    "selectable": len(questions),
    "distinct_source_keys": len(source_keys),
    "source_key_collisions": [ids for ids in source_keys.values() if len(ids) > 1],
    "export_ready": len(manifest),
    "export_ready_by_type": Counter(questions[id]["type"] for id in manifest),
    "new_export_ready": sum(row["status"].startswith("new_ready_") for row in records.values()),
    "unresolved": len(questions) - len(manifest),
    "batches": len(checkpoint),
    "structured_content": len(structured),
    "status_counts": Counter(row["status"] for row in records.values()),
    "flag_counts": Counter(flag for row in records.values() for flag, value in row["flags"].items() if value),
    "groups": [{"source": source, "year": year, "type": kind, "statuses": counts}
               for (source, year, kind), counts in sorted(groups.items())],
    "records": records,
}
Path(__file__).with_name("worksheet-catalog-coverage.json").write_text(json.dumps(report, indent=2) + "\n")
