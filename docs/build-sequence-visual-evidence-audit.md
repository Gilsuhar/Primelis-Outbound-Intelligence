# Build Sequence Visual Evidence Audit

## Previous Sequence Problems

Build Sequence could produce follow-ups that felt too theoretical or AI-written:

- Several steps explained the same Signal concept.
- Step 2 sometimes added little new information.
- Customer stories could be vague when no concrete approved result was available.
- Some drafts repeated similar CTAs.
- Phrases around SERP, organic coverage, and incrementality could repeat across the whole sequence.
- Step 4 could feel like another pitch instead of a close.

## New Four-Step Progression

The sequence is now validated around a clearer progression for standard four-step email sequences:

1. Step 1: process-led opening about how the prospect decides branded-search coverage.
2. Step 2: evidence-led follow-up using visual context, approved proof, or a safe diagnostic insight.
3. Step 3: mechanism-led explanation of how Signal acts on the condition.
4. Step 4: brief respectful close.

Each step must have a distinct purpose. Step 4 must remain shorter than the explanatory steps.

## Screenshot-Context Behavior

Build Sequence now accepts optional screenshot or SERP context:

- Screenshot available: yes/no
- Screenshot context
- Brand keyword
- Market or country
- Device
- Observation date
- What the screenshot shows

No image upload or storage was added.

When the user supplies visual context, Step 2 includes:

```text
[Insert relevant SERP or Signal screenshot here]
```

The placeholder is visible in the workspace and copied with the email step. The internal image-context note is shown to the salesperson but is not included in the copied email body.

The sequence must describe only the supplied visual context. It must not claim that the prospect is a solo bidder, that competitors are absent, or that the screenshot is from the prospect account unless that was explicitly supplied.

## Step 2 Fallback Hierarchy

Step 2 now follows this order:

1. Use screenshot or SERP observation when supplied.
2. Use one approved, relevant case study when visual context is absent and proof is available.
3. Use a practical diagnostic insight when neither visual context nor proof is suitable.

The diagnostic fallback remains conditional and general. It must not invent anonymous customer results.

## Repetition Controls

Validation now rejects:

- Duplicate or near-duplicate step bodies.
- Duplicate CTAs across the sequence.
- Several repeated questions in one step.
- Two steps that effectively do the same job.
- Standard four-step sequences that do not follow process, evidence, mechanism, close.
- Step 4 that is not meaningfully shorter than the explanatory steps.

## Unsupported-Fact Controls

Validation now rejects:

- Vague anonymous customer stories.
- Screenshot or visual claims without supplied visual context.
- Claims that the prospect is wasting spend.
- Unsupported competitor absence or solo-bidder implications.
- Multiple case-study proof companies.
- Unsupported commercial, POC, pricing, or competitor-comparison language already blocked by the existing safety layer.

## Output Validation

Each sequence step still returns:

- Step number
- Timing
- Subject
- Body
- CTA
- Purpose
- Optional image placeholder
- Optional image-context note

Internal notes are separated from copied email content. Raw JSON, internal labels, empty bodies, duplicate bodies, repeated CTAs, unsupported proof, and unsafe provider fallback states are rejected by service/provider validation.

## Safety Flags Parser Fix

A confirmed Build Sequence provider defect was found after the visual-evidence work: OpenAI could return valid JSON where `safetyFlags` contained a string entry instead of the canonical application object. The previous raw parser rejected the entire response with a schema error similar to:

```text
safetyFlags.0 Expected object, received string
```

Root cause:

- The application canonical type is strict: each safety flag must be an object with `status`, `flaggedWording`, `reason`, and `saferReplacement`.
- The raw OpenAI boundary accepted only that object shape.
- When OpenAI returned a non-empty string safety warning, the sequence content was otherwise usable but parsing failed before Build Sequence validation could run.

The fix separates the raw provider boundary from the canonical application boundary:

- Canonical objects are preserved and trimmed.
- Non-empty string flags are accepted only at the raw AI-response boundary.
- String flags are normalized into canonical objects with `status: "Needs revision"`, empty `flaggedWording`, the original string as `reason`, and empty `saferReplacement`.
- Empty strings, numbers, booleans, null entries, arrays, and malformed objects are still rejected.
- Missing `safetyFlags` still means an empty array.

Safety guarantees preserved:

- Sequence progression validation still runs.
- Proof validation still runs.
- Unsupported screenshot claims are still rejected.
- Unsupported competitor, pricing, POC, and commercial language remains blocked.
- Duplicate CTAs and repeated steps remain rejected.
- Normalized safety-flag text is not inserted into generated email bodies.

## UI Changes

The Build Sequence advanced details panel now includes an optional screenshot-context section. It is collapsed by default and does not affect the quick brief unless the user opens it and marks screenshot context as available.

The generated timeline shows a dashed image placeholder panel when Step 2 uses visual context.

## Tests Added

Added regression coverage for:

- Screenshot context creating a Step 2 image placeholder.
- Step 2 describing only supplied visual context.
- Missing screenshot context rejecting invented screenshot or solo-bidder observations.
- Vague anonymous customer stories being rejected.
- Duplicate CTAs being rejected.
- Standard four-step progression.
- Step 4 being shorter than the explanatory steps.
- Screenshot fields staying optional and tucked into advanced UI.
- Canonical object safety flags accepted.
- String safety flags normalized without forcing deterministic fallback.
- Mixed object/string safety flags normalized.
- Empty string, number, boolean, null, and malformed safety flags rejected.
- Build Sequence OpenAI response with string `safetyFlags` no longer triggers fallback.

## Remaining Risks

- There is still no image upload, storage, or image analysis. The seller must describe the screenshot accurately.
- The model can improve wording but cannot verify visual context on its own.
- Signed-in browser QA should still confirm the Step 2 placeholder is easy to use at 390px mobile width.
- Live OpenAI output quality should be spot-checked in preview because provider behavior can vary even with validation.
