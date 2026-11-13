"""Exercise the release guards offline against a validated package."""
import argparse
import copy
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from manifest import digest, read, write

CONTROL = Path(__file__).resolve().parent


def reject(command, message, env=None):
    result = subprocess.run(command, env=env, text=True, capture_output=True)
    if result.returncode == 0 or message not in result.stderr:
        raise RuntimeError(f"Expected {message!r}, got {result.returncode}: {result.stderr}")
    print("PASS rejection:", message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("application_sha")
    parser.add_argument("output", type=Path)
    parser.add_argument("rollback", type=Path)
    args = parser.parse_args()
    out = args.output.resolve()
    selection = read(out / "release-inputs.json")
    manifest = read(out / "release-manifest.json")
    workflow = manifest["identity"]["workflow_sha"]
    check = [sys.executable, str(CONTROL / "manifest.py")]
    verify = [*check, "verify", args.application_sha, "--workflow-sha", workflow,
              "--expected-inputs", str(out / "release-inputs.json"),
              "--manifest", str(out / "release-manifest.json"), "--evidence", str(out / "evidence")]
    subprocess.run(verify, check=True)
    reject([*check, "prepare", "main"], "Expected a full lowercase commit SHA")
    reject([*check, "prepare", "f" * 40], "Selected application SHA differs from checkout HEAD")
    with tempfile.TemporaryDirectory() as directory:
        scratch = Path(directory)
        input_file = scratch / "input.json"
        for field, change in (
            ("application SHA", lambda d: d.update(application_sha="f" * 40)),
            ("catalog hash", lambda d: d["inputs"]["catalog"].update(sha256="0" * 64)),
            ("worksheet hash", lambda d: d["inputs"]["worksheet_assets"].update({"worksheet-fragments.pdf": "0" * 64})),
        ):
            changed = copy.deepcopy(selection)
            change(changed)
            write(input_file, changed)
            reject([*check, "prepare", args.application_sha, "--expected-inputs", str(input_file)],
                   "differ from reviewed inputs")
            print("  Mismatch case:", field)
        artifact = Path("dist/client/student-version.json")
        original = artifact.read_bytes()
        try:
            artifact.write_text("{}")
            reject(verify, "Version asset mismatch")
        finally:
            artifact.write_bytes(original)
        rollback = read(args.rollback)
        record = {
            "schema_version": 1, "application_sha": args.application_sha, "validation_workflow_sha": workflow,
            "run_id": 1, "artifact_id": 1, "package_sha256": digest(out / "student-dist.tar.gz"),
            "release_manifest_sha256": digest(out / "release-manifest.json"),
            "hosted_access": {"result": "passed", "application_sha": args.application_sha,
                              "evidence": "synthetic rehearsal fixture only"},
            "previous_known_good": {"application_sha": rollback["application_sha"],
                                   "worker_version": "00000000-0000-0000-0000-000000000001",
                                   "manifest_reference": "rollback-source.json"},
        }
        record["hosted_access"]["package_sha256"] = record["package_sha256"]
        approval = scratch / "approval.json"
        write(approval, record)
        approve = [sys.executable, str(CONTROL / "approve.py")]
        auth = [*approve, "authorize", args.application_sha, str(approval)]
        env = {**os.environ, "GITHUB_OUTPUT": str(scratch / "outputs"), "APPROVAL_SHA256": "0" * 64}
        reject(auth, "Owner approval digest does not match", env)
        subprocess.run(auth, env={**env, "APPROVAL_SHA256": digest(approval)}, check=True)
        subprocess.run([*approve, "unpack", args.application_sha, str(approval), str(out)], cwd=scratch, check=True)
        for path, expected in manifest["build_files"].items():
            if digest(scratch / path) != expected:
                raise RuntimeError(f"Promoted file mismatch: {path}")
        record["hosted_access"]["result"] = "pending"
        write(approval, record)
        reject(auth, "Hosted Access evidence does not match this artifact", env)
        print("PASS sealed archive extraction, exact file hashes and rollback record association")


if __name__ == "__main__":
    main()
