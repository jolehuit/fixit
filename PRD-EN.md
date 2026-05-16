# PRD — Project Fixit (codename)

> Photo + voice → step-by-step repair video in 90 seconds
> Tech: Europe Paris AI Hackathon — 4 devs, 36h

---

## 1. Problem

Most people pay a professional for repairs they could do themselves. Not out of incapacity — out of informational friction: YouTube is saturated with tutorials for the wrong model, paper manuals are unreadable, ChatGPT describes in text but shows nothing. The real pain is: *"I have THIS problem in front of me right now, show me THE solution."*

## 2. Solution

The user photographs a broken object, describes the problem out loud, answers 0–2 clarification questions from the AI, and receives a personalized step-by-step video with French narration and subtitles in 60–90 seconds.

Three pre-generated examples are accessible from the landing page (flat bike tire, cracked phone screen, dripping faucet) — that's what the jury sees by default. A 4th "free input" path runs the real pipeline live if requested.

## 3. Hackathon objectives

| Objective | Measurement |
|---|---|
| Win fal side challenge | Demo that uses GPT Image 2 + Seedance 2.0 in a non-cosmetic way |
| Qualify for finalist stage | Visible wow effect within 90s, jury identifies with the pain |
| Use 4/5 partners | OpenAI (vision + reasoning + image gen), fal (image + video routing), Gradium (TTS + STT), Tavily (research). SLNG as backup. |

Non-objectives: B2B market, monetization, analytics dashboard, multi-language, native mobile app.

## 4. Demo flow (locked, 1 path)

```
[Minimalist landing]
  ↓
  Three demo cards: 🚲 Flat tire | 📱 Cracked screen | 🚰 Dripping faucet
  + small print: "Try with your own situation →"
  ↓
[Jury clicks a demo]
  ↓
  Photo displayed + simulated audio transcription of user's problem
  Button: "Start diagnosis"
  ↓
[60–90s loader with SSE terminal streaming]
  - ✓ Object identified
  - ✓ Searching repair procedures via Tavily…
  - ✓ Plan generated (5 steps)
  - ⠋ Generating keyframes (3/10)…
  - ⠋ Animating step 2/5…
  - ⠋ Adding French narration…
  - ✓ Stitching final video…
  ↓
[Video autoplay with audio + French subtitles]
```

The 4th path "free input" runs the real pipeline. Disclosed on the landing: *"The 3 examples are pre-generated. The 'Try with your own situation' button uses the live pipeline."* — covers transparency required by the team note.

## 5. Technical architecture

### 5.1 Pipeline

```
[Photo input]
    │
    ├─ GPT-5.5 Vision (Responses API, detail:auto)
    │   ↳ Object identification + visual diagnosis + uncertainty flags
    │
[User voice via Gradium STT WebSocket]
    │
    ├─ GPT-5.5 reasoning effort:medium
    │   ↳ Decides if clarification needed
    │   ↳ If yes: generates 1–3 visual options via vision (e.g. 3 iPhone models)
    │
[User answers: button click or free voice]
    │
[Tavily /research with output_schema Zod]
    ↳ Returns directly: { steps: [{title, description, parts, tools, duration_min}, ...] }
    │
[For each step, in parallel (Promise.all)]
    │
    ├─ fal/openai/gpt-image-2/edit (start frame)
    │   ↳ image: original photo + (previous keyframe ref if step > 1)
    │   ↳ prompt: "Show the bike with the wheel removed, hands holding tire lever"
    │   ↳ quality: "high", image_size: "landscape_16_9"
    │
    ├─ fal/openai/gpt-image-2/edit (end frame)
    │   ↳ image: this step's start_frame
    │   ↳ prompt: "Show the same scene, inner tube fully removed from rim"
    │
[For each pair (start, end), in parallel]
    │
    ├─ fal/bytedance/seedance-2.0/fast/image-to-video
    │   ↳ image_url: start_frame, end_image_url: end_frame
    │   ↳ duration: "5", resolution: "720p", generate_audio: true
    │
[For each step]
    │
    ├─ GPT-5.5 → French narration script per step (50–80 words)
    │
    ├─ Gradium TTS REST POST
    │   ↳ voice_id: French flagship voice, output: WAV 48kHz mono
    │
[ffmpeg-static on Vercel Fluid]
    ↳ Concat clips + overlay narration + burned-in subtitles
    │
[Final video → Vercel Blob]
    ↳ URL returned to front via final SSE event
```

