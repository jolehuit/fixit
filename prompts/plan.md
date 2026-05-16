# /api/plan — Tavily research + GPT-5.5 restructuring (first draft)

**Owner:** Role B
**Primary:** Tavily `/research` with `outputSchema` derived from `RepairPlan`
**Fallback:** Tavily `/search` (FR domains) + `/extract` top result, then
GPT-5.5 restructures into `RepairPlan`.

## Tavily /research query template

```
Comment réparer "{problem_summary_fr}" pour "{object}" ({category}).
Retourne les étapes concrètes (titre, description, pièces, outils, durée
estimée), sans introduction.
```

`outputSchema`: see `RepairPlan` in `lib/types.ts`. Tavily's research
endpoint accepts a JSON-Schema-shaped object — use Zod's
`z.toJSONSchema(RepairPlan)` (Zod v4) at call time.

## Per-step augmentation (GPT-5.5)

Tavily returns the high-level plan. Then a single GPT-5.5 call fills the
generation-only fields per step:

- `visual_prompt_start` — short visual sentence describing the START
  pose/state of the step. Used by gpt-image-2/edit. Mention the object,
  the hands' position, and any tool in frame. EN works best for image
  models — write in EN.
- `visual_prompt_end` — same, for the END state.
- `motion_prompt` — what changes between START and END, ≤ 1 sentence,
  EN. Used by Seedance 2.0.
- `narration_fr` — 50–80 words FR, second-person address ("vous"),
  matches the duration of the animated clip.

## Notes for Role B

- If `/research` returns < 2 or > 8 steps, retry with a tighter prompt.
- For FR queries, prefer `include_domains`: `ifixit.com`, `spareka.fr`,
  `decathlon.fr`, `manomano.fr`, `leroymerlin.fr`, `castorama.fr`.
- Validate the output through `RepairPlan.safeParse` before returning.
