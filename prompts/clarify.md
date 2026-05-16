# /api/clarify — system + user prompts

**Owner:** Role B
**Model:** `gpt-5.5` text-only (no vision; the slotted strings from `/api/analyze` carry all needed context).
**Output language:** ENGLISH in `_fr` fields (legacy naming; content decoupled).

## Purpose of this route

`/api/analyze` produces uncertainties that genuinely block ordering the correct spare parts. `/api/clarify` polishes those uncertainties into **UI-ready** form:

- A short, direct user-facing question.
- A purpose clause that explains, in one line, **what the answer unlocks downstream** (so the UI can show "why we ask" inline and so the user knows their input is meaningful).
- Either ≤3 enumerable options (the UI renders buttons) **or** no options (the UI renders a free-text input).

Mode B: if the request already carries `answers`, the route just returns `{ resolved: true }` — no LLM call. The orchestrator (Role D) feeds those answers into `/api/plan`.

## Short-circuit

If `analyze.uncertainties.length === 0`, the route returns `{ uncertainties: [] }` without calling the model. Saves a round-trip when the photo + transcript already determine the part.

## System prompt (canonical — embedded as a constant in `app/api/clarify/route.ts`)

Enforces per uncertainty:
- `field` UNCHANGED (downstream lookup key).
- `question_fr` formatted strictly as `"<short direct English question> (— used to <one-line purpose>)"`. If a purpose clause exists, refine it; if missing, infer it from the field name and the object/problem context.
- `options` only when ≤3 candidates are realistically enumerable from the input context.
- Tone: direct, no politeness; ≤8 words before the purpose clause; answerable in <5 seconds by a non-expert.
- Same number of uncertainties as input — never add, never drop. May reorder so the most-blocking question is first.

## User prompt template

```
Object: {analyze.object}                          # slotted string from analyze
Visible problem: {analyze.problem_visual}         # slotted string from analyze
Input uncertainties (JSON): {analyze.uncertainties}

Polish each uncertainty per the system rules and return ClarifyOptions JSON.
```

## Notes for Role B

- Clarify is also where ambiguity in the analyze output is sharpened. If analyze emitted a vague "(— used to identify the part)" purpose, clarify will rewrite it specifically: e.g. "(— used to pick the correct iPhone XR vs 11 display assembly P/N)".
- The route does not validate against analyze.uncertainties strictly — Zod only checks shape. Drift is caught by the contract test we run via `scripts/test-clarify.sh`.
- Field name `question_fr` stores English content. Same legacy-naming convention as the rest of the project.