### 5.2 Confirmed stack (May 2026 versions)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16.2 + React 19 + Tailwind v4 | Cache Components, async params, native AI SDK |
| Hosting | Vercel Pro, Fluid Compute (default since April 2025) | Native ffmpeg, 800s timeout Pro, 2vCPU/4GB Performance |
| AI orchestration | AI SDK 5 (`ai` npm) + `@ai-sdk/openai` | `streamObject` + Zod = streamed structured parsing |
| LLM | `gpt-5.5` via Responses API | Native vision, configurable reasoning, `detail:auto`=original |
| Image gen | `@fal-ai/client` → `openai/gpt-image-2/edit` | #1 Arena leaderboard (1512 vs 1270 NB2), best reference-image fidelity, mask editing, ~22s/img but OK in parallel |
| Video gen | `@fal-ai/client` → `bytedance/seedance-2.0/fast/image-to-video` | Native start+end frame, audio included, /fast = reduced latency |
| Voice TTS | Gradium REST `POST /api/speech/tts` | Native FR, 237 voices, voice cloning |
| Voice STT | Gradium WebSocket `wss://api.gradium.ai/api/speech/asr` | Semantic VAD, flush, low latency |
| Research | `tavily` npm → `/research` with `output_schema` | Returns structured JSON directly |
| ffmpeg | `ffmpeg-static` npm + `child_process.spawn` | Officially supported on Vercel Fluid (vercel-labs/ffmpeg-on-vercel) |
| Storage | `@vercel/blob` | Integrated, no external service |
| Stream events | Custom SSE via `ReadableStream` | Typed events (step_complete, video_ready) — not LLM text |
| Validation | `zod` v4 | Shared front/back schemas |
| Package mgr | `pnpm` | Speed, monorepo if needed |
| Lint | `biome` | Faster than eslint+prettier in dev |

### 5.3 API routes (generic naming)

```
POST /api/analyze         → vision + identification {object, problem, uncertainties}
POST /api/clarify         → if uncertainties: generates clarification options
POST /api/plan            → Tavily research → structured steps (Zod schema)
POST /api/render-keyframe → openai/gpt-image-2/edit via fal
POST /api/animate-step    → seedance-2.0/fast/image-to-video
POST /api/narrate         → Gradium TTS
POST /api/stitch          → ffmpeg concat + audio + subs → Vercel Blob URL

POST /api/run             → orchestrates the full pipeline for a job
GET  /api/stream/:jobId   → SSE: streams events to the frontend
```

Generic route naming rationale: if we switch GPT Image 2 → Flux 2 Friday evening, or Seedance → Kling 3, we change 1 file. No model name leaks into the routes.

### 5.4 Shared Zod schemas (to be written first)

