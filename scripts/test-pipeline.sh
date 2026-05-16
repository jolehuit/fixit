#!/usr/bin/env bash
# End-to-end test of Role C's pipeline, scoped strictly to the 4 generation routes.
#
# Flow: render-keyframe (start) -> render-keyframe (end) -> animate-step -> narrate -> stitch
#
# Prereqs:
#   - pnpm dev running on http://localhost:3000
#   - .env.local with FAL_KEY (with credit), GRADIUM_API_KEY, BLOB_READ_WRITE_TOKEN
#   - jq installed (brew install jq)
#
# Override defaults via env:
#   BASE=http://other-host:3000 ./scripts/test-pipeline.sh
#   REF=https://my.com/photo.png ./scripts/test-pipeline.sh
#   TXT="Mon texte narration"   PROMPT_START="..."   PROMPT_END="..."   MOTION="..."

set -euo pipefail

BASE=${BASE:-http://localhost:3000}
REF=${REF:-}
PROMPT_START=${PROMPT_START:-"Bike rear wheel still mounted on the frame, wrench approaching the axle"}
PROMPT_END=${PROMPT_END:-"Bike rear wheel fully removed from the frame, lying on the ground next to it"}
MOTION=${MOTION:-"Hands unscrew the axle bolt and lift the wheel out of the frame"}
TXT=${TXT:-"Start by opening the rear brake and unscrewing the axle with a 15mm wrench. Pull the wheel out of the frame."}
SUB=${SUB:-"Open the rear brake. Unscrew the axle with a 15mm wrench."}

command -v jq >/dev/null || { echo "jq required: brew install jq"; exit 1; }

if [[ -z "$REF" ]]; then
  cat >&2 <<'EOF'
REF (reference image URL) is required. fal needs a publicly reachable URL —
localhost won't work.

Quick path: upload a local photo to fal's CDN and capture its URL:
  REF=$(node --env-file=.env.local scripts/upload-image.mjs ./public/demos/flat-tire/input.png)
  ./scripts/test-pipeline.sh

Or pass any public URL directly:
  REF="https://example.com/bike.jpg" ./scripts/test-pipeline.sh
EOF
  exit 1
fi

post() {
  local route=$1
  local body=$2
  local response status payload
  response=$(curl -sS -w '\nHTTP_STATUS:%{http_code}' -X POST "$BASE/api/$route" \
    -H 'content-type: application/json' \
    -d "$body")
  status=${response##*HTTP_STATUS:}
  payload=${response%$'\n'HTTP_STATUS:*}
  if [[ "$status" != "200" ]]; then
    echo "FAIL: /api/$route -> HTTP $status" >&2
    echo "$payload" | jq . >&2 2>/dev/null || echo "$payload" >&2
    exit 1
  fi
  echo "$payload"
}

echo "[1/5] render-keyframe (start)"
START=$(post render-keyframe "{
  \"step_number\": 1,
  \"kind\": \"start\",
  \"reference_url\": \"$REF\",
  \"prompt\": \"$PROMPT_START\",
  \"quality\": \"medium\",
  \"image_size\": \"landscape_16_9\"
}" | jq -r .url)
echo "      $START"

echo "[2/5] render-keyframe (end, referencing start)"
END_KF=$(post render-keyframe "{
  \"step_number\": 1,
  \"kind\": \"end\",
  \"reference_url\": \"$START\",
  \"prompt\": \"$PROMPT_END\",
  \"quality\": \"medium\",
  \"image_size\": \"landscape_16_9\"
}" | jq -r .url)
echo "      $END_KF"

echo "[3/5] animate-step (Seedance 2.0 fast, ~30-60s)"
VIDEO=$(post animate-step "{
  \"step_number\": 1,
  \"start_frame_url\": \"$START\",
  \"end_frame_url\": \"$END_KF\",
  \"motion_prompt\": \"$MOTION\",
  \"duration_seconds\": 5,
  \"resolution\": \"720p\"
}" | jq -r .url)
echo "      $VIDEO"

echo "[4/5] narrate (Gradium TTS + Vercel Blob)"
AUDIO=$(post narrate "{
  \"step_number\": 1,
  \"text_fr\": \"$TXT\"
}" | jq -r .url)
echo "      $AUDIO"

echo "[5/5] stitch (ffmpeg concat + burn FR subs + Vercel Blob)"
FINAL=$(post stitch "{
  \"clips\": [{
    \"step_number\": 1,
    \"video_url\": \"$VIDEO\",
    \"audio_url\": \"$AUDIO\",
    \"subtitle_fr\": \"$SUB\"
  }]
}" | jq -r .url)

echo
echo "OK. Final video: $FINAL"

case "$(uname)" in
  Darwin) open "$FINAL" ;;
  Linux)  xdg-open "$FINAL" 2>/dev/null || true ;;
esac
