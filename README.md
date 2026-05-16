# Fixit — boilerplate

Photo + voix → vidéo de réparation pas-à-pas en 90 secondes.
Hackathon AI Paris · 4 devs · 36h.

This repo is **the boilerplate** that section 11 of `PRD-EN.md` calls
out as pre-hackathon groundwork. Every role can start coding their slice
from minute one against typed mocks; flipping a stub to its real
implementation is a one-file change.

---

## Getting started

```bash
pnpm install
cp .env.example .env.local        # fill in your keys
pnpm dev                          # http://localhost:3000
```

Useful scripts:

```bash
pnpm typecheck    # tsc --noEmit
pnpm check        # biome (lint + format, writes fixes)
pnpm build        # next build
```

### Required env vars

See `.env.example`. Every key is read through `lib/env.ts` — never use
`process.env` directly outside that file.

| Var                    | Used by                  |
| ---------------------- | ------------------------ |
| `OPENAI_API_KEY`       | `/api/analyze`, `/api/clarify`, `/api/plan` (Role B) |
| `FAL_KEY`              | `/api/render-keyframe`, `/api/animate-step` (Role C) |
| `TAVILY_API_KEY`       | `/api/plan` (Role B) |
| `GRADIUM_API_KEY`      | `/api/narrate` + STT WebSocket (Role A) |
| `BLOB_READ_WRITE_TOKEN`| `/api/narrate`, `/api/stitch` (Role C) |

---

## Architecture map

```
app/
  page.tsx                   Landing + 3 demo cards + live entry
  job/[id]/page.tsx          TerminalStream + (eventual) VideoPlayer
  live/page.tsx              Free-input flow (PhotoUpload + VoiceRecorder)
  api/
    analyze/route.ts         Role B
    clarify/route.ts         Role B
    plan/route.ts            Role B
    render-keyframe/route.ts Role C
    animate-step/route.ts    Role C
    narrate/route.ts         Role C
    stitch/route.ts          Role C
    run/route.ts             Role D (orchestrator)
    stream/[jobId]/route.ts  Role D (SSE)

components/                  Role A
  DemoCard, PhotoUpload, VoiceRecorder, ClarificationUI,
  TerminalStream, VideoPlayer

lib/
  types.ts          *** SHARED CONTRACT — coordinate before edits ***
  env.ts            Centralized env access
  openai.ts         AI SDK 5 + @ai-sdk/openai provider
  fal.ts            @fal-ai/client wrapper + endpoint IDs
  tavily.ts         @tavily/core client + FR repair domain list
  gradium.ts        TTS REST helper + STT WS URL
  blob.ts           @vercel/blob upload helper
  sse.ts            StreamEvent → SSE bytes
  jobs.ts           In-memory job channel (swap for Redis if needed)
  mocks.ts          Mock factories used by route stubs
  demos/            Per-demo hand-tuned SSE scripts (Role D)

prompts/            First-draft system/user prompts (Role B)

public/demos/       Per-demo input.png, transcription.txt, output.mp4
```

---

## Role checklist (cf. PRD §11)

> Everything below is implemented as a typed STUB. Each file says
> `TODO(Role X)` next to what needs to change.

### Role A — Frontend & UX

- [ ] `components/DemoCard.tsx` — make the click animation feel snappy
- [ ] `components/PhotoUpload.tsx` — wire to Vercel Blob (client uploads)
- [ ] `components/VoiceRecorder.tsx` — connect to Gradium STT WebSocket
- [ ] `components/ClarificationUI.tsx` — polish; add optional image_url per option
- [ ] `components/TerminalStream.tsx` — typewriter pacing + transient line collapsing + running timer (this is the wow element, treat it like cinematic)
- [ ] `components/VideoPlayer.tsx` — replay button + share QR
- [ ] `app/page.tsx`, `app/live/page.tsx`, `app/job/[id]/page.tsx` — mobile responsiveness pass

### Role B — Understanding pipeline

- [ ] `app/api/analyze/route.ts` — wire GPT-5.5 vision via `lib/openai.ts`
- [ ] `app/api/clarify/route.ts` — visual options generation
- [ ] `app/api/plan/route.ts` — Tavily `/research` + Zod `outputSchema`, fallback to `/search` + `/extract` + GPT-5.5
- [ ] Iterate `prompts/*.md` until the 3 demo photos produce sensible `RepairPlan` JSON
- [ ] Hand off polished plans for the 3 demos as JSON for Role D's cache

