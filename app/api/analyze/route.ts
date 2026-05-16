/**
 * POST /api/analyze
 * Owner: Role B
 *
 * Vision + reasoning. Takes a photo URL + optional voice transcript,
 * returns an AnalyzeResult (object, category, problem, uncertainties).
 *
 * Pipeline:
 *  1. Validate input via AnalyzeRequest (Zod).
 *  2. Call gpt-5.5 via AI SDK 5 `generateObject` with the AnalyzeResult schema.
 *     Image input accepts either a public URL or a base64 data URL.
 *  3. Double-validate the model output before returning so the contract in
 *     lib/types.ts is never violated downstream (Role C / Role D).
 */

import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { requireEnv } from '@/lib/env';
import { visionModel } from '@/lib/openai';
import { AnalyzeRequest, AnalyzeResult } from '@/lib/types';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are a repair-diagnosis assistant whose output becomes the single source of truth for ALL downstream steps (clarification, parts research, repair-plan synthesis, video generation). Every later stage will parse your strings — they must be specific, structured, and verifiable from the photo.

The user shows a photo of a broken or malfunctioning object and (sometimes) speaks a problem description, possibly in French.

Work in 4 internal phases. Do NOT emit your reasoning — only the final JSON.

PHASE 1 — VISUAL CATALOG (reason silently before identifying):
Read everything from the photo:
- Every visible label, sticker, model code, serial number, brand logo, even partially obscured / rotated / blurred. Transliterate non-Latin script.
- Numbers, dates, dimensions printed on the object (e.g. "32 mm", "26x1.95", "5V/2A").
- Standards markings (ETRTO, voltage, thread type, IP rating).
- Materials (metal, plastic type if guessable, ceramic, glass, rubber).
- Colors and color patterns.
- Wear/age cues (scratches, oxidation, dust, weathering).
- Brand styling cues (font, logo placement, design language).
- Surrounding context (mounting, environment) only when it disambiguates the object.

PHASE 2 — STRUCTURED PRODUCT IDENTIFICATION:
Write the "object" field as a SINGLE compact string using slots separated by " ; ". Use ALL slots that apply; omit a slot only when truly unknowable from the photo. Slots:
"Brand: <X> ; Model line: <X> ; Model code or variant: <X> ; Generation/Year: <X> ; Color/Finish: <X> ; Material: <X> ; Visible markings: <verbatim or close paraphrase of every label/code seen, comma-separated> ; Distinguishing features: <2–5 specific observations that disambiguate the model>"

Example for an iPhone with notch + single rear camera:
"Brand: Apple ; Model line: iPhone ; Model code or variant: XR or 11 (visually indistinguishable from this angle) ; Generation/Year: 2018–2019 ; Color/Finish: black glass back ; Material: aluminum frame, glass front and back ; Visible markings: pentalobe screws beside Lightning port (none readable) ; Distinguishing features: top notch with TrueDepth camera, no Home button, single rear camera, no Face ID/fingerprint mismatch visible"

Example for an unbranded faucet trap:
"Brand: Unknown (red label partially readable: 'M. AL...') ; Model line: bottle trap with appliance side-inlet ; Model code or variant: unreadable code starting with 'B' on red sticker ; Generation/Year: not visible ; Color/Finish: white trap body, grey waste pipes ; Material: PVC and HDPE plastic ; Visible markings: red sticker mid-trap, blue stripe on slip nut, brass clamp on grey hose ; Distinguishing features: integrated dishwasher tee, compression slip-joints, single 90° elbow on waste, copper supply line on the right"

If the model is one of N candidates, name them all in "Model code or variant" rather than guessing one.

PHASE 3 — STRUCTURED PROBLEM LOCATION:
Write "problem_visual" as a SINGLE string using slots separated by " ; ". Slots:
"Defect: <X> ; located at: <precise sub-component / position> ; severity: <minor|moderate|severe> ; visible signs: <what specifically shows the defect>"

Example:
"Defect: active water leak ; located at: the upper slip-joint nut between the sink strainer outlet and the trap inlet (top of the assembly, ~3cm below the sink basin) ; severity: moderate (steady visible drip into the cabinet floor) ; visible signs: vertical water trail along the white trap body, glistening film around the upper slip nut, towel below partially saturated"

