import type { ImportedSignalRecord } from "@/features/imported-signal-review/types";
import type { UserRole } from "@/features/knowledge/types";

export const evidenceLevels = ["PROVEN", "STRONG_HYPOTHESIS", "EXPLORATORY"] as const;
export type EvidenceLevel = (typeof evidenceLevels)[number];

export type IndustryPlaybookEntry = {
  name: string;
  evidenceLevel: EvidenceLevel;
  whySignalMayFit: string[];
  primaryPersonas: string[];
  bestAngles: string[];
  likelyObjection: string;
  eligibleProof?: string[];
};

export type PersonaPlaybookEntry = {
  name: string;
  tier: "TIER_1" | "TIER_2" | "TIER_3";
  caresAbout: string;
  relevance: string;
  bestAngle: string;
  suitableCta: string;
  commonObjection: string;
  secondaryStakeholder: string;
  prioritizeWhen: string;
  doNotPrioritizeWhen: string;
};

export type PracticeScenario = {
  id: string;
  title: string;
  prompt: string;
  guidance: string;
};

export type PlaybookProgressKey =
  | "learnSignal"
  | "icp"
  | "industries"
  | "personas"
  | "qualification"
  | "objections"
  | "caseStudies"
  | "practice"
  | "readyForUsMarket"
  | "managerApproval";

export type PlaybookProgressState = Record<PlaybookProgressKey, boolean>;

export type PlaybookData = {
  approvedProductTruth: ImportedSignalRecord[];
  approvedMessagingRules: ImportedSignalRecord[];
  objections: ImportedSignalRecord[];
  caseStudies: ImportedSignalRecord[];
  industries: IndustryPlaybookEntry[];
  personas: PersonaPlaybookEntry[];
  practiceScenarios: PracticeScenario[];
};

export type ManagerProgressView = {
  completionPercentage: number;
  completedSections: string[];
  remainingSections: string[];
  readinessStatus: "Not started" | "In progress" | "Ready for manager review" | "Approved";
  managerApprovalVisible: boolean;
};

export type ViewerRole = UserRole;
