# /api/analyze — system + user prompts

**Owner:** Role B
**Model:** `gpt-5.5` via AI SDK 5 `generateObject`
**Output language:** ENGLISH in every text field, including `_fr`-suffixed names (legacy schema, content language decoupled).
**Goal:** make this route the **single source of truth** for everything downstream (clarify, plan, video generation). Output must be specific, structured, and verifiable from the photo.

## 4-phase prompt (canonical — embedded as a constant in `app/api/analyze/route.ts`)

The model reasons through 4 phases silently and emits only the final JSON.

1. **VISUAL CATALOG.** Read every visible label, model code, brand logo, marking, number, color, material, wear pattern — even when small, blurry, rotated, or in non-Latin script. This is the grounding step.
2. **STRUCTURED PRODUCT IDENTIFICATION.** Emit the `object` field as a SINGLE compact string with " ; "-separated slots:
   ```
   Brand: <X> ; Model line: <X> ; Model code or variant: <X> ; Generation/Year: <X> ; Color/Finish: <X> ; Material: <X> ; Visible markings: <every label/code observed> ; Distinguishing features: <2–5 disambiguating observations>
   ```
   Omit a slot only when truly unknowable. When the model could be one of N candidates, name them all in "Model code or variant" rather than guess.
3. **STRUCTURED PROBLEM LOCATION.** Emit `problem_visual` as a SINGLE string with slots:
   ```
   Defect: <X> ; located at: <precise sub-component / position> ; severity: <minor|moderate|severe> ; visible signs: <observed symptoms>
   ```
4. **SPARE-PARTS UNCERTAINTIES.** Up to 3 entries. For each:
   - `field` is a snake_case key (downstream lookup).
   - `question_fr` MUST follow the format: `"<short direct English question> (— used to <one-line purpose>)"`. The purpose clause is mandatory; it is what clarify will polish and what the UI can show as helper text.
   - `options`: include 1–3 strings (≤3 words each) only when ≤3 candidates are realistically enumerable. Otherwise omit — the UI renders a free-text input.

## Useful uncertainty fields (non-exhaustive, fit to the object)

`exact_model_number`, `brand_model`, `variant_or_generation`, `purchase_year`, `production_year`, `region_or_market`, `tire_size_etrto`, `wheel_diameter`, `valve_type`, `trap_diameter_mm`, `hose_diameter_mm`, `thread_type`, `battery_capacity_mah`, `voltage`, `power_rating_watts`, `storage_capacity`, `color_or_finish`, `visible_serial_number`, `label_code`.

## User prompt template

```
User's voice description (may be in French): "{transcript_fr}"   (or "No voice description provided.")

Analyze the photo per the 3-phase system instructions. Read every visible
label and marking, identify the object as precisely as possible for
spare-parts procurement, and list only the uncertainties that genuinely
block ordering the right part. Return AnalyzeResult JSON with all text
content in English.
```

## Why the slot-based strings

`AnalyzeResult` fields are plain strings (the schema is frozen). To carry the rich downstream-relevant info without breaking the contract, we serialize it as " ; "-separated slotted strings. `/api/plan` reads them as-is and feeds them to the synthesis step verbatim; `/api/clarify` reads the same strings to infer purpose clauses. No parsing logic is required — the LLM understands the structure natively.

## Notes for Role B

- The 4-phase reasoning costs ~2–3s extra latency vs a flat prompt. Worth it for the precision gain.
- The purpose clause `(— used to ...)` is the key handoff to clarify: it tells the user (and the next LLM call) why the answer matters.
- The slotted strings make answers from `/api/clarify` slot-naturally into `/api/plan` queries (the plan route builds search queries that include the structured object string).
