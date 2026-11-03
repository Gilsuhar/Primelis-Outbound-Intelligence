/** Display contract only. No field grants permission to send or enroll. */
export type RecyclerPreparation = {
  version: string;
  evaluatedAt: string;
  mode: "SIMULATED" | "LIVE";
  research: "BLOCKED" | "MISSING" | "COMPLETE";
  drafting: "BLOCKED" | "MISSING" | "NEEDS_REVISION" | "READY_FOR_REVIEW";
  humanReview: "PENDING";
  canSend: false;
  canEnroll: false;
  reasons: string[];
  brief: {
    topic: string;
    status: "SUPPORTED" | "HYPOTHESIS" | "MISSING";
    text: string;
    sources: string[];
  }[];
  emails: { subject: string; body: string; evidenceIds: string[] }[];
  quality: { checksPassed: boolean; wordsPerEmail: number[]; concerns: string[] };
  screenshot: { status: "MISSING" | "RECOMMENDED"; instruction: string; sourceUrl?: string };
};
