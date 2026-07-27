# Build Sequence Reference Template Audit

## Why Prompt Layering Failed

The earlier Build Sequence prompt had too many overlapping instructions: be direct, use social proof, explain Signal, stay safe, adapt by persona, vary CTAs, and avoid unsupported claims. The model had room to invent a new strategy on every run, so outputs became repetitive, theoretical, or over-explained.

This change moves Build Sequence to a template-first architecture. The application owns the sequence strategy and the model only fills controlled fields inside that strategy.

## Approved Reference Structure

Every Build Sequence is now constrained to four steps:

1. Process question: ask how the prospect manages branded search today, introduce Signal briefly, and avoid claims about waste or competitor pressure.
2. Evidence or diagnostic: use visual context when supplied, otherwise approved proof when a named metric exists, otherwise a general diagnostic insight.
3. Product mechanism: explain competitor-presence monitoring, pause or lower-bid options, and coverage changes when competition returns.
4. Respectful close: close the loop, acknowledge the team may already manage this, and avoid a new pitch.

## Template-First Architecture

The application now creates the canonical four-step outline before OpenAI is called. The provider passes `sequencePlan` and `stepTwoMode` to OpenAI, and the validator rejects output that does not match the approved progression.

The provider also uses the same reference structure for deterministic fallback, so a provider failure no longer creates a loose generic sequence.

## Step 2 Deterministic Mode

Step 2 is selected by code, not by OpenAI:

- `VISUAL`: selected when screenshot or SERP context is supplied. The rendered step includes `[Insert relevant SERP or Signal screenshot here]` and only describes supplied observations.
- `PROOF`: selected when an approved case study includes a named customer and an approved metric such as a percent, MQL, SQL, revenue, clicks, or CPC.
- `DIAGNOSTIC`: selected when neither visual context nor usable proof exists. It uses a conditional branded-search visibility insight without customer stories or prospect-specific claims.

## Provider Prompt Simplification

The provider prompt now keeps only:

- The canonical four-step structure.
- The approved reference sequence.
- Step 2 mode supplied by the application.
- Approved proof and screenshot context payloads.
- Short bad examples for unsupported LELO-style claims and anonymous customer stories.
- Exact output schema expectations.

Removed from the effective architecture:

- Free-form sequence strategy creation.
- Multiple possible sequence lengths.
- Broad storytelling guidance.
- Repeated safety explanations that invited verbose copy.
- Instructions that let OpenAI decide proof strategy or step order.

## Reference Examples Added

The prompt includes the approved direct first-touch pattern and the four-step visual-evidence reference. The validator reinforces those references with deterministic checks for step purpose, proof behavior, CTA repetition, visual claims, and final-step restraint.

## Validation Behavior

Validation now rejects:

- Non-four-step generation.
- Step 1 unsupported waste, competitor, crowded query, CPC, or organic-capture claims.
- Step 2 content that does not match the selected Visual, Proof, or Diagnostic mode.
- Anonymous proof such as "one customer" or "a customer example."
- Vague AI phrases such as "conversion-source data" or "cleaner bid decision."
- Repeated CTAs, duplicate steps, copied full sequences inside one field, and final-step pitch restarts.

## Fallback Behavior

The deterministic fallback now follows the same approved reference pattern:

- Step 1 process question.
- Step 2 visual, proof, or diagnostic based on deterministic mode.
- Step 3 Signal mechanism.
- Step 4 short close.

Approved case-study metrics are preserved instead of being rewritten into generic product copy.

## Tests Added

Targeted tests cover:

- Fixed four-step progression.
- Visual Step 2 placeholder and supplied-context limits.
- Proof Step 2 with named approved metric.
- Diagnostic Step 2 without customer or metric.
- LELO regression against unsupported assumptions.
- Case-study metric preservation.
- Provider handling of four OpenAI steps.
- UI rendering for the Step 2 mode preview.

## Remaining Risks

OpenAI can still return copy that passes structure but feels less sharp than a human seller's best version. The deterministic guard prevents unsafe or off-structure output, but final quality still benefits from reviewing winning-message records and keeping approved proof records precise.

The system does not perform web research or live SERP enrichment in this phase, so account-specific facts must be supplied by the user or approved internal data.