```ts
// src/lib/types.ts
export const AnalyzeResult = z.object({
  object: z.string(),
  category: z.enum(['vehicle', 'electronics', 'plumbing', 'furniture', 'other']),
  problem_visual: z.string(),
  uncertainties: z.array(z.object({
    field: z.string(),
    question: z.string(),
    options: z.array(z.string()).max(3).optional(),
  })),
});

export const RepairStep = z.object({
  step_number: z.number(),
  title: z.string(),
  description: z.string(),
  parts_needed: z.array(z.string()),
  tools_needed: z.array(z.string()),
  duration_seconds: z.number(),
  visual_prompt_start: z.string(),  // for GPT Image 2 start keyframe
  visual_prompt_end: z.string(),    // for GPT Image 2 end keyframe
  motion_prompt: z.string(),        // for Seedance
  narration: z.string(),         // for Gradium TTS
});

export const RepairPlan = z.object({
  problem_summary: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  total_duration_min: z.number(),
  steps: z.array(RepairStep).min(2).max(8),
});

export const StreamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('analyze_done'), result: AnalyzeResult }),
  z.object({ type: z.literal('plan_done'), result: RepairPlan }),
  z.object({ type: z.literal('keyframe_done'), step: z.number(), kind: z.enum(['start','end']) }),
  z.object({ type: z.literal('animation_done'), step: z.number() }),
  z.object({ type: z.literal('narration_done'), step: z.number() }),
  z.object({ type: z.literal('stitch_done'), video_url: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
```

### 5.5 Critical Vercel config

```json
// vercel.json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "app/api/stitch/route.ts": { "memory": 3009, "maxDuration": 800 },
    "app/api/run/route.ts":    { "memory": 2048, "maxDuration": 800 },
    "app/api/animate-step/route.ts": { "maxDuration": 300 }
  }
}
```

```ts
// next.config.ts — declare ffmpeg-static as bundled binary
import type { NextConfig } from 'next'
const config: NextConfig = {
  outputFileTracingIncludes: {
    'app/api/stitch/route': ['./node_modules/ffmpeg-static/**'],
  },
}
export default config
```

## 6. Pre-generated demos (offline, before the hackathon)

| # | Use case | Photo input | Simulated audio | Target video duration |
|---|---|---|---|---|
| 1 | Flat bike tire | photo of own bike, rear wheel flat | "I got a flat on my way to work, I don't want to call a pro" | 60s, 5 steps |
| 2 | Cracked iPhone screen | photo iPhone 15 with cracked screen | "My screen is cracked, can I fix it myself?" | 45s, 3 steps (diagnosis + alternatives) |
| 3 | Dripping faucet | photo of kitchen faucet | "My faucet is leaking at the base, it's urgent" | 60s, 4 steps |

Each cached demo:
- 1 input photo PNG in `/public/demos/{slug}/input.png`
- 1 transcription as `.txt`
- 1 final video MP4 in `/public/demos/{slug}/output.mp4`
- 1 SSE stream script `/lib/demos/{slug}.ts` simulating the event sequence over 60–90s with realistic timing (step variability, simulated retries, etc.)

Cache hits via perceptual hash on the input photo. If match → server serves the scripted stream + cached video. Otherwise → real pipeline.

## 7. Technical risks and fallback plans

| Risk | Probability | Fallback |
|---|---|---|
| GPT Image 2 latency > 30s peak, breaks the 90s budget | Medium | Switch quality from `"high"` to `"medium"` (~halves latency), or fallback to Nano Banana 2 on fal (4–8s, lower quality but functional) |
| GPT Image 2 drifts from reference photo (rare) | Low | Re-prompt with explicit "match the exact bike in the reference image" + retry 1× |
| Seedance start+end doesn't produce credible motion on repair scenes | Medium | ffmpeg crossfade + Ken Burns, sacrifice video wow but keep concept |
| Tavily /research doesn't find the right procedure | Low | Fallback `/search` with `include_domains: ["ifixit.com", "decathlon.fr", "spareka.fr"]` then `/extract` on top result |
| Full pipeline > 90s in live | Medium-High | OK because main demo is pre-cached. Live = assumed bonus "60s to 3min" |
| ffmpeg crash on Vercel | Low | vercel-labs/ffmpeg-on-vercel repo works in production. Plan B: Shotstack API if it crashes pre-hackathon |
| Gradium latency > 5s on multi-step narration | Low | TTS REST in parallel with video generation, not in series |
| fal rate limit on burst GPT Image 2 parallel calls | Unknown | Test Friday evening with 10 parallel calls; if throttled, run 2 batches of 5 sequentially |

