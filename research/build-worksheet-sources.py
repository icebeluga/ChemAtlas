"""Build conservative worksheet crops from the original bundled booklets."""
import json
import re
from functools import lru_cache
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / "public/questions.json").read_text())
files = catalog["sourceFiles"]


@lru_cache
def document(url):
    return fitz.open(ROOT / "public" / url.lstrip("/"))


def page(number):
    source = next(f for f in files if f["from"] <= number <= f["to"])
    return document(source["url"])[number - source["from"]]


key_text = page(2064).get_text()
assert "Multiple-Choice Answer Key" in key_text
key = {int(n): value for n, value in re.findall(r"(?m)^\s*(\d+)\s*\n([A-E])\s*$", key_text)}
assert len(key) == 75 and key[23] == "C"
special = {
    (1354, 17): [40, 112, 277, 239],
    (1366, 65): [319, 37, 574, 536],
    (2039, 23): [148, 38, 465, 313],
}
frqs = [[6], [7], [8, 9], [10], [11], [12], [13], [14]]
records = {}
for q in catalog["questions"]:
    pages = q.get("sourcePagesOriginal") or q["pages"]
    start = pages[0]
    n = q["number"]
    if q["type"] == "FRQ":
        if q["year"] == "2005" and 1 <= n <= len(frqs) and pages == frqs[n - 1]:
            records[q["id"]] = {"pages": [{"page": p, "rect": [0, 0, *list(page(p).rect)[2:]]} for p in pages]}
        continue
    if len(pages) != 1 or not (1353 <= start <= 1368 or 2037 <= start <= 2051):
        continue
    regions = q.get("sourceRegions", [])
    if len(regions) != 1 or regions[0]["page"] != start:
        continue
    pdf_page = page(start)
    rect = fitz.Rect(special.get((start, n), regions[0]["rect"]))
    text = pdf_page.get_text(clip=rect, sort=True)
    if not pdf_page.rect.contains(rect) or rect.is_empty:
        continue
    if re.findall(r"(?m)^\s*(\d{1,3})\.\s", text) != [str(n)]:
        continue
    if re.findall(r"\(([A-E])\)", text) != list("ABCDE"):
        continue
    if (start, n) not in special:
        if re.search(r"Directions:|GO ON TO THE NEXT PAGE|Unauthorized copying", text, re.I):
            continue
        if re.search(r"Questions?\s+\d+\s*[-–—]", pdf_page.get_text(), re.I) or re.search(r"\b(above|preceding|following information|following passage)\b", text, re.I):
            continue
    record = {"pages": [{"page": start, "rect": list(rect)}]}
    if start >= 2037:
        record["exam"] = "2008 AP Chemistry Practice Exam"
        record["answer"] = key[n]
    records[q["id"]] = record

output = {"questions": records, "references": [439, 440, 441], "answerKeyPage": 2064}
(ROOT / "public/worksheet-sources.json").write_text(json.dumps(output, separators=(",", ":")) + "\n")
print(len(records), "printable questions;", sum("answer" in q for q in records.values()), "verified answers")
