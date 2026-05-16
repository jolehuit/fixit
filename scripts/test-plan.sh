#!/usr/bin/env bash
# Chain test for the Role B pipeline: /api/analyze → /api/plan.
#
# Usage:
#   ./scripts/test-plan.sh <demo-slug>            # uses public/demos/<slug>/input.png
#   ./scripts/test-plan.sh <path/to/photo.png>    # arbitrary local file
#
# Prereqs:
#   - pnpm dev running on http://localhost:3000
#   - OPENAI_API_KEY + TAVILY_API_KEY set in .env.local

set -euo pipefail

ARG="${1:-}"
HOST="${FIXIT_HOST:-http://localhost:3000}"

if [[ -z "$ARG" ]]; then
  echo "usage: $0 <demo-slug | path-to-image>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ANALYZE_OUT="$(mktemp -t fixit-analyze.XXXXXX.json)"
PLAN_REQ="$(mktemp -t fixit-plan.XXXXXX.json)"
PLAN_OUT="$(mktemp -t fixit-plan-out.XXXXXX.json)"
trap 'rm -f "$ANALYZE_OUT" "$PLAN_REQ" "$PLAN_OUT"' EXIT

echo "── Step 1: /api/analyze ─────────────────────────────────────" >&2
"$SCRIPT_DIR/test-analyze.sh" "$ARG" > "$ANALYZE_OUT"
jq . "$ANALYZE_OUT" >&2

if ! jq -e '.object and .category and (.uncertainties | type == "array")' "$ANALYZE_OUT" >/dev/null; then
  echo "→ analyze did not return a valid AnalyzeResult, aborting." >&2
  exit 1
fi

echo "" >&2
echo "── Step 2: /api/plan (this can take 6–12s) ──────────────────" >&2
jq -n --slurpfile a "$ANALYZE_OUT" '{analyze: $a[0]}' > "$PLAN_REQ"

curl -sS -X POST "$HOST/api/plan" \
  -H 'content-type: application/json' \
  --data-binary "@$PLAN_REQ" \
  > "$PLAN_OUT"

jq . "$PLAN_OUT"

# Contract check: every step must have non-empty values for the 4 generative
# fields. If any of them are blank, Role C will produce garbage downstream.
echo "" >&2
echo "── Contract check: generative fields per step ───────────────" >&2
jq -e '
  .steps and (.steps | type == "array") and (.steps | length >= 2) and
  ([.steps[] | select(
    (.visual_prompt_start | type != "string" or length == 0) or
    (.visual_prompt_end   | type != "string" or length == 0) or
    (.motion_prompt       | type != "string" or length == 0) or
    (.narration_fr        | type != "string" or length == 0)
  )] | length == 0)
' "$PLAN_OUT" >/dev/null && \
  echo "✓ all 4 generative fields populated on every step" >&2 || \
  { echo "✗ at least one step is missing a generative field" >&2; exit 1; }