### Role C — Generation pipeline

- [ ] `app/api/render-keyframe/route.ts` — `fal.subscribe(FAL_IMAGE_EDIT_ENDPOINT, …)`, retry + quality fallback
- [ ] `app/api/animate-step/route.ts` — `fal.subscribe(FAL_VIDEO_I2V_ENDPOINT, …)` with start+end frames
- [ ] `app/api/narrate/route.ts` — `synthesize()` → `upload()` (Gradium + Blob)
- [ ] `app/api/stitch/route.ts` — `ffmpeg-static` + `child_process.spawn`, burn-in FR subs, upload to Blob
- [ ] Verify `vercel.json` memory/maxDuration holds under real load

### Role D — Integration & demo experience

- [ ] `app/api/run/route.ts` — implement the live-mode orchestrator (see TODO block)
- [ ] `lib/demos/*.ts` — hand-tune each scripted SSE stream. Treat it like trailer editing.
- [ ] Add perceptual-hash cache router for free-input photos that happen to match a cached demo
- [ ] Generate the QR code pointing to the prod URL
- [ ] Maintain Vercel deployment, env vars, logs throughout the 36h

---

## Contracts — don't break these

Every cross-role interface lives in `lib/types.ts`:

- `AnalyzeRequest` / `AnalyzeResult` — Role A ↔ Role B
- `PlanRequest` / `RepairPlan` — Role B ↔ Role C ↔ Role D
- `RenderKeyframeRequest` / `Keyframe` — Role D → Role C
- `AnimateStepRequest` / `AnimatedClip` — Role D → Role C
- `NarrateRequest` / `NarrationAudio` — Role D → Role C
- `StitchRequest` / `FinalVideo` — Role D → Role C
- `RunRequest` / `RunResponse` — Role A → Role D
- `StreamEvent` — Role D → Role A (over SSE)

**Adding fields is safe. Renaming or removing fields is not — coordinate first.**

---

## SSE channel implementation

`lib/jobs.ts` keeps an in-memory map keyed by `jobId`. Works on Vercel
Fluid Compute because invocations on the same instance share state.
If the demo URL gets cold-started or instances multiply, swap the file's
internals for Upstash Redis pub/sub — the public API (`createJob`,
`emit`, `subscribe`, `closeJob`) is small and intentionally Redis-shaped.

---

## Friday-evening de-risk (PRD §9)

1. GPT Image 2 quality + latency on bike-tire reference photo
2. Seedance 2.0 start+end on two real keyframes
3. Tavily `/research` reliability on FR queries
4. Real photo shoot for the 3 demos
5. Push final contracts to `main`

---

## Sources verified for this boilerplate

- Next.js 16.2.2 — App Router, `outputFileTracingIncludes` for ffmpeg
  (ctx7: `/vercel/next.js/v16.2.2`)
- Tailwind v4 — `@tailwindcss/postcss` plugin + `@import "tailwindcss"`
  (ctx7: `/tailwindlabs/tailwindcss.com`)
- AI SDK 5 — `ai@^5` + `@ai-sdk/openai@^2`, `generateObject` w/ Zod
  (ctx7: `/websites/ai-sdk_dev`)
- Zod 4 — `discriminatedUnion`, `z.infer` (ctx7: `/colinhacks/zod/v4.0.1`)
- `@fal-ai/client` — `fal.config` + `fal.subscribe` (ctx7: `/fal-ai/fal-js`)
- `@vercel/blob` — `put({ access: 'public', multipart })` (ctx7: `/vercel/storage`)
- `@tavily/core` — `tvly.research` + `outputSchema` (ctx7: `/tavily-ai/tavily-js`)
- Gradium TTS REST — `POST /api/post/speech/tts` + `x-api-key` (Exa: docs.gradium.ai)
- `ffmpeg-static` on Fluid — `vercel-labs/ffmpeg-on-vercel` pattern
- Biome 2.2 — `biome.json` with formatter + linter (ctx7: `/biomejs/biome`)
