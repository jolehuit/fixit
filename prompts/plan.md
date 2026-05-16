# /api/plan — two-stage Tavily research + GPT-5.5 synthesis

**Owner:** Role B
**Strategy (iteration 5):** two parallel Tavily search+extract pipelines feed a single GPT-5.5 `generateObject` synthesis call. The two stages target different signal types (model spec vs repair procedure) — combined they give the LLM much richer grounding than a single pass.

**Output language:** ENGLISH in every text field, including the legacy `_fr` keys (schema in `lib/types.ts` is frozen; content language is decoupled).

## Architecture

```
PlanRequest { analyze, answers? }
   │
   ├── Stage 1 (parallel) ─ MODEL IDENTIFICATION
   │       query: "Identify exact product model and compatible spare parts:
   │              {analyze.object}. User-confirmed specs: {answers}."
   │       domains: MODEL_ID_DOMAINS (ifixit, apple support, amazon,
   │                home depot, lowes, plumbingsupply, mcmaster,
   │                sheldonbrown, decathlon)
   │       → top-3 results by score → extract advanced
   │
   ├── Stage 2 (parallel) ─ REPAIR GUIDE
   │       query: "Step-by-step repair manual: {analyze.problem_visual}
   │              on {analyze.object}. Specifications confirmed: {answers}."
   │       domains: REPAIR_GUIDE_DOMAINS (ifixit, instructables,
   │                familyhandyman, wikihow, thespruce, bicycling,
   │                parktool, sheldonbrown)
   │       → top-3 results by score → extract advanced
   │
   ├── Merge: concat Stage 1 + Stage 2 blocks, dedupe by source URL,
   │   cap at 24 KB.
   │
   └── GPT-5.5 generateObject(schema = RepairPlan)
         system: synthesis rules (per-step + top-level fields, all EN)
         user: structured analyze strings + answers + merged research
       → RepairPlan.parse → 200 OK
```

## Why two stages (vs one)

- Stage 1 (model ID) gives the LLM spec-sheet / catalog content. This is where part numbers, dimensions, screw types, and compatibility ranges live.
- Stage 2 (repair guide) gives the LLM the actual procedure (iFixit teardowns, wikiHow walk-throughs).
- A single broad query mixes both signals and tends to miss either spec-only catalogs (which don't describe repair) or repair-only guides (which assume the model is known). Splitting the queries surfaces the right document type in each lane.
- Both Tavily calls run in `Promise.all` — no serial latency penalty.

## Domain lists (local to the route)

`lib/tavily.ts` exports `FR_REPAIR_DOMAINS` (FR sites) — left untouched, used by other roles. The plan route defines its OWN `MODEL_ID_DOMAINS` and `REPAIR_GUIDE_DOMAINS` arrays locally.

## Synthesis system prompt (canonical — embedded as a constant)

Required outputs per step:
- `title_fr` ≤6 words EN
- `description_fr` 1–2 sentences EN, naming the sub-component acted upon
- `parts_needed`, `tools_needed`: short EN strings; use specific P/Ns or dimensions when the research context provides them
- `duration_seconds`: integer 30–600
- `visual_prompt_start` / `visual_prompt_end`: ≤25 words EN; mention brand/model from input, hands, tools, sub-component
- `motion_prompt`: ≤1 EN sentence describing the start→end delta
- `narration_fr`: 50–80 words EN, second-person ("you"), pace matches `duration_seconds`. Use the research context's specificity (torques, screw types, washer orientation) wherever available.

Top-level: `problem_summary_fr` ≤15 words EN (restate the defect + location), `difficulty`, `total_duration_min`.

Grounding rules:
- Prefer the research context for procedure, parts, tools.
- Use confirmed model/dimensions explicitly in titles, narration, prompts.
- Don't invent torques, voltages, or part numbers not supported by context or general knowledge.
- Surface safety warnings from the research context inside `narration_fr` when relevant.

## Failure modes & fallbacks

- Either Tavily stage can fail (rate limit, no results) → its branch returns empty context. The other branch still feeds the LLM.
- Both stages can fail → the LLM produces a plan from `analyze` strings + general knowledge. The plan stays schema-valid; quality degrades gracefully.
- If GPT-5.5 emits <2 or >10 steps, Zod parsing fails → the route returns `plan_failed`. Re-roll; the prompt is tight but the model can drift.

## Latency budget

| Step | Time |
|---|---|
| Stage 1 search + extract | 3–5s |
| Stage 2 search + extract | 3–5s (parallel with Stage 1) |
| GPT-5.5 synthesis | 5–8s |
| **Total** | **8–13s** |

Well under Vercel Pro's 300s default for non-`stitch`/`run` routes.

## Notes for Role B

- Per-step `narration_fr` content is ENGLISH. Role C will swap `GRADIUM_TTS_VOICE_ID` to an English voice in their `.env` (1-line change, out of Role B scope).
- The synthesis prompt consumes the slotted analyze strings as-is — no parsing logic needed. The LLM understands the slot format natively.
- If a specific repair (e.g. iPhone) consistently produces overly generic plans, tighten the prompt by adding 1 worked example in the system message. We keep the prompt example-free for now to save tokens; revisit if quality drops.
