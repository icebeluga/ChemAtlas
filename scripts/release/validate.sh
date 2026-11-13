#!/usr/bin/env bash
set -euo pipefail
control="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sha="$1"
workflow_sha="$2"
out="$(realpath -m "$3")"
expected=()
if [[ -n "${4:-}" ]]; then expected=(--expected-inputs "$(realpath "$4")"); fi
mkdir -p "$out/evidence"
export PYTHONDONTWRITEBYTECODE=1 WRANGLER_SEND_METRICS=false CI=true
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_API_KEY CLOUDFLARE_ACCOUNT_ID
manifest=(python "$control/manifest.py")
log() {
  local check="$1"
  shift
  "$@" 2>&1 | tee "$out/evidence/$check.log"
}
"${manifest[@]}" prepare "$sha" "${expected[@]}"
rm -rf -- dist .next .wrangler
log install pnpm install --frozen-lockfile
log typecheck pnpm run check
log node-tests pnpm test
log python-tests python -m unittest discover -s tests -p 'test_*.py' -v
pnpm run check:private
"${manifest[@]}" stamp "$sha" --workflow-sha "$workflow_sha" "${expected[@]}"
trap 'rm -f public/student-version.json' EXIT
log build pnpm run build
rm public/student-version.json
trap - EXIT
pnpm run check:private --built
log dry-run pnpm exec wrangler deploy --dry-run --config dist/server/wrangler.json
log smoke node "$control/smoke.cjs"
"${manifest[@]}" seal "$sha" --workflow-sha "$workflow_sha" "${expected[@]}" \
  --manifest "$out/release-manifest.json" --evidence "$out/evidence"
"${manifest[@]}" inputs "$sha" > "$out/release-inputs.json"
tar -czf "$out/student-dist.tar.gz" dist
(cd "$out" && sha256sum student-dist.tar.gz > student-dist.sha256)
