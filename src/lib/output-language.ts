export const outputLanguages = ["ENGLISH", "FRENCH", "PORTUGUESE"] as const;

export type OutputLanguage = (typeof outputLanguages)[number];

export const defaultOutputLanguage: OutputLanguage = "ENGLISH";

export const outputLanguageLabels: Record<OutputLanguage, string> = {
  ENGLISH: "English",
  FRENCH: "French",
  PORTUGUESE: "Portuguese",
};

export function normalizeOutputLanguage(value: unknown): OutputLanguage {
  return outputLanguages.includes(value as OutputLanguage)
    ? (value as OutputLanguage)
    : defaultOutputLanguage;
}

export function outputLanguageInstruction(language: OutputLanguage) {
  if (language === "FRENCH") {
    return "Write the generated prospect-facing draft in natural business French. Keep product names, company names, evidence labels, and source titles unchanged.";
  }

  if (language === "PORTUGUESE") {
    return "Write the generated prospect-facing draft in natural business Portuguese. Keep product names, company names, evidence labels, and source titles unchanged.";
  }

  return "Write the generated prospect-facing draft in clear business English.";
}
