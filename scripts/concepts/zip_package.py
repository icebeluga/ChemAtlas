"""Zip a review-package folder under a single root folder and verify the archive.

Usage: uv run --no-project python -I scripts/concepts/zip_package.py PACKAGE_DIR OUT.zip
Uses only the standard library. Entry names use forward slashes, so the zip opens the same on Windows, macOS and Linux.
"""
import sys
import zipfile
from pathlib import Path


def main(src, dest):
    src, dest = Path(src).resolve(), Path(dest).resolve()
    root = dest.stem
    files = sorted(p for p in src.rglob("*") if p.is_file())
    tmp = dest.with_suffix(".zip.partial")
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in files:
            z.write(p, f"{root}/{p.relative_to(src).as_posix()}")
    with zipfile.ZipFile(tmp) as z:  # verify before replacing any earlier archive
        bad = z.testzip()
        names = z.namelist()
    if bad or len(names) != len(files):
        print(f"zip verification failed: bad={bad} entries={len(names)} files={len(files)}", file=sys.stderr)
        return 1
    tmp.replace(dest)
    print(f"zip ok: {dest} ({len(names)} files, {dest.stat().st_size / 1e6:.1f} MB, root folder {root}/)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
