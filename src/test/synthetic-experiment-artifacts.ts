/** Hand-authored offline data. No private reports, PDFs, exports or provider responses are read. */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const base = "outputs/product-demonstration/";
const ids = ["nutrafol", "lumatrail", "harborledger"] as const;
const packets = ids.map((id, index) => ({
  id,
  company: ["Nutrafol", "Lumatrail", "Harborledger"][index],
  domain: index === 0 ? "nutrafol.com" : `${id}.example`,
  mode: "HISTORICAL_PUBLIC_EXCERPTS_NOT_FRESH_RESEARCH",
  origin: "Hand-authored fictional test; not research or a customer export.",
  evidence: [1, 2, 3].map((n) => ({
    id: `${["E", "L", "H"][index]}${n}`,
    statement: `Synthetic ${id} company context ${n}; no actual event asserted.`,
    quote: `Synthetic ${id} company context ${n}; no actual event asserted.`,
    url: `https://${index === 0 ? "nutrafol.com" : `${id}.example`}/synthetic-test/${n}`,
    observedAt: "2026-10-20T00:00:00.000Z",
    limitation: "Fictional test data, never retrieved or cleared for outreach.",
  })),
  recipient: "Generic fictional Paid Search recipient",
  contactEligibility: "HOLD",
  limitations: ["No real contact, history, verification or permission."],
  screenshotObservation: { status: "SYNTHETIC", observation: "No actual screenshot supplied." },
}));
const corrected = structuredClone(packets[0]);
// Existing regression vocabulary; this text is not a verified factual assertion.
corrected.evidence[0].statement =
  "In its H1 2026 commentary, Unilever says actions are underway to improve Nutrafol's new-customer conversion.";
const saved = {
  profile: "NUTRAFOL_ONLY",
  approvedForOutreach: false,
  reservedNanoUsd: 91800000,
  binding: "07ab1e26c0e3df3c28f93342e56e48c79d8b663026e3ac5210d88512c0a16627",
  rows: [
    {
      grounding: {
        identityMatches: true,
        supportedFactIds: ["E1", "E2", "E3"],
        rejectedFactIds: [],
        concerns: [],
      },
    },
    {
      strategy: {
        prospectId:
          "workforce-" + sha(JSON.stringify({ actor: "internal-experiment", key: "nutrafol" })),
        angle: "OTHER_EVIDENCE_LED",
        supportingFactIds: ["E1", "E2", "E3"],
        hypothesis: "A fictional discussion of supplied company context may be relevant.",
        rationale: "Synthetic strategy for testing checkpoint reuse.",
        companyRationale: "Synthetic company context only.",
        prospectRationale: "Generic fictional recipient; HOLD.",
        uncertainties: ["No actual customer evidence or outreach clearance."],
        alternatives: [
          { angle: "NO_PITCH", reasonNotSelected: "Offline testing only; no external approval." },
        ],
      },
    },
  ],
};
const productFiles = ["fixtures/synthetic-tech-deck.txt", "fixtures/synthetic-playbook.txt"];
const artifacts: Record<string, string> = {
  [productFiles[0]]: "Synthetic offline product input, not the private PDF.\n",
  [productFiles[1]]: "Synthetic offline product input, not an approval for external use.\n",
  [base + "commercial-ab/aggregate-spend.jsonl"]:
    '{"event":"SYNTHETIC_HISTORY","reservedNanoUsd":45900000}\n',
  [base + "nutrafol-writing-demo-v1/aggregate-spend.jsonl"]:
    '{"event":"SYNTHETIC_HISTORY","reservedNanoUsd":91800000}\n',
  [base + "nutrafol-writing-demo-v1/corrected-nutrafol-evidence.json"]: JSON.stringify(corrected),
  [base + "nutrafol-writing-demo-v1/internal-writing-results.json"]: JSON.stringify(saved),
  [base + "commercial-ab/local-blind-key.json"]: JSON.stringify(
    ids.map((caseId) => ({ caseId, A: "CURRENT", B: "REVISED" })),
  ),
};
packets.forEach((packet) => {
  artifacts[base + `commercial-ab/${packet.id}-evidence.json`] = JSON.stringify(packet);
});
export const syntheticExperimentBindings = {
  PRODUCT_SOURCES: productFiles.map((file, i) => ({
    id: ["signal-tech-deck", "signal-playbook"][i],
    file,
  })),
  hashes: packets.map((p) => sha(JSON.stringify(p))),
  historicalLedgerHash: sha(artifacts[base + "commercial-ab/aggregate-spend.jsonl"]),
  continuationFiles: [
    "commercial-ab/aggregate-spend.jsonl",
    "nutrafol-writing-demo-v1/aggregate-spend.jsonl",
    "nutrafol-writing-demo-v1/corrected-nutrafol-evidence.json",
    "nutrafol-writing-demo-v1/internal-writing-results.json",
  ].map((file) => [file, sha(artifacts[base + file])] as const),
  expectedSources: productFiles.map((file) => sha(artifacts[file])),
};

/** Only caller-owned temporary roots; never generates artifacts in the checkout. */
export function writeSyntheticExperiment(
  root: string,
  stage: "comparison" | "demo" | "continuation" = "demo",
) {
  for (const [file, bytes] of Object.entries(artifacts)) {
    if (stage !== "continuation" && file.includes("nutrafol-writing-demo-v1/")) continue;
    if (stage === "comparison" && file.endsWith("aggregate-spend.jsonl")) continue;
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), bytes, { flag: "wx" });
  }
  const implementation = [
    "src/experiments/commercial-ab/experiment.ts",
    "src/experiments/commercial-ab/budget.ts",
    "src/server/agent-workforce/creative-agents.ts",
    "src/server/agent-workforce/commercial-brief.ts",
    "src/server/agent-workforce/openai.ts",
  ];
  const sourceHashes = implementation.map((file) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(file, join(root, file));
    return { file, sha256: sha(readFileSync(join(root, file))) };
  });
  writeFileSync(
    join(root, base, "commercial-ab/experiment-plan.json"),
    JSON.stringify({ sourceHashes }),
    { flag: "wx" },
  );
}