**Untested assumptions (to validate Friday evening)**:
- Actual visual quality of GPT Image 2 on repair scenes from a reference photo (public benchmarks show reference fidelity wins, but not tested on this specific vertical)
- Real parallel latency for 10 GPT Image 2 calls on fal — possible throttling
- Realism of Seedance motion between 2 mechanical step keyframes
- Tavily `/research` reliability on French queries for home repairs

## 8. Demo success metrics

| Metric | Target |
|---|---|
| Perceived loader duration | 60–90s (no more, no less) |
| Delay from click to first SSE event | < 500ms |
| Final video resolution | 720p minimum |
| Subtitle legibility | Tested on hackathon room display |
| Jury understanding in 5s | "Photo of problem → solution video" must be clear without explanation |

## 9. Friday evening de-risking protocol (3h max, full team)

1. GPT Image 2 (`openai/gpt-image-2/edit` via fal) — edit a flat-tire bike photo into 3 consecutive keyframes (steps 1, 2, 3). Verdict: reference photo well preserved? `quality:"high"` under 25s? Freeze style decision and quality tier.
2. Seedance start+end frame on 2 keyframes generated by GPT Image 2. Verdict: credible motion or fallback to Ken Burns.
3. Tavily `/research` in French on "réparer vélo crevé" and "remplacer joint robinet". Verdict: structured output sufficient or add a GPT-5.5 layer behind.
4. Prepare the 3 input photos for the cached demos (real objects at home).
5. Sync decisions + push final Zod contracts to main.

## 10. Jury pitch (60s)

> "Last year I paid €80 to a plumber to change a €3 washer. Not because I couldn't do it — because YouTube gave me 200 tutorials on the wrong faucet model, and I could never find one that matched MY problem.
>
> [jury clicks a cached demo OR photographs something broken in the room]
>
> Photo. Voice. If the AI is unsure about your model, it asks. Repair video in 90 seconds, French narration, subtitles.
>
> Market: per a 2024 OpinionWay study *(to re-verify)*, more than half of French people call a pro for DIY-able repairs. iFixit raised $30M on this pain, but their content stays static text.
>
> [show the stack while it runs]
>
> We use OpenAI for understanding (GPT-5.5 vision) and image generation (GPT Image 2), Tavily to fetch real procedures, fal to orchestrate GPT Image 2 + animate with Seedance 2.0, Gradium for French narration. All in one Next.js 16 monorepo, hosted on Vercel Fluid Compute, native ffmpeg server-side. 90 seconds from click to video."

---

## 11. Team distribution (4 roles, fully parallel from hour 1)

### Prerequisite: pre-hackathon boilerplate (done together, before day 1)

None of the 4 roles below can be the bottleneck for the others. That's only true if the following is **already done before the hackathon starts**, as shared groundwork:

- Monorepo initialized: Next.js 16.2 + Tailwind v4 + Biome + pnpm
- Vercel project linked, prod URL live, all API keys configured (OpenAI, fal, Tavily, Gradium, Vercel Blob)
- `vercel.json` (per-route memory + maxDuration) and `next.config.ts` (ffmpeg-static bundling) committed
- All Zod schemas frozen in `src/lib/types.ts`
- All 9 API routes stubbed: each route exists and returns mocked data conforming to its Zod schema, so any role can develop against a fake but typed backend from minute zero
- 3 demo input photos shot (real bike, real cracked phone, real faucet)
- First draft of system/user prompts for analyze, clarify, plan committed as markdown in `/prompts`
- Friday-evening de-risk run on GPT Image 2 + Seedance + Tavily, decisions logged

With this in place, every role below can begin implementing on minute one without waiting for anyone else.

### Role A — Frontend & UX

Owns everything rendered in the browser. Builds against the mocked API routes from hour one and switches to real responses as Roles B/C/D ship them.

