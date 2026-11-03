const codes = new Set([
  "PREVIEW_SETUP_HISTORY_VERIFICATION_FAILED", "PREVIEW_SETUP_HISTORY_MISSING",
  "PREVIEW_SETUP_RLS_VERIFICATION_FAILED", "PREVIEW_SETUP_UNEXPECTED_OBJECTS", "PREVIEW_SETUP_UNEXPECTED_DATA",
  "PREVIEW_SETUP_SCHEMA_DRIFT", "PREVIEW_SETUP_DIFF_COMMAND_FAILED", "PREVIEW_SETUP_DIFF_TIMEOUT",
  "PREVIEW_SETUP_DIFF_PROCESS_FAILED", "PREVIEW_SETUP_VERIFICATION_QUERY_FAILED", "PREVIEW_SETUP_TARGET_REJECTED",
]);
const categories = new Set(["CHECK_FAILED", "SCHEMA_DRIFT", "COMMAND_ERROR", "PROCESS_ERROR", "TIMEOUT",
  "AUTHENTICATION", "CONNECTIVITY", "PERMISSION", "TLS", "CONFIGURATION", "MISSING_HISTORY", "QUERY_ERROR"]);
const stages = new Set(["IDENTITY", "HISTORY", "TABLE_RLS", "UNEXPECTED_OBJECTS", "EMPTY_DATA", "SCHEMA_DIFF", "UNKNOWN"]);
export function verificationReport(error) {
  return {
    code: codes.has(error?.message) ? error.message : "PREVIEW_SETUP_VERIFICATION_QUERY_FAILED",
    stage: stages.has(error?.stage) ? error.stage : "UNKNOWN",
    category: categories.has(error?.category) ? error.category : "QUERY_ERROR",
  };
}
export function verificationError(error, stage) {
  let code = codes.has(error?.message) ? error.message : "PREVIEW_SETUP_VERIFICATION_QUERY_FAILED";
  let category = codes.has(error?.message) ? "CHECK_FAILED" : "QUERY_ERROR";
  const prisma = { P1000: "AUTHENTICATION", P1001: "CONNECTIVITY", P1002: "TIMEOUT", P1010: "PERMISSION",
    P1011: "TLS", P1012: "CONFIGURATION", P1013: "CONFIGURATION", P1017: "CONNECTIVITY" };
  if (Object.hasOwn(prisma, error?.code)) category = prisma[error.code];
  if (error?.meta?.code === "42501") category = "PERMISSION";
  if (stage === "HISTORY" && error?.meta?.code === "42P01") { code = "PREVIEW_SETUP_HISTORY_MISSING"; category = "MISSING_HISTORY"; }
  if (categories.has(error?.category)) category = error.category;
  return Object.assign(new Error(code), { stage: stages.has(stage) ? stage : "UNKNOWN", category });
}
