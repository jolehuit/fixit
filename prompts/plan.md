# /api/plan — Tavily search/extract + GPT-5.5 synthesis

**Owner:** Role B
**Strategy (decided iteration 3):** Tavily `/search` + `/extract` (synchronous) → single GPT-5.5 `generateObject` pass that produces a fully-populated `RepairPlan`.
**Why not `/research`:** the `@tavily/core` client's `research()` is async (returns a `requestId`, requires polling `getResearch` until status="completed"). Adds latency and polling complexity. We get equivalent grounding from `/search` + `/extract` with a single GPT-5.5 synthesis pass.

**Output language:** ENGLISH content in every field, including the legacy `_fr`-suffixed keys (`title_fr`, `description_fr`, `narration_fr`, `problem_summary_fr`). The schema in `lib/types.ts` is frozen — content language is decoupled from field name.

## Step 1 — Tavily search query

```
How to repair: {analyze.problem_visual} on {analyze.object}.
Context from user clarification: {JSON.stringify(answers)}.   (only if answers present)
```

Options:
- `searchDepth: 'advanced'`
- `maxResults: 5`
- `includeDomains: EN_REPAIR_DOMAINS` (local const — does NOT touch `lib/tavily.ts` `FR_REPAIR_DOMAINS`)
- `includeRawContent: 'text'`

`EN_REPAIR_DOMAINS` (local to the route):
`ifixit.com`, `instructables.com`, `familyhandyman.com`, `wikihow.com`, `thespruce.com`, `bicycling.com`.

## Step 2 — Tavily extract

Take top-3 results by `score`, call `tavilyClient().extract(urls, { extractDepth: 'basic' })`. Concatenate `rawContent` into a single research context, truncated to 18 KB to keep the LLM prompt manageable.

Failure mode: any Tavily failure is non-fatal — we fall through with empty research context, the LLM falls back to general repair knowledge.

## Step 3 — GPT-5.5 synthesis (single `generateObject` call)

System prompt (canonical — embedded as a constant in `app/api/plan/route.ts`):

Defines, per step:
- `title_fr` ≤6 words EN
- `description_fr` 1–2 sentences EN
- `parts_needed`, `tools_needed`: short EN strings, empty arrays allowed
- `duration_seconds`: 30–600s integer
- `visual_prompt_start` / `visual_prompt_end`: ≤25 words EN scene descriptions (BEFORE / AFTER state), with object + hands + tools in frame
- `motion_prompt`: ≤1 sentence EN describing the delta (the action itself)
- `narration_fr`: 50–80 words EN, second-person ("you"), pace matches duration_seconds

Top-level: `problem_summary_fr` ≤15 words EN, `difficulty`, `total_duration_min`.

Output schema: `RepairPlan` (passed directly to `generateObject` as `schema:`; Zod v4 + AI SDK 5 enforce validity before the route returns).

## Notes for Role B

- The 4 generative fields (`visual_prompt_start`, `visual_prompt_end`, `motion_prompt`, `narration_fr`) are filled in the SAME LLM call as the factual fields. No second pass needed — saves ~3s latency.
- If the model returns <2 or >8 steps, Zod fails parsing → caller gets `plan_failed`. Re-roll by hitting the endpoint again; the prompt is already tight, but the model can drift.
- Latency target: ~6–12s end-to-end (search 1–2s, extract 2–4s, GPT-5.5 3–6s). On Vercel Pro the route runs under the default 300s limit without extra `vercel.json` config.
- For TTS downstream: `narration_fr` content is English. Role C will swap `GRADIUM_TTS_VOICE_ID` to an EN voice (their config change, out of Role B scope).