- Build the minimalist landing page with hero copy, 3 demo cards, and the "Try with your own situation" button
- Build the photo upload component (mobile camera capture + desktop drop, single flow)
- Build the voice recording component connected to Gradium STT WebSocket
- Build the clarification UI: photo + question + 1–3 visual option buttons + free-text fallback
- Build the **TerminalStream** loader component: consumes the SSE stream, renders typewriter progress lines with variable timing, transient secondary lines, simulated retry recoveries, running timer. This is the central wow element.
- Build the final video player: autoplay, audio, French subtitles, replay button
- Ensure mobile responsiveness (jury opens the URL on their phone)
- Implement the 3 demo cards as static entry points that POST to `/api/run` with `{ demoId }` so Role D can route to cache

### Role B — Understanding pipeline

Owns the three routes that turn raw user input into a structured `RepairPlan`. Each route is independently testable via curl against the stubs, no dependency on other roles.

- Implement `/api/analyze`: GPT-5.5 Vision via Responses API → returns `AnalyzeResult` with object identification + uncertainty detection
- Implement `/api/clarify`: takes uncertainties, generates 1–3 visual options or a free-text fallback question
- Implement `/api/plan`: calls Tavily `/research` with `output_schema`, returns a fully-populated `RepairPlan` including `visual_prompt_start`, `visual_prompt_end`, `motion_prompt`, `narration` per step
- If Tavily `/research` underperforms on French queries, layer GPT-5.5 on top to restructure `/search` + `/extract` outputs
- Iterate prompts until the 3 demo input photos produce sensible `RepairPlan` JSON
- Hand off polished plans for the 3 demos as JSON files for the cache (consumed by Role D)

### Role C — Generation pipeline

Owns the four routes that turn a `RepairPlan` into a final MP4. Each route is independently testable; the per-step parallelization (`Promise.all`) is implemented inside Role D's orchestrator, not here.

- Implement `/api/render-keyframe`: wraps `openai/gpt-image-2/edit` via fal, accepts a step + reference images, returns keyframe URL with retry and quality-tier fallback (`high` → `medium`)
- Implement `/api/animate-step`: wraps `bytedance/seedance-2.0/fast/image-to-video` with start+end frames, returns clip URL, falls back to ffmpeg crossfade on Seedance failure
- Implement `/api/narrate`: Gradium TTS REST POST with French flagship voice, returns audio URL
- Implement `/api/stitch`: ffmpeg-static on Vercel Fluid, concatenates clips, overlays narration, burns French subtitles in, uploads to Vercel Blob, returns final video URL
- Verify the function config (`memory: 3009`, `maxDuration`) holds under real load
- Hand off the 3 final demo MP4s to Role D once the pipeline is end-to-end working (typically Saturday afternoon)

### Role D — Integration, demo experience, operations

Owns the integration layer **and** the final demo experience as a product. Not the lightest role: where Roles A/B/C build features, Role D builds the *show*. This is the person who holds the whole system in their head, hand-tunes the narrative of the loader, and keeps the demo alive in production.

**Integration plumbing**

