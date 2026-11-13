"""Audit the full catalog, checkpointed by source segment and exam."""
from collections import Counter, defaultdict
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
import json
import math
import re

import fitz

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
RESEARCH = ROOT / "research"
catalog = json.loads((PUBLIC / "questions.json").read_text())
reviewed_path = RESEARCH / "worksheet-reviewed-regions.json"
reviewed = json.loads(reviewed_path.read_text())
baseline_path = RESEARCH / "worksheet-baseline-ids.json"
baseline = set(json.loads(baseline_path.read_text()))
checkpoint = RESEARCH / "worksheet-extraction-checkpoint.json"
STEM = re.compile(r"^\s*(\d{1,3})[.)](?:\s|$)")
CHOICE = re.compile(r"(?<!\w)(?:\(([A-E])\)|\b([A-E])\))(?=\s|$)")
SHARED = re.compile(r"\bquestions?\s+(\d{1,3})\s*(?:[-–—−]|through|to|and)\s*(\d{1,3})", re.I)
FIGURE = re.compile(r"\b(?:above|below|shown|diagram|graph|figure|table|preceding|following passage|following information|following data|data provided|refer to|pictured)\b", re.I)
KEY = re.compile(r"\b(?:answer key|scoring guidelines|scoring commentary|correct answer|answer explanations|question rationales)\b", re.I)
NOISE = re.compile(r"unauthorized copying|go on to the next page|all rights reserved|copyright|scan to open|studocu|end of section", re.I)
files = catalog["sourceFiles"]


@lru_cache(None)
def document(url):
    try:
        return fitz.open(PUBLIC / url.lstrip("/"))
    except (OSError, ValueError, RuntimeError):
        return None


@lru_cache(None)
def page(n):
    file = next((f for f in files if f["from"] <= n <= f["to"]), None)
    if not file:
        return None, None
    doc = document(file["url"])
    index = n - file["from"]
    return file["url"], doc[index] if doc is not None and index < len(doc) else None


