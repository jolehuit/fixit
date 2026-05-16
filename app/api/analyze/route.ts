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
Return between 4 and 6 uncertainties when the object has any technical specs that affect part selection. Aim for thorough technical disambiguation, not just minimum viable.

Coverage rule per object family — try to fill ALL of these dimensions when applicable:
- Bicycle → wheel size, tire size (ETRTO or sidewall code), valve type, brake type (rim/disc), drivetrain speeds, tube/tire variant (clincher/tubeless), frame size if relevant
- Phone/laptop → exact model, storage, color/finish, generation/year, region, battery health if guessable
- Plumbing → pipe diameter, thread/standard (BSP/NPT/metric), trap shape, fitting type, water-supply type
- Appliance → model number, voltage/region, power rating, capacity, color/finish
- Furniture → wood type, dimensions, joinery type, finish, brand/line

For EACH uncertainty, populate THESE fields (all text in English, the "_fr" suffix is legacy):
- "field": snake_case key downstream steps use to look up the answer (e.g. "tire_size_etrto", "valve_type").
- "question_fr": ONE short, direct question to the user. ≤12 words, ends with "?". No purpose clause inside this string anymore.
  Examples: "What's your tire size?", "Which valve type does the tube use?", "Rim brake or disc brake?"
- "purpose_fr": ONE short sentence (≤16 words) explaining WHY this answer matters — shown to the user as helper text.
  Examples: "Used to order the correct inner tube.", "Determines the pump head and replacement valve.", "Picks compatible brake pads or rotors."
- "instruction_fr": ONE short sentence (≤16 words) telling the user HOW to find the answer. Optional but recommended.
  Examples: "Check the sidewall of your tire for a code like 26x1.95 or 700x32C.", "Look at the valve stem — Presta is narrow and threaded, Schrader is wider like a car valve."
- "placeholder_fr": A realistic example value for the free-text input. ≤24 chars.
  Examples: "26x1.95", "Presta", "iPhone 13 Pro", "32 mm".
- "options": **always populate 3 options** when the field has KNOWN common candidates in the domain (iPhones, common tire sizes, common voltages, standard pipe diameters, etc.). Pick the 3 MOST LIKELY values based on the photo + general knowledge. The UI ALSO renders a free-text fallback under the buttons, so options are never a hard restriction — they're shortcuts for the common case. Each option ≤3 words. Examples of when to populate:
    * iPhone model → top 3 candidates from the visible generation cluster (e.g. ["iPhone 11", "iPhone 12", "iPhone 13"])
    * Drain diameter (EU) → ["32 mm", "40 mm", "50 mm"]
    * Tire valve type → ["Schrader", "Presta", "Dunlop"]
    * Bike wheel size → ["26 in", "27.5 in", "29 in"]
    * Bike tire width → ["1.95 in", "2.10 in", "2.25 in"]
    * Brake system → ["Rim (V-brake)", "Disc (mech.)", "Disc (hyd.)"]
  OMIT "options" only when the answer space is truly unbounded (a free serial number, a textual model code with no realistic 3-cluster, a measured value with no standard increments).

Examples of useful uncertainty fields (use what fits the object, do not force all):
- exact_model_number, brand_model, variant_or_generation
- purchase_year, production_year, region_or_market
- tire_size_etrto, tire_width, wheel_diameter, valve_type, brake_system, drivetrain_speeds
- trap_diameter_mm, hose_diameter_mm, thread_type, fitting_standard
- battery_capacity_mah, voltage, power_rating_watts
- storage_capacity, color_or_finish
- visible_serial_number, label_code

Quality > quantity, but err on the side of MORE thoroughness for repair domains where small spec mismatches break the fix (bikes especially). Empty array only when there is genuinely nothing left to disambiguate.

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
