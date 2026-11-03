import type { NormalizedContact, TitleMatchQuality } from "./types";

type Classification = Pick<
  NormalizedContact,
  "personaTier" | "personaCategory" | "titleMatchQuality" | "targetingPriority" | "rationale"
>;

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function exactMatch(title: string, values: string[]) {
  return values.some((value) => normalizeTitle(value) === title);
}

function containsAny(title: string, values: RegExp[]) {
  return values.some((pattern) => pattern.test(title));
}

function result(
  personaTier: Classification["personaTier"],
  personaCategory: string,
  titleMatchQuality: TitleMatchQuality,
  targetingPriority: number,
  rationale: string,
): Classification {
  return { personaTier, personaCategory, titleMatchQuality, targetingPriority, rationale };
}

const directPaidSearchExact = [
  "Head of Paid Search",
  "Director of Paid Search",
  "Global Paid Search Lead",
  "Search Marketing Director",
  "Paid Search Manager",
  "SEM Manager",
  "PPC Lead",
  "Search Lead",
];

export function classifyProfessionalTitle(rawTitle: string): Classification {
  const title = normalizeTitle(rawTitle);
  if (!title) {
    return result("Review", "Unknown", "Manual review required", 0, "Missing title.");
  }
  if (exactMatch(title, directPaidSearchExact)) {
    return result(
      "Tier 1",
      "Direct Paid Search",
      "Exact match",
      100,
      "Direct Paid Search ownership is closest to branded-search decisions.",
    );
  }
  if (containsAny(title, [/\bpaid search\b/, /\bsem\b/, /\bppc\b/, /\bsearch marketing\b/])) {
    return result(
      "Tier 1",
      "Direct Paid Search",
      "Strong variation",
      95,
      "Title indicates direct Paid Search or search marketing responsibility.",
    );
  }
  if (containsAny(title, [/\bperformance marketing\b/, /\bgrowth\b/, /\bacquisition\b/])) {
    return result(
      "Tier 1",
      "Performance and Growth",
      "Strong variation",
      82,
      "Performance, Growth, or Acquisition ownership is relevant but should not outrank a clearer Paid Search owner.",
    );
  }
  if (containsAny(title, [/\bdigital marketing\b/, /\bdigital\b/, /\be-?commerce\b/])) {
    return result(
      "Tier 2",
      "Secondary Digital and E-commerce",
      "Possible match",
      62,
      "Digital or E-commerce leadership can be relevant when direct Paid Search ownership is unknown.",
    );
  }
  if (
    containsAny(title, [
      /\bcmo\b/,
      /\bchief growth officer\b/,
      /\bvp marketing\b/,
      /\bsvp marketing\b/,
    ])
  ) {
    return result(
      "Tier 3",
      "Executive sponsors",
      "Possible match",
      45,
      "Executive sponsors may support later-stage conversations but are not automatically primary targets.",
    );
  }
  if (containsAny(title, [/\bmarketing\b/, /\blead\b/, /\bdirector\b/, /\bmanager\b/])) {
    return result(
      "Review",
      "Ambiguous marketing role",
      "Manual review required",
      20,
      "The title is marketing-related but does not clearly indicate approved Signal ownership.",
    );
  }
  return result(
    "Review",
    "Not relevant",
    "Not relevant",
    0,
    "The title is outside the approved Signal persona framework.",
  );
}
