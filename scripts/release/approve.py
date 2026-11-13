"""Check owner authorization and extract the exact validated student package."""
import argparse
import os
from pathlib import Path
import re
import tarfile

from manifest import digest, read, require, sha

UUID = r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("authorize", "unpack"))
    parser.add_argument("application_sha", type=sha)
    parser.add_argument("approval", type=Path)
    parser.add_argument("package", type=Path, nargs="?")
    args = parser.parse_args()
    record = read(args.approval)
    require(record["schema_version"] == 1 and record["application_sha"] == args.application_sha,
            "Application SHA differs from the owner-approved selection")
    workflow = sha(record["validation_workflow_sha"])
    require(record["hosted_access"]["result"] == "passed"
            and record["hosted_access"]["application_sha"] == args.application_sha
            and record["hosted_access"]["package_sha256"] == record["package_sha256"]
            and record["hosted_access"]["evidence"], "Hosted Access evidence does not match this artifact")
    previous = record["previous_known_good"]
    sha(previous["application_sha"])
    require(re.fullmatch(UUID, previous["worker_version"]) and previous["manifest_reference"],
            "An exact verified rollback version and manifest are required")
    for key in ("package_sha256", "release_manifest_sha256"):
        require(re.fullmatch("[0-9a-f]{64}", record[key]), f"Invalid {key}")
    for key in ("run_id", "artifact_id"):
        require(type(record[key]) is int and record[key] > 0, f"Invalid {key}")

    if args.mode == "authorize":
        require(os.environ.get("APPROVAL_SHA256") == digest(args.approval), "Owner approval digest does not match")
        with Path(os.environ["GITHUB_OUTPUT"]).open("a") as output:
            for key in ("run_id", "artifact_id"):
                print(f"{key}={record[key]}", file=output)
            print(f"validation_workflow_sha={workflow}", file=output)
            print(f"previous_version={previous['worker_version']}", file=output)
        return

    package = args.package
    archive = package / "student-dist.tar.gz"
    require(digest(archive) == record["package_sha256"] and
            digest(package / "release-manifest.json") == record["release_manifest_sha256"],
            "Downloaded package or manifest digest differs from owner approval")
    require(not Path("dist").exists(), "Extraction requires a clean dist path")
    with tarfile.open(archive) as tar:
        entries = tar.getmembers()
        require(all((m.isfile() or m.isdir()) and Path(m.name).parts[:1] == ("dist",)
                    and ".." not in Path(m.name).parts for m in entries), "Unexpected archive member")
        require(len({m.name for m in entries}) == len(entries), "Duplicate archive member")
        tar.extractall(filter="data")


if __name__ == "__main__":
    main()
