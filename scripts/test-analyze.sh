#!/usr/bin/env bash
# Test harness for POST /api/analyze (Role B).
#
# Usage:
#   ./scripts/test-analyze.sh <demo-slug>            # uses public/demos/<slug>/input.png
#   ./scripts/test-analyze.sh <path/to/photo.png>    # arbitrary local file
#
# Valid demo slugs: flat-tire | cracked-screen | dripping-faucet
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
  echo "  demo slugs: flat-tire | cracked-screen | dripping-faucet" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$ARG" ]]; then
  IMG_PATH="$ARG"
  TRANSCRIPT=""
else
  SLUG="$ARG"
  IMG_PATH="$REPO_ROOT/public/demos/$SLUG/input.png"
  TRANSCRIPT_PATH="$REPO_ROOT/public/demos/$SLUG/transcription.txt"
  if [[ ! -f "$IMG_PATH" ]]; then
    echo "error: missing $IMG_PATH" >&2
    echo "       shoot the demo photo first (see PRD §9) or pass a path directly." >&2
    exit 1
  fi
  TRANSCRIPT=""
  if [[ -f "$TRANSCRIPT_PATH" ]]; then
    TRANSCRIPT="$(tr -d '\n' < "$TRANSCRIPT_PATH")"
  fi
fi

EXT="${IMG_PATH##*.}"
case "$EXT" in
  png)  MIME="image/png" ;;
  jpg|jpeg) MIME="image/jpeg" ;;
  webp) MIME="image/webp" ;;
  *)    MIME="image/png" ;;
esac

TMP_PAYLOAD="$(mktemp -t fixit-analyze.XXXXXX.json)"
trap 'rm -f "$TMP_PAYLOAD"' EXIT

# Build the JSON via jq using stdin (--rawfile) to avoid argv length limits for
# large images (macOS argv ceiling ~256 KiB; a 2 MiB PNG → ~3 MiB base64).
{
  # base64-encode the image inline; macOS base64 wraps at 76 cols, strip newlines.
  base64 < "$IMG_PATH" | tr -d '\n' > "$TMP_PAYLOAD.b64"
} >&2

# Compose the data URL prefix + base64 body via jq, reading the b64 as a raw string.
jq -n --arg mime "$MIME" --rawfile b64 "$TMP_PAYLOAD.b64" --arg t "$TRANSCRIPT" \
  '{photo_url: ("data:" + $mime + ";base64," + $b64)}
   + (if $t == "" then {} else {transcript_fr: $t} end)' \
  > "$TMP_PAYLOAD"
rm -f "$TMP_PAYLOAD.b64"

echo "→ POST $HOST/api/analyze  (image: $IMG_PATH, transcript: ${TRANSCRIPT:-<none>})" >&2

curl -sS -X POST "$HOST/api/analyze" \
  -H 'content-type: application/json' \
  --data-binary "@$TMP_PAYLOAD" \
  | jq .