@lru_cache(None)
def geometry(n):
    _, p = page(n)
    lines = []
    for block in p.get_text("dict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            if text:
                lines.append((fitz.Rect(line["bbox"]), text))
    lines.sort(key=lambda line: (round(line[0].y0 / 3), line[0].x0))
    return lines, p.get_text(), [fitz.Rect(x["bbox"]) for x in p.get_image_info()], [fitz.Rect(x["rect"]) for x in p.get_drawings()]


def status(code, detail, **kw):
    return {"status": code, "detail": detail, **kw}


def region(n, bounds):
    return {"page": n, "rect": list(bounds)}


def choices(text):
    return [a or b for a, b in CHOICE.findall(text)]


def mcq(q, n, crops):
    _, p = page(n)
    lines, text, images, drawings = geometry(n)
    if not lines or any((r & p.rect).get_area() > .5 * p.rect.get_area() for r in images):
        return status("scan_review", "Scan or OCR boundaries need visual review.")
    if len(crops) != 1 or crops[0]["page"] != n:
        return status("multiple_regions_review", "The question needs a verified column or multiple source regions.")
    hint = fitz.Rect(crops[0]["rect"])
    if not p.rect.contains(hint) or hint.is_empty:
        return status("boundary_review", "The recorded crop is outside the source.")
    column = [(r,t) for r,t in lines if hint.x0 <= r.x0 < hint.x1]
    stems = [(r,t) for r,t in column if hint.y0 - 15 <= r.y0 < hint.y1
             and (m := STEM.match(t)) and int(m.group(1)) == q["number"]]
    if len(stems) != 1:
        return status("stem_review", "Could not locate exactly one expected numbered stem in this column.")
    stem, _ = stems[0]
    if SHARED.search(text) or (page(n-1)[1] is not None and
            any(int(a) <= q["number"] <= int(b) for a,b in SHARED.findall(geometry(n-1)[1]))):
        return status("shared_context_review", "A shared passage, figure, or answer list needs to be associated with the stem.")
    own = []
    for r,t in column:
        if r.y0 < stem.y0 - 2:
            continue
        if r.y0 >= hint.y1 or (r.y0 > stem.y0 + 3 and STEM.match(t)) or NOISE.search(t):
            break
        own.append((r,t))
    joined = "\n".join(t for _,t in own)
    if FIGURE.search(joined):
        return status("diagram_or_context_review", "The stem refers to a figure or data that needs a visual boundary check.")
    answer_labels = choices(joined)
    if answer_labels not in (list("ABCD"),list("ABCDE")):
        return status("choices_review", "Could not confirm one complete, ordered set of answer choices.")
    if any(second.y0 - first.y1 > 31 for (first,_),(second,_) in zip(own, own[1:])):
        return status("spacing_review", "An internal gap may separate a figure or unrelated content.")
    last = max(i for i,(_,t) in enumerate(own) if choices(t))
    tail = own[last+1:]
    if tail:
        # Continuations of a final answer are left aligned to its text and
        # directly adjacent. A detached equation can introduce the next stem.
        final_rect, final_text = own[last]
        if not re.search(r"[A-Za-z]{2,}", CHOICE.sub("", final_text)) or len(tail) > 3:
            return status("tail_review", "Could not verify text after the final answer label.")
        for r,t in tail:
            if r.y0 - final_rect.y1 > 7 or not 4 <= r.x0 - own[last][0].x0 <= 44 or not re.search(r"[a-z]{3}",t):
                return status("tail_review", "Detached text or an equation may belong to the next question.")
            final_rect = r
    box = fitz.Rect(math.floor(min(r.x0 for r,t in own)-3),math.floor(min(r.y0 for r,t in own)-3),
                    math.ceil(max(r.x1 for r,t in own)+3),math.ceil(max(r.y1 for r,t in own)+3))
    if not p.rect.contains(box) or box.width >= p.rect.width or box.height > p.rect.height * .7:
        return status("boundary_review", "Could not isolate a compact question rectangle.")
    for r,t in column:
        if r.y0 < box.y1:
            continue
        if STEM.match(t) or NOISE.search(t) or t.isdigit():
            break
        if choices(t) or r.y0 < box.y1+24:
            return status("tail_review", "Text just outside the crop may continue the question.")
    if any(r.intersects(box) and (r,t) not in own for r,t in lines):
        return status("neighbor_review", "Unrelated text intersects the proposed crop.")
    support = fitz.Rect(box.x0, max(0,box.y0-22), box.x1,box.y1)
    if any((r & support).get_area() > 4 for r in images) or any(
            r.intersects(support) for r in drawings if r.width > 7 or r.height > 7):
        return status("diagram_or_context_review", "Artwork or a ruled table intersects or precedes the stem.")
    words = lambda t: set(re.findall(r"[a-z]{3,}",t.lower())[:10])
    expected = words(q.get("textPreview") or "")
    if len(expected) < 4 or len(expected & words(joined)) < min(5,len(expected)):
        return status("record_mismatch", "The printed stem could not be matched to the catalog excerpt.")
    return status("staged_mcq", "Matched source stem, ordered choices, and clear crop boundaries.", regions=[region(n,box)])


shared_groups = [
 (29,"elements",[63,440,280,550],[[32,555,294,590],[32,601,175,623],[32,634,226,657]]),
 (31,"titration",[61,90,301,399],[[32,405,297,454],[32,464,298,500],[32,510,300,559]]),
 (31,"gases",[340,69,552,195],[[324,198,577,220],[324,232,577,253],[324,264,577,301]]),
 (31,"energies",[340,310,532,410],[[320,413,581,449],[320,459,576,508]]),
 (32,"signs",[61,68,286,231],[[32,237,302,273],[320,70,581,93],[320,106,582,144]]),
 (32,"reactions",[61,316,322,415],[[32,421,180,443],[32,453,361,477]]),
]
shared = {}
i = 1
for n, name, context, stems in shared_groups:
    for stem in stems:
        shared[f"mcq-2008-{i}-{n}"] = (n,name,context,stem)
        i += 1


def audit(q, pages):
    id = q["id"]
    refs = [page(n) for n in pages]
    available = bool(refs) and all(p is not None for _,p in refs)
    crops = q.get("sourceRegions") or []
    flags = {"source_available": available, "has_crop_metadata": bool(crops),
             "multiple_pages": len(pages)>1,"multiple_regions": len(crops)>1,
             "has_bounded_crop_on_every_page": bool(pages) and set(pages) <= {
                 c["page"] for c in crops if page(c["page"])[1] is not None
                 and page(c["page"])[1].rect.contains(fitz.Rect(c["rect"])) and not fitz.Rect(c["rect"]).is_empty}}
    if not available:
        return status("missing_source", "One or more recorded source pages could not be opened.", flags=flags)
    text = "\n".join(geometry(n)[1] for n in pages)
    flags.update(shared_context_cue=bool(SHARED.search(text)), figure_or_table_cue=bool(FIGURE.search(q.get("fullText") or q.get("textPreview") or "")),
                 original_raster_detected=any(geometry(n)[2] for n in pages),
                 multipart_cue=q["type"]=="FRQ" and len(set(re.findall(r"\(([a-h])\)",text)))>1)
    if id in baseline:
        row = status("previously_ready", "Preserved previously reviewed worksheet content.")
    elif KEY.search(text) or any("answer/scoring/diagnostic" in x.lower() for x in q.get("extractionWarnings",[])):
        row = status("answer_material_review", "The recorded pages may contain an answer key, scoring material, or explanations.")
    elif id in shared:
        n,name,context,stem = shared[id]
        assert n in pages and re.search(rf"\b{q['number']}\.",page(n)[1].get_text(clip=fitz.Rect(stem)))
        row = status("staged_shared_mcq","Reviewed and isolated the stem and its separate shared source region.",
                     context=f"2008-a-{name}",shared=[region(n,context)],regions=[region(n,stem)])
    elif id in reviewed:
        regions = [region(n,box) for n,*box in reviewed[id]]
        for index,r in enumerate(regions):
            p = page(r["page"])[1]
            assert p.rect.contains(fitz.Rect(r["rect"]))
            if q["year"] != "2006":
                marker = "Begin" if index==0 else "Continue"
                assert re.search(rf"{marker} your response to QUESTION {q['number']}\b",p.get_text()),id
            elif index==0:
                assert re.search(rf"\b{q['number']}\.",p.get_text(clip=fitz.Rect(r["rect"]))),id
        row = status("staged_frq","Reviewed booklet stem, figures, subparts and numbered continuations.",regions=regions)
    elif q["type"] == "FRQ":
        first = re.search(r"Begin your response to QUESTION (\d+)\b", geometry(pages[0])[1])
        if first and int(first.group(1)) != q["number"]:
            row = status("record_mismatch",f"The first cited page begins question {first.group(1)}, but the catalog record is question {q['number']}.")
        else:
            row = status("frq_review","Verify the full sequence of subparts, figures, and continuation pages.")
    elif len(pages) != 1:
        row = status("multiple_regions_review","Verify this multi-page MCQ’s stem, context and choices.")
    else:
        row = mcq(q,pages[0],crops)
    return {**row,"flags":flags,"pages":pages,"source_segments":sorted({url for url,_ in refs if url})}


def save(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value,indent=2)+"\n")
    temporary.replace(path)


