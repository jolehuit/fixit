# /api/clarify — system + user prompts

**Owner:** Role B
**Model:** `gpt-5.5` text-only (no vision; analyze.problem_visual already carries the visual context)
**Output language:** ENGLISH content in all `_fr`-suffixed fields (legacy naming kept; content language decoupled).

## Mode A — generate options

Triggered when the request body has no `answers` (or empty `answers`). Polishes each uncertainty into a UI-ready question + options.

### Short-circuit

If `analyze.uncertainties.length === 0`, the route returns `{ uncertainties: [] }` without an LLM call.

### System prompt (canonical — embedded as a constant in `app/api/clarify/route.ts`)

```
You polish UI-ready clarification questions for an end user.

Input: an object identification, a visual problem description, and a
list of uncertainties detected by an upstream vision model.

For each uncertainty:
- Rewrite "question_fr" as a short, direct English question — no
  politeness, no "Could you please…". Examples: "Which model?",
  "Type of screw?".
- Provide 1 to 3 "options", each ≤3 words, English. Do not invent
  options if no signal supports them — omit the field instead.
- Keep "field" unchanged.

Strict output:
- Return JSON matching the ClarifyOptions schema.
- All text content in ENGLISH (the field name "question_fr" is legacy
  — its content must be English).
- Do not add uncertainties that the input did not contain. Do not drop
  input uncertainties.
```

### User prompt template

```
Object: {analyze.object}
Visible problem: {analyze.problem_visual}
Input uncertainties (JSON): {JSON.stringify(analyze.uncertainties)}

Polish each uncertainty per the system rules and return ClarifyOptions JSON.
```

## Mode B — resolved

Triggered when the body contains a non-empty `answers` array. The route returns `{ resolved: true }` without invoking the model — answers are forwarded to `/api/plan` downstream by the orchestrator (Role D).

## Notes for Role B

- Keep options ≤3 per uncertainty. Beyond that the UI becomes a model picker.
- If the uncertainty is binary, options are `["yes", "no"]`.
- Don't add visual `image_url` per option for now — the `Uncertainty` schema doesn't carry it, and `lib/types.ts` is frozen.
- Field names ending in `_fr` are legacy. Output content is **English regardless**.
