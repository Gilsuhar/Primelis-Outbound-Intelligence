const sensitiveErrorPatterns = [
  /OPENAI_API_KEY/i,
  /HUBSPOT/i,
  /SUPABASE/i,
  /DATABASE_URL/i,
  /sk-[a-z0-9_-]+/i,
  /prisma/i,
  /postgres/i,
  /stack trace/i,
  /\bat\s+.+:\d+:\d+/i,
  /JSON\.parse|SyntaxError|TypeError|ZodError/i,
];

export function safeClientErrorMessage(
  message: string | null | undefined,
  fallback = "Something went wrong. Please try again. If it keeps happening, ask an admin to review the setup.",
) {
  const trimmed = message?.trim();

  if (!trimmed) {
    return fallback;
  }

  if (sensitiveErrorPatterns.some((pattern) => pattern.test(trimmed))) {
    return fallback;
  }

  return trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed;
}