if __name__ == "__main__":
    groups = defaultdict(list)
    ids = set()
    for q in catalog["questions"]:
        assert q["id"] not in ids,q["id"]
        ids.add(q["id"])
        pages = list(dict.fromkeys(q.get("sourcePagesOriginal") or q.get("pages") or []))
        segment = page(pages[0])[0] if pages else None
        groups[(q["source"],segment or "",q["year"] or "Unknown",q["exam"])].append((q,pages))
    fingerprint = sha256(Path(__file__).read_bytes()+reviewed_path.read_bytes()+baseline_path.read_bytes())
    for f in files:
        p = PUBLIC / f["url"].lstrip("/")
        fingerprint.update(sha256(p.read_bytes()).digest() if p.exists() else b"missing")
    old = json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
    new = {}
    reused = 0
    for group,records in sorted(groups.items()):
        key = " | ".join(group)
        signature = sha256(fingerprint.digest()+json.dumps(records,sort_keys=True).encode()).hexdigest()
        if old.get(key,{}).get("fingerprint") == signature:
            new[key] = old[key]
            reused += 1
        else:
            new[key] = {"fingerprint":signature,"records":{q["id"]:audit(q,pages) for q,pages in records}}
            save(checkpoint,{**old,**new})
    save(checkpoint,new)
    print(f"{len(ids)} records, {len(new)} batches, {reused} reused")
    print(dict(Counter(row["status"] for batch in new.values() for row in batch["records"].values())))
