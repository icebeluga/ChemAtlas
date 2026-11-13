"""Build and verify the student release inventory from an exact checkout."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

CATALOG = "public/student-questions.json"
WORKSHEETS = ("worksheet-content.json", "worksheet-sources.json", "worksheet-fragments.pdf")
PUBLIC = (CATALOG, *("public/" + name for name in (
    "questions.json", "page-audit.json", "student-page-audit.json",
    "curriculum-topics.json", "pdf.worker.min.mjs", *WORKSHEETS,
)))
EVIDENCE = ("install", "typecheck", "node-tests", "python-tests", "build", "dry-run", "smoke")


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def sha(value):
    require(re.fullmatch("[0-9a-f]{40}", value), "Expected a full lowercase commit SHA")
    return value


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    Path(path).write_text(json.dumps(value, sort_keys=True, indent=2) + "\n")


def digest(path):
    with Path(path).open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def source_inventory():
    import fitz

    catalog = read(CATALOG)
    questions = catalog["questions"]
    ids = {q["id"] for q in questions}
    require(len(ids) == len(questions) == catalog["stats"]["questions"] > 0, "Catalog count or duplicate IDs")
    require(all(re.fullmatch(r"(?:mcq|frq)-[a-z0-9-]+", i) for i in ids), "Invalid catalog ID")
    require(catalog["audit"] == read("public/student-page-audit.json"), "Page audit mismatch")
    topics = {t[0] for unit in catalog["units"] for t in unit["topics"]}
    pdfs = {}
    next_page = 1
    for entry in sorted(catalog["sourceFiles"], key=lambda item: item["from"]):
        url = entry["url"]
        require(re.fullmatch(r"/source/bank-[0-9]+\.pdf", url) and url not in pdfs, "Invalid source PDF URL")
        path = Path("public" + url)
        with fitz.open(path) as pdf:
            require(entry["from"] == next_page and entry["to"] == next_page + len(pdf) - 1
                    and path.stat().st_size == entry["bytes"], f"PDF range or size mismatch: {url}")
        pdfs[url] = {**entry, "sha256": digest(path)}
        next_page = entry["to"] + 1
    require(next_page - 1 == catalog["sourcePages"] and
            set(pdfs) == {"/source/" + p.name for p in Path("public/source").glob("*.pdf")},
            "Source PDF inventory mismatch")

    def page(number):
        require(type(number) is int and 0 < number < next_page, f"Invalid source page: {number}")

    links = []
    for q in questions:
        require(q["pages"], f"Missing source pages: {q['id']}")
        for number in (q["pages"] + q.get("sourcePagesOriginal", []) + q.get("evidencePages", [])
                       + [region["page"] for region in q.get("sourceRegions", [])]):
            page(number)
        require(set(q.get("sourceAssets", [])) <= pdfs.keys(), f"Unknown source asset: {q['id']}")
        used = q.get("relatedTopics", []) + q.get("secondaryTopics", [])
        used += [t for part in q.get("topicParts", []) for t in part["topics"]]
        if q.get("primaryTopic"):
            used.append(q["primaryTopic"])
        require(set(used) <= topics, f"Unknown topic: {q['id']}")
        links.extend((key, q["id"]) for key in q.get("stimulusIds", []))
    groups = read("research/stimuli.json")["stimuli"]
    registered = []
    for key, group in groups.items():
        bank = pdfs[group["sourceDocument"]]
        require(group["regions"] and group["questionIds"], f"Empty stimulus group: {key}")
        for region in group["regions"]:
            page(region["page"])
            require(bank["from"] <= region["page"] <= bank["to"], f"Wrong stimulus source PDF: {key}")
        registered.extend((key, i) for i in group["questionIds"])
    require(len(set(links)) == len(links) and sorted(links) == sorted(registered), "Shared stimulus links mismatch")

    content, sources = (read("public/" + name) for name in WORKSHEETS[:2])
    for registry in (content, sources):
        require(registry["questions"].keys() <= ids, "Unknown question in worksheet registry")
    for number in [*sources["references"], sources["answerKeyPage"]]:
        page(number)
    with fitz.open("public/" + WORKSHEETS[2]) as pdf:
        fragments = len(pdf)

    def validate_refs(value):
        if isinstance(value, list):
            for item in value:
                validate_refs(item)
        if isinstance(value, dict):
            if "page" in value:
                page(value["page"])
            if "fragment" in value:
                index = value["fragment"]
                require(type(index) is int and 0 <= index < fragments, "Invalid worksheet fragment")
            if "context" in value:
                require(value["context"] in content["contexts"], "Unknown worksheet context")
            for item in value.values():
                validate_refs(item)

    for data in (content["questions"], content["contexts"], sources["questions"]):
        validate_refs(data)
    return {
        "catalog": {"path": CATALOG, "count": len(ids), "sha256": digest(CATALOG)},
        "source_pdfs": pdfs,
        "assets": {p: digest(p) for p in (*PUBLIC, "pnpm-lock.yaml", "research/stimuli.json")},
        "worksheet_assets": {p: digest("public/" + p) for p in WORKSHEETS},
        "shared_stimuli": {"groups": len(groups), "links": len(links)},
    }


def check_config(path, built=False):
    cfg = read(path)
    require(cfg["name"] == "chematlas-student-private" and cfg["workers_dev"] is False
            and cfg["preview_urls"] is False, "Unexpected Worker identity or exposure")
    assets = {"binding": "ASSETS", "run_worker_first": True}
    if built:
        assets["directory"] = "../client"
    require(cfg["assets"] == assets, "Unexpected asset routing")
    require(cfg["main"] == ("index.js" if built else "./worker/index.ts"), "Unexpected Worker entry point")
    structural = {"$schema", "name", "main", "compatibility_date", "compatibility_flags",
                  "workers_dev", "preview_urls", "assets", "configPath", "userConfigPath",
                  "topLevelName", "jsx_factory", "jsx_fragment", "rules", "python_modules", "dev", "no_bundle"}
    for key in cfg.keys() - structural:
        require(cfg[key] in (None, [], {}, {"bindings": []}, {"producers": [], "consumers": []}),
                f"Unexpected Wrangler setting or binding: {key}")


def build_inventory(inputs):
    check_config("dist/server/wrangler.json", built=True)
    require(Path("dist/server/index.js").is_file(), "Missing Worker entry")
    for name, expected in inputs["assets"].items():
        if name.startswith("public/"):
            require(digest("dist/client/" + name.removeprefix("public/")) == expected, f"Built asset mismatch: {name}")
    for url, entry in inputs["source_pdfs"].items():
        require(digest("dist/client" + url) == entry["sha256"], f"Built source PDF mismatch: {url}")
    files = {}
    for path in sorted(Path("dist").rglob("*")):
        require(not path.is_symlink(), f"Symlink in artifact: {path}")
        require(not re.search(r"(^|/)(admin|question-review|review-dashboard|question-images)([/.\-]|$)",
                              str(path), re.I), f"Private asset in student build: {path}")
        if path.suffix in {".js", ".mjs"}:
            require(not re.search(r"chematlas-private-question-review|QUESTION_REVIEW_DB|QUESTION_IMAGES_BUCKET|/api/admin/question-review",
                                  path.read_text()), f"Private code in student build: {path}")
        if path.is_file():
            files[str(path)] = digest(path)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("inputs", "prepare", "stamp", "seal", "verify"))
    parser.add_argument("application_sha", type=sha)
    parser.add_argument("--workflow-sha", type=sha)
    parser.add_argument("--expected-inputs")
    parser.add_argument("--manifest")
    parser.add_argument("--evidence", type=Path)
    args = parser.parse_args()
    require(subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == args.application_sha,
            "Selected application SHA differs from checkout HEAD")
    require(not subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=all"]),
            "Application checkout contains local changes")
    check_config("wrangler.student.jsonc")
    inputs = source_inventory()
    selection = {"schema_version": 1, "application_sha": args.application_sha, "inputs": inputs}
    if args.expected_inputs:
        require(read(args.expected_inputs) == selection, "Selected SHA, catalog, or source assets differ from reviewed inputs")
    if args.mode == "inputs":
        print(json.dumps(selection, indent=2, sort_keys=True))
        return
    if args.mode == "prepare":
        return
    require(args.workflow_sha, "Workflow SHA is required")
    version = {"release_id": f"chematlas-student-{args.application_sha}",
               "application_sha": args.application_sha, "workflow_sha": args.workflow_sha,
               "catalog_sha256": inputs["catalog"]["sha256"], "catalog_count": inputs["catalog"]["count"]}
    version_path = "dist/client/student-version.json"
    if args.mode == "stamp":
        require(not Path("public/student-version.json").exists(), "Version asset already exists in application source")
        write("public/student-version.json", version)
        return
    require(read(version_path) == version, "Version asset mismatch")
    manifest = {"schema_version": 1, "identity": version, "inputs": inputs,
                "build_files": build_inventory(inputs),
                "checks": {name: {"result": "passed", "log_sha256": digest(args.evidence / f"{name}.log")}
                           for name in EVIDENCE},
                "cloudflare_worker_version": None, "previous_known_good": None}
    if args.mode == "seal":
        write(args.manifest, manifest)
    else:
        require(args.expected_inputs, "A reviewed input manifest is required")
        require(read(args.manifest) == manifest, "Artifact, version, or evidence differs from the sealed manifest")


if __name__ == "__main__":
    main()