- Implement `/api/run`: top-level orchestrator. Calls Role B's chain (analyze → clarify → plan), then fans out Role C's routes per step in parallel with `Promise.all`, emits typed SSE events at each milestone
- Implement `/api/stream/:jobId`: SSE endpoint streaming the `StreamEvent` discriminated union to the frontend. Choose state-sharing mechanism (Upstash Redis pub/sub or single-route SSE returning the orchestrator's stream directly)
- Implement graceful error handling at every junction: any partial failure produces a usable result or a clear failure event, never a hung loader

**Demo experience as product**

- Implement the cache router: perceptual hash on incoming photo, match against the 3 cached demos
- **Hand-tune the 3 scripted SSE streams.** This is creative narrative work: each event line, each pause, each simulated retry is chosen for pacing. The loader's rhythm is what makes the wow effect land. Treat each script like editing a trailer: write it, watch it play, rewrite. Variable inter-event delays, transient secondary lines (`→ uploading frame 3/8`, `→ token usage: 8421`), at least one simulated recovery (`⠋ Retry attempt 1/3 on fal endpoint…` then `✓ Recovered`), running timer at the bottom. Target 60–90s per script with believable jitter.
- Own the small-print transparency UI: "The 3 examples are pre-generated. Live pipeline runs on free input."
- Generate the QR code pointing to the prod URL for the jury

**Live-mode reliability (the 4th path)**

- Own the "Try with your own situation" path quality: it must always produce *something* useful even when GPT Image 2 throttles or Seedance fails mid-run
- Implement live ETA estimation visible on the loader ("estimated 47s remaining…")
- Implement on-the-fly fallback decisions: if GPT Image 2 quality:high exceeds 25s on the first keyframe, downshift the rest of the run to quality:medium and surface it as `info` event

**Operations during the hackathon**

- Maintain the Vercel deployment, env vars, function logs, Vercel Blob storage throughout the 36h
- Watch logs proactively: recognize when a provider starts throttling, alert the team *before* it visibly breaks
- Coordinate the integration tour Saturday afternoon (full team runs through each path on a real device)
- Coordinate the final rehearsal Sunday morning

### Cross-cutting work (claimed by whoever is unblocked)

These tasks don't sit cleanly in any role and are handled opportunistically:

- Pitch writing and rehearsal (5× before deadline)
- Identifying and approaching the fal-track jury members early
- Integration QA on real devices (jury phones, hackathon room screens)
- The 3 cached demo videos are produced *once the pipeline is end-to-end* (Saturday afternoon): Role B's plans + Role C's runs + Role D's cache wiring, polished collaboratively

### Why this split

Each role owns a **vertical functional area** (UI, understanding, generation, integration) that maps to a distinct skill profile (React + animation, prompt engineering, external API integration, system integration). No role owns "contracts" or "the brain" — those are pre-hackathon assets. The critical path during the 36h has no bottlenecks: every role can ship its first useful output independently of the others, and full integration only requires real endpoints to replace mocks one at a time.

---

## 12. Definition of "Done" for the hackathon

- [ ] Flat-tire demo playable from prod URL, click-to-video in ≤ 90s
- [ ] Cracked-screen and faucet demos same
- [ ] 4th "free input" path runs the real pipeline end-to-end on at least 1 random photo
- [ ] 60s pitch rehearsed 5× between team members
- [ ] Stable prod URL accessible from jury's phone (QR code prepared)
- [ ] Git branch `stable-v1` saved as fallback

---

## Annex A — Open questions

**Hackathon date**: not confirmed. Pioneer (Fastino) launched April 21, 2026 and is in the side challenges → edition is post-mid-May 2026. All delays above assume a weekend hackathon. To adjust.

**Pioneer Side Challenge**: not included in this PRD. The Pioneer (Fastino) side challenge requires adaptive inference, which doesn't naturally fit our use case. Primary target: **fal side + Open Innovation finalist stage**. If time permits, a Pioneer-bonus is possible (e.g. fine-tune a "is this repair safe to DIY?" classifier on user feedback) but stays secondary.

## Annex B — Estimated compute cost per live demo

| Component | Cost/demo |
|---|---|
| GPT-5.5 vision (2 calls) | ~$0.02 |
| Tavily /research | 2 credits ≈ $0.02 |
| GPT Image 2 × 10 keyframes (5 steps × 2), quality:high via fal | ~10 × $0.18 = $1.80 |
| Seedance 2.0 fast × 5 clips | ~5 × $0.15 = $0.75 |
| Gradium TTS × 5 narrations | ~$0.05 |
| Vercel compute (90s × 3GB) | ~$0.01 |
| **Total per live demo** | **~$2.65** |

If quality `"medium"` instead of `"high"`, image cost divides by ~4 → total ~$1.20. To tune based on fal/OpenAI credits available.
