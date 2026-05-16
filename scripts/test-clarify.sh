#!/usr/bin/env bash
# Chain test for the Role B pipeline: /api/analyze → /api/clarify.
#
# Usage:
#   ./scripts/test-clarify.sh <demo-slug>            # uses public/demos/<slug>/input.png
#   ./scripts/test-clarify.sh <path/to/photo.png>    # arbitrary local file
#
# Prereqs:
#   - pnpm dev running on http://localhost:3000
#   - OPENAI_API_KEY set in .env.local
#   - jq + base64 in PATH (macOS: preinstalled)

set -euo pipefail

ARG="${1:-}"
HOST="${FIXIT_HOST:-http://localhost:3000}"

if [[ -z "$ARG" ]]; then
  echo "usage: $0 <demo-slug | path-to-image>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ANALYZE_OUT="$(mktemp -t fixit-analyze.XXXXXX.json)"
CLARIFY_REQ="$(mktemp -t fixit-clarify.XXXXXX.json)"
trap 'rm -f "$ANALYZE_OUT" "$CLARIFY_REQ"' EXIT

echo "── Step 1: /api/analyze ─────────────────────────────────────" >&2
"$SCRIPT_DIR/test-analyze.sh" "$ARG" > "$ANALYZE_OUT"
jq . "$ANALYZE_OUT" >&2

# If analyze failed (non-AnalyzeResult shape), bail out.
if ! jq -e '.object and .category and (.uncertainties | type == "array")' "$ANALYZE_OUT" >/dev/null; then
  echo "→ analyze did not return a valid AnalyzeResult, aborting clarify step." >&2
  exit 1
fi

echo "" >&2
echo "── Step 2: /api/clarify (mode A — options) ──────────────────" >&2
jq -n --slurpfile a "$ANALYZE_OUT" '{analyze: $a[0]}' > "$CLARIFY_REQ"

curl -sS -X POST "$HOST/api/clarify" \
  -H 'content-type: application/json' \
  --data-binary "@$CLARIFY_REQ" \
  | jq .