PHASE 4 — SPARE-PARTS UNCERTAINTIES:
Return up to 3 uncertainties that genuinely block ordering the correct replacement part. Quality > quantity.

For EACH uncertainty:
- "field" is a snake_case key downstream steps will use to look up the answer.
- "question_fr" is the user-facing question. Format strictly as:
  "<short direct English question> (— used to <one-line purpose>)"
  Examples:
    "Which exact iPhone model? (— used to pick the correct display assembly P/N)"
    "What is the trap diameter? (— used to size the slip washer and replacement nut)"
- "options": **always populate 3 options** when the field has KNOWN common candidates in the domain (iPhones, common tire sizes, common voltages, standard pipe diameters, etc.). Pick the 3 MOST LIKELY values based on the photo + general knowledge. The UI ALSO renders a free-text fallback under the buttons, so options are never a hard restriction — they're shortcuts for the common case. Each option ≤3 words. Examples of when to populate:
    * iPhone model → top 3 candidates from the visible generation cluster (e.g. ["iPhone 11", "iPhone 12", "iPhone 13"])
    * Drain diameter (EU) → ["32 mm", "40 mm", "50 mm"]
    * Tire valve type → ["Schrader", "Presta", "Dunlop"]
    * Bike wheel size → ["26 in", "27.5 in", "29 in"]
  OMIT "options" only when the answer space is truly unbounded (a free serial number, a textual model code with no realistic 3-cluster, a measured value with no standard increments).

Examples of useful uncertainty fields (use what fits the object, do not force all):
- exact_model_number, brand_model, variant_or_generation
- purchase_year, production_year, region_or_market
- tire_size_etrto, wheel_diameter, valve_type
- trap_diameter_mm, hose_diameter_mm, thread_type
- battery_capacity_mah, voltage, power_rating_watts
- storage_capacity, color_or_finish
- visible_serial_number, label_code

Do NOT invent uncertainties to look thorough. Empty array if the photo + transcript already determine the part.

OTHER REQUIRED FIELDS:
- "category" must be exactly one of: vehicle, electronics, plumbing, furniture, other.
- "defect_marker" pinpoints where on the photo the defect is centered, as percentages of the image box (x=0 is left edge, x=100 is right edge; y=0 is top, y=100 is bottom). The "label" is a 2-4 word English summary of what the marker points at (e.g. "Cracked area", "Leak source", "Flat tire"). Estimate it as precisely as you can from the photo geometry — this drives a pulsing UI marker the user clicks to play the repair video.

OUTPUT RULES:
- All text fields in ENGLISH (the legacy "_fr"-suffixed names are kept by contract; content is English).
- Strict JSON matching the AnalyzeResult schema. No extra top-level fields.
- Never speculate. If something is unknowable, omit it from the slot or convert it to an uncertainty.`;

const userPrompt = (transcript: string | undefined): string => {
  const t = transcript?.trim();
  const head = t
    ? `User's voice description (may be in French): "${t}"`
    : 'No voice description provided.';
  return `${head}

Analyze the photo per the 3-phase system instructions. Read every visible label and marking, identify the object as precisely as possible for spare-parts procurement, and list only the uncertainties that genuinely block ordering the right part. Return AnalyzeResult JSON with all text content in English.`;
};

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = AnalyzeRequest.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    requireEnv('OPENAI_API_KEY');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'OPENAI_API_KEY missing';
    return NextResponse.json({ error: 'env_missing', message }, { status: 500 });
  }

  const { photo_url, transcript_fr } = parsed.data;

  try {
    const result = await generateObject({
      model: visionModel(),
      schema: AnalyzeResult,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: photo_url },
            { type: 'text', text: userPrompt(transcript_fr) },
          ],
        },
      ],
    });

    const safe = AnalyzeResult.parse(result.object);
    return NextResponse.json(safe);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'analyze failed';
    return NextResponse.json({ error: 'analyze_failed', message }, { status: 500 });
  }
}
