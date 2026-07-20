export function lastProspectTurn(message: string) {
  const lines = message
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const questionLines = lines.filter((line) => /\?$/.test(line));
  return questionLines.at(-1) ?? lines.at(-1) ?? message;
}

export function detectConversationStage(message: string) {
  const text = message.toLowerCase();
  const latestLine = message
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)
    ?.toLowerCase() ?? "";
  const lastTurn = lastProspectTurn(message).toLowerCase();
  const pricingAlreadyAnswered =
    /\b(flat monthly fee|charge a flat monthly fee|trailing 12-month|last 12-month|brand ad spend over the past 12 months|second to last slide|outlined on the second|core tier|pro tier|prime tier|enterprise tier|roi|5x|20x)\b/.test(text);
  const askedThoughtsAfterPricing =
    /would love to hear your thoughts|hear your thoughts|whenever you have a chance/.test(text);
  return {
    lastTurn,
    deckAlreadySent:
      /\b(as promised|attached|see attached|deck|presentation|slides)\b/.test(text) &&
      /\b(pricing|commercial|fee structure|commercials|second to last slide|plan|tier)\b/.test(text),
    pricingAlreadyAnswered,
    askedThoughtsAfterPricing,
    deckRequestIsOld:
      /\bdo you have a deck\b/.test(text) &&
      /\b(as promised|see attached|pricing|commercials|fee structure)\b/.test(text),
    needsFollowUpAfterCommercials:
      (pricingAlreadyAnswered && askedThoughtsAfterPricing) ||
      /would love to hear your thoughts|hear your thoughts|whenever you have a chance/.test(latestLine) ||
      (
        pricingAlreadyAnswered &&
        !/\b\?$/.test(lastTurn)
      ),
  };
}
