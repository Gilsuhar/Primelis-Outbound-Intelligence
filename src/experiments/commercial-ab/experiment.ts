import {
  PRODUCT_SOURCES,
  hashes,
  historicalLedgerHash,
  continuationFiles,
  expectedSources,
} from "./historical-bindings";
export { PRODUCT_SOURCES } from "./historical-bindings";
/** Explicitly invoked local experiment; never imported by an application route or worker. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  type KnowledgeRecord,
  type WorkforceRun,
  researchSchema,
  strategySchema,
} from "@/features/agent-workforce/gate-a-contracts";
import { companyGroundingReviewSchema } from "@/features/agent-workforce/company-research/grounding-review";
import { initialDailyState, type DailyState } from "@/features/agent-workforce/daily/contracts";
import { initialRun } from "@/server/agent-workforce/store";
import { OpenAiWorkforceModel, type WorkforceModel } from "@/server/agent-workforce/openai";
import {
  chooseSalesStrategy,
  generatePersonalSequence,
  reviewSequenceWithAi,
} from "@/server/agent-workforce/creative-agents";
import { validateCompanyGroundingWithAi } from "@/server/agent-workforce/company-research/grounding-review";
import { groundingRejectionReasons } from "@/server/agent-workforce/company-research/grounding-audit";
import { validateResearch, validateSequence } from "@/server/agent-workforce/evidence-validation";
import { strategyGroundingConcerns } from "@/server/agent-workforce/commercial-quality";
import { withBudgetContext } from "@/server/agent-workforce/daily/budget";
import { DailyStore, dailyConfig } from "@/server/agent-workforce/daily/state";
import { ExperimentBudget, MODEL, type ExperimentProfile } from "./budget";

export const MODE = "INTERNAL_EXPERIMENT_ONLY";
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const restrictions = `${MODE}. Internal-only. Gil approved only these exact capabilities for internal drafting and evaluation. No external-use approval, customer proof, savings percentages, performance guarantees or additional product claims.`;
export const PRODUCT_INPUT: KnowledgeRecord[] = [
  {
    id: "internal-experiment:signal-monitoring",
    kind: "PRODUCT",
    title: "Signal branded search monitoring",
    text: "Signal monitors branded Google search results to identify advertiser presence.",
    sourceIds: ["signal-tech-deck", "signal-playbook"],
    sourceUrls: [],
    restrictions,
  },
  {
    id: "internal-experiment:signal-adjustment",
    kind: "PRODUCT",
    title: "Configured branded bidding",
    text: "Where configured, Signal can lower bids or pause and reactivate branded ads as competitor conditions change.",
    sourceIds: ["signal-tech-deck", "signal-playbook"],
    sourceUrls: [],
    restrictions,
  },
  {
    id: "internal-experiment:signal-performance",
    kind: "PRODUCT",
    title: "Performance-informed decisions",
    text: "Signal uses blended click-through and conversion data to guide bidding decisions and monitor performance.",
    sourceIds: ["signal-tech-deck"],
    sourceUrls: [],
    restrictions,
  },
];

const cases = ["nutrafol", "lumatrail", "harborledger"] as const;

const packetSchema = z.object({
  id: z.enum(cases),
  company: z.string(),
  domain: z.string(),
  mode: z.string(),
  origin: z.string(),
  evidence: z.union([
    z.string(),
    z.array(
      z.object({
        id: z.string(),
        statement: z.string(),
        url: z.string().url(),
        quote: z.string(),
        observedAt: z.string().datetime(),
        limitation: z.string(),
      }),
    ),
  ]),
  recipient: z.literal("Generic fictional Paid Search recipient"),
  contactEligibility: z.literal("HOLD"),
  limitations: z.array(z.string()),
  screenshotObservation: z.unknown().optional(),
});
type Packet = z.infer<typeof packetSchema>;
const blindSchema = z
  .array(
    z
      .object({
        caseId: z.enum(cases),
        A: z.enum(["CURRENT", "REVISED"]),
        B: z.enum(["CURRENT", "REVISED"]),
      })
      .strict()
      .refine((v) => v.A !== v.B),
  )
  .length(3);

export function prepareComparison(root: string) {
  const directory = join(root, "outputs/product-demonstration/commercial-ab");
  const packets = cases.map((id, i) => {
    const bytes = readFileSync(join(directory, `${id}-evidence.json`));
    if (sha(bytes) !== hashes[i]) throw new Error("EXPERIMENT_EVIDENCE_CHANGED");
    const packet = packetSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (packet.id !== id) throw new Error("EXPERIMENT_CONTACT_DATA_DENIED");
    return packet;
  });
  const sources = PRODUCT_SOURCES.map((source) => ({
    ...source,
    sha256: sha(readFileSync(resolve(root, source.file))),
  }));
  // Validate existing assignments without revealing them to either model or human packet.
  const blinds = blindSchema.parse(
    JSON.parse(readFileSync(join(directory, "local-blind-key.json"), "utf8")),
  );
  if (new Set(blinds.map((b) => b.caseId)).size !== 3)
    throw new Error("EXPERIMENT_BLINDING_INVALID");
  const plan = JSON.parse(readFileSync(join(directory, "experiment-plan.json"), "utf8"));
  for (const file of plan.sourceHashes as { file: string; sha256: string }[]) {
    if (sha(readFileSync(join(root, file.file))) !== file.sha256)
      throw new Error("EXPERIMENT_REVIEWED_SOURCE_CHANGED");
  }
  const implementation = ["budget.ts", "experiment.ts"].map((file) =>
    sha(readFileSync(join(root, "src/experiments/commercial-ab", file))),
  );
  const binding = sha(
    JSON.stringify({
      hashes,
      sources,
      knowledge: PRODUCT_INPUT,
      blinds,
      implementation,
      model: MODEL,
    }),
  );
  return { directory, packets, sources, binding, blinds };
}

export const NUTRAFOL_E1 =
  "In its H1 2026 commentary, Unilever says actions are underway to improve Nutrafol's new-customer conversion.";
export const HISTORICAL_RESERVATION_NANO_USD = 45_900_000;

/** New input version in memory only; never edits the historical packets or journal. */
export function prepareNutrafolDemonstration(root: string) {
  const previous = prepareComparison(root);
  const journal = readFileSync(join(previous.directory, "aggregate-spend.jsonl"));
  if (sha(journal) !== historicalLedgerHash)
    throw new Error("EXPERIMENT_HISTORICAL_LEDGER_CHANGED");
  const packet = structuredClone(previous.packets[0]);
  if (packet.id !== "nutrafol" || typeof packet.evidence === "string")
    throw new Error("EXPERIMENT_NUTRAFOL_PACKET_REQUIRED");
  const e1 = packet.evidence.filter((e) => e.id === "E1");
  if (e1.length !== 1) throw new Error("EXPERIMENT_E1_REQUIRED");
  e1[0].statement = NUTRAFOL_E1;
  return {
    ...previous,
    directory: join(root, "outputs/product-demonstration/nutrafol-writing-demo-v1"),
    packets: [packet],
    binding: sha(
      JSON.stringify({
        previousBinding: previous.binding,
        packet,
        profile: "NUTRAFOL_ONLY",
        historicalLedgerHash,
        historicalReservationNanoUsd: HISTORICAL_RESERVATION_NANO_USD,
      }),
    ),
  };
}

export const CONTINUATION_HISTORICAL_RESERVATION_NANO_USD = 137_700_000;

/** Read-only checkpoint reuse. Never rebind or rewrite a consumed experiment. */
export function prepareNutrafolContinuation(root: string) {
  const bytes = continuationFiles.map(([file, expected]) => {
    const value = readFileSync(join(root, "outputs/product-demonstration", file));
    if (sha(value) !== expected) throw new Error("EXPERIMENT_CHECKPOINT_CHANGED");
    return value;
  });
  const packet = packetSchema.parse(JSON.parse(bytes[2].toString("utf8")));
  const saved = JSON.parse(bytes[3].toString("utf8"));
  if (
    packet.id !== "nutrafol" ||
    packet.domain !== "nutrafol.com" ||
    saved.profile !== "NUTRAFOL_ONLY" ||
    saved.approvedForOutreach !== false ||
    saved.reservedNanoUsd !== 91_800_000 ||
    saved.binding !== "07ab1e26c0e3df3c28f93342e56e48c79d8b663026e3ac5210d88512c0a16627"
  )
    throw new Error("EXPERIMENT_CHECKPOINT_INVALID");
  const grounding = companyGroundingReviewSchema.parse(
    saved.rows.find((row: { grounding?: unknown }) => row.grounding)?.grounding,
  );
  const strategy = strategySchema.parse(
    saved.rows.find((row: { strategy?: unknown }) => row.strategy)?.strategy,
  );
  const run = evidenceRun(packet);
  if (
    validateResearch(run, new Date(), { company: true, prospect: false }).length ||
    groundingRejectionReasons(grounding, run.research.facts, run.research.sources).length ||
    strategy.prospectId !== run.id ||
    strategy.angle === "NO_PITCH" ||
    strategy.supportingFactIds.some((id) => !run.research.facts.some((f) => f.id === id)) ||
    strategyGroundingConcerns(run, strategy).length
  )
    throw new Error("EXPERIMENT_CHECKPOINT_REVALIDATION_FAILED");

  const sources = PRODUCT_SOURCES.map((source, i) => {
    const sha256 = sha(readFileSync(resolve(root, source.file)));
    if (sha256 !== expectedSources[i]) throw new Error("EXPERIMENT_PRODUCT_SOURCE_CHANGED");
    return { ...source, sha256 };
  });
  const implementation = [
    "src/experiments/commercial-ab/budget.ts",
    "src/experiments/commercial-ab/experiment.ts",
    "src/server/agent-workforce/creative-agents.ts",
    "src/server/agent-workforce/commercial-brief.ts",
    "src/server/agent-workforce/openai.ts",
  ].map((file) => ({ file, sha256: sha(readFileSync(join(root, file))) }));
  const checkpoint = { files: continuationFiles, grounding, strategy };
  const binding = sha(
    JSON.stringify({
      profile: "NUTRAFOL_CONTINUATION",
      checkpoint,
      sources,
      knowledge: PRODUCT_INPUT,
      implementation,
      model: MODEL,
      historicalReservationNanoUsd: CONTINUATION_HISTORICAL_RESERVATION_NANO_USD,
    }),
  );
  return {
    directory: join(root, "outputs/product-demonstration/nutrafol-writing-continuation-v1"),
    packets: [packet],
    sources,
    binding,
    blinds: [],
    checkpoint,
  };
}

/** Retained evidence only; fictional ledger entries remain explicitly fictional. */
export function evidenceRun(packet: Packet): WorkforceRun {
  const at = new Date("2026-10-20T00:00:00.000Z"); // date-only fictional report, not a live observation time
  const run = initialRun(
    "internal-experiment",
    packet.id,
    {
      companyName: packet.company,
      companyDomain: packet.domain,
      prospectName: "Generic fictional recipient",
      prospectTitle: "Fictional Paid Search buyer",
    },
    at,
  );
  run.writingMode = "EVIDENCE_LED";
  run.knowledge = structuredClone(PRODUCT_INPUT);
  run.eligibility = {
    status: "HOLD",
    reasons: ["Internal experiment; no real-contact clearance"],
    blockDrafting: false,
  };
  const entries =
    typeof packet.evidence === "string"
      ? packet.evidence.split("\n").flatMap((line) => {
          const match = /^- ([LH]\d): (.+)$/.exec(line);
          return match
            ? [
                {
                  id: match[1],
                  statement: match[2],
                  quote: match[2],
                  url: `https://${packet.domain}/fictional-evidence/${match[1]}`,
                  observedAt: at.toISOString(),
                  limitation: "Fictional ledger, not retrieved/live evidence.",
                },
              ]
            : [];
        })
      : packet.evidence;
  run.research.sources = entries.map((entry) => ({
    id: `web:${sha(entry.url).slice(0, 20)}`,
    url: entry.url,
    title: `${packet.company}: ${packet.mode}`,
    observedAt: entry.observedAt,
    sourceType: "PUBLIC_WEB" as const,
    excerpt:
      typeof packet.evidence === "string"
        ? `Fictional case: ${packet.company}\n${entry.quote}`
        : entry.quote,
  }));
  run.research.facts = entries.map((entry, i) => ({
    id: entry.id,
    statement: entry.statement,
    sourceIds: [run.research.sources[i].id],
    confidence: "HIGH",
    limitations: [entry.limitation],
    subject: "ACCOUNT",
    category: "DEVELOPMENT",
    quotes: [{ sourceId: run.research.sources[i].id, text: entry.quote }],
  }));
  run.research.gaps = [
    ...packet.limitations,
    "Internal hypothetical buyer only; no real-contact employment or email validity granted.",
  ];
  run.research = researchSchema.parse(run.research);
  return run;
}

// Existing provider's daily/monthly accounting interface, local to this finite process.
// The durable experiment journal is the authoritative cap; no IntegrationState/CRM writes.
class ExperimentDailyStore extends DailyStore {
  private state = initialDailyState();
  async get() {
    return structuredClone(this.state);
  }
  async change<T>(_actor: string, mutate: (state: DailyState) => T): Promise<T> {
    return mutate(this.state);
  }
}
export const experimentInstruction =
  " INTERNAL_EXPERIMENT_ONLY: all drafts are for a generic fictional buyer, never Stephanie or a real contact. " +
  "Supplied product knowledge is approved by Gil only for this experiment, not production EMAIL or external outreach. " +
  "Historical and fictional packets must retain their scope; no new research was performed. " +
  "Do not invent product proof or guarantees. In existing schemas approvedKnowledgeIds means experiment-permitted references only. " +
  "Never return sending/enrollment approval. Evaluate the actual writing independently.";

/** Facts/quotes already reach the writer in task.research. Keep source provenance
 * and screenshot scope without attaching the entire evidence packet a second time. */
export function experimentContext(
  stage: string,
  task: unknown,
  packet: Packet,
  sources: ReturnType<typeof prepareComparison>["sources"],
  compactReview = false,
) {
  if (compactReview && stage === "QUALITY_REVIEW") {
    const review = task as { strategy: unknown; sequence: { strategy: unknown } };
    // Remove only an identical repeated strategy, never hide a contradictory writer decision.
    if (JSON.stringify(review.strategy) === JSON.stringify(review.sequence.strategy)) {
      const { strategy: duplicate, ...sequence } = review.sequence;
      void duplicate;
      task = { ...review, sequence };
    }
  }
  return {
    task,
    experiment: {
      mode: MODE,
      ...(stage === "SEQUENCE" || (compactReview && stage === "QUALITY_REVIEW")
        ? { evidenceMode: packet.mode, screenshotObservation: packet.screenshotObservation }
        : { evidence: packet }),
      productSources: sources,
    },
  };
}

/** The only callable live entry. Requires fresh explicit approval, key and budget receipt. */
export async function executeComparison(options: {
  root: string;
  executionApproved: boolean;
  approvedBinding: string;
  apiKey: string;
  budgetReceipt: {
    checkedAt: string;
    dailyRemainingNanoUsd: number;
    monthlyRemainingNanoUsd: number;
    pendingRequests: number;
  };
  network?: typeof fetch;
  profile?: ExperimentProfile;
}) {
  if (!options.executionApproved) throw new Error("EXPERIMENT_EXECUTION_NOT_APPROVED");
  if (process.env.VERCEL || process.env.CI || process.env.NODE_ENV === "production")
    throw new Error("EXPERIMENT_LOCAL_ONLY");
  const profile = options.profile ?? "AB";
  if (!["AB", "NUTRAFOL_ONLY", "NUTRAFOL_CONTINUATION"].includes(profile))
    throw new Error("EXPERIMENT_PROFILE_INVALID");
  const continuation =
    profile === "NUTRAFOL_CONTINUATION" ? prepareNutrafolContinuation(options.root) : undefined;
  const single = profile !== "AB";
  const prepared =
    continuation ??
    (single ? prepareNutrafolDemonstration(options.root) : prepareComparison(options.root));
  if (prepared.binding !== options.approvedBinding) throw new Error("EXPERIMENT_BINDING_CHANGED");
  const actor = process.env.INTEGRATION_OPERATOR_USER_ID;
  if (!actor) throw new Error("EXPERIMENT_EXISTING_OPERATOR_REQUIRED");
  if (
    !options.apiKey ||
    options.budgetReceipt.pendingRequests !== 0 ||
    !Number.isFinite(Date.parse(options.budgetReceipt.checkedAt)) ||
    Date.now() - Date.parse(options.budgetReceipt.checkedAt) > 60_000 ||
    Date.parse(options.budgetReceipt.checkedAt) > Date.now()
  )
    throw new Error("EXPERIMENT_PREFLIGHT_REQUIRED");
  // Local receipt may not include the older experiment: conservatively subtract its
  // FULL retained reservation from both allowances, never refund or reuse it.
  const retained = continuation
    ? CONTINUATION_HISTORICAL_RESERVATION_NANO_USD
    : single
      ? HISTORICAL_RESERVATION_NANO_USD
      : 0;
  const receipt = {
    ...options.budgetReceipt,
    dailyRemainingNanoUsd: options.budgetReceipt.dailyRemainingNanoUsd - retained,
    monthlyRemainingNanoUsd: options.budgetReceipt.monthlyRemainingNanoUsd - retained,
  };
  mkdirSync(prepared.directory, { recursive: true });
  const budget = new ExperimentBudget(
    join(prepared.directory, "aggregate-spend.jsonl"),
    {
      executionApproved: true,
      binding: prepared.binding,
      ...receipt,
    },
    options.network,
    profile,
  );
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "development",
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: options.apiKey,
    OPENAI_MODEL: MODEL,
    OPENAI_WRITING_MODEL: MODEL,
    OPENAI_QUALITY_MODEL: MODEL,
    WORKFORCE_MODEL_PRICES_JSON: JSON.stringify({ [MODEL]: { input: 0.75, output: 4.5 } }),
  };
  const config = dailyConfig({
    NODE_ENV: "development",
    WORKFORCE_DAILY_BUDGET_USD: String(Math.min(1, receipt.dailyRemainingNanoUsd / 1e9)),
    WORKFORCE_MONTHLY_BUDGET_USD: String(Math.min(5, receipt.monthlyRemainingNanoUsd / 1e9)),
    WORKFORCE_MAX_RETRIES: "0",
    WORKFORCE_MAX_CONCURRENT_CALLS: "1",
  });
  const store = new ExperimentDailyStore();
  const rows: Record<string, unknown>[] = [];
  let finished = false;
  const save = () =>
    writeFileSync(
      join(
        prepared.directory,
        single ? "internal-writing-results.json" : "internal-blind-results.json",
      ),
      JSON.stringify(
        {
          mode: MODE,
          profile,
          binding: prepared.binding,
          completed: finished,
          approvedForOutreach: false,
          ...(continuation ? { reusedCheckpoint: continuation.checkpoint.files } : {}),
          reservedNanoUsd: budget.reservedNanoUsd,
          rows,
        },
        null,
        2,
      ),
    );
  try {
    for (const packet of prepared.packets) {
      const original = evidenceRun(packet);
      const issues = validateResearch(original, new Date(), { company: true, prospect: false });
      if (issues.length) {
        rows.push({ caseId: packet.id, status: "BLOCKED", issues });
        save();
        break;
      }
      let activeLabel = "shared";
      const model: WorkforceModel = {
        discover: async () => {
          throw new Error("EXPERIMENT_DISCOVERY_DENIED");
        },
        structured: (stage, schema, instruction, context, usage) =>
          withBudgetContext({ actor, store, config }, () =>
            new OpenAiWorkforceModel(
              env,
              budget.forSlot(`${packet.id}:${activeLabel}:${stage}`),
            ).structured(
              stage,
              schema,
              instruction + experimentInstruction,
              experimentContext(stage, context, packet, prepared.sources, !!continuation),
              usage,
            ),
          ),
      };
      const grounding =
        continuation?.checkpoint.grounding ??
        (await validateCompanyGroundingWithAi(original, model));
      const rejectionReasons = groundingRejectionReasons(
        grounding,
        original.research.facts,
        original.research.sources,
      );
      rows.push({
        caseId: packet.id,
        grounding,
        rejectionReasons,
        usage: structuredClone(original.usage),
        ...(continuation ? { execution: "REUSED_VERIFIED_CHECKPOINT_NOT_A_NEW_CALL" } : {}),
      });
      save();
      if (rejectionReasons.length) break;
      for (const label of (single ? ["A"] : ["A", "B"]) as ("A" | "B")[]) {
        activeLabel = label;
        const run = structuredClone(original);
        run.usage = [];
        const commercialBrief =
          single || prepared.blinds.find((b) => b.caseId === packet.id)![label] === "REVISED";
        run.strategy = continuation
          ? structuredClone(continuation.checkpoint.strategy)
          : await chooseSalesStrategy(run, model, { commercialBrief });
        const strategyIssues = strategyGroundingConcerns(run, run.strategy);
        if (
          run.strategy.prospectId !== run.id ||
          run.strategy.supportingFactIds.some((id) => !run.research.facts.some((f) => f.id === id))
        )
          throw new Error("EXPERIMENT_STRATEGY_IDENTITY_INVALID");
        if (run.strategy.angle === "NO_PITCH" || strategyIssues.length) {
          rows.push({
            caseId: packet.id,
            label: single ? "INTERNAL_ONLY" : label,
            status: "NO_PITCH",
            strategy: run.strategy,
            issues: strategyIssues,
            review: "NOT_EXECUTED",
            usage: run.usage,
          });
          save();
          continue;
        }
        const row: Record<string, unknown> = {
          caseId: packet.id,
          label: single ? "INTERNAL_ONLY" : label,
          status: "WRITING_PENDING",
          strategy: run.strategy,
          usage: run.usage,
          independentReview: "NOT_EXECUTED",
          factualGatePassed: false,
          humanRating: null,
          reviewSeconds: null,
          substantiveEdits: [],
        };
        rows.push(row);
        save();
        run.sequence = await generatePersonalSequence(run, model, { commercialBrief });
        run.issues = validateSequence(run, run.sequence);
        Object.assign(row, {
          status: "INDEPENDENT_REVIEW_PENDING",
          sequence: run.sequence,
          deterministicConcerns: run.issues,
        });
        save(); // first output survives an unavailable independent reviewer
        // Separate inference, same settings, no arm key/brief or opposite output.
        run.critic = await reviewSequenceWithAi(run, model, new Date());
        Object.assign(row, {
          status: "INTERNAL_REVIEW_REQUIRED",
          independentReview: run.critic,
          factualGatePassed:
            run.issues.length === 0 &&
            run.critic.unsupportedAssertions.length === 0 &&
            run.critic.checks.factualAccuracy &&
            run.critic.checks.sourceGrounding &&
            run.critic.checks.approvedClaimsOnly,
        });
        save();
      }
    }
    finished = single
      ? rows.some((r) => r.label === "INTERNAL_ONLY" && r.status === "INTERNAL_REVIEW_REQUIRED")
      : rows.filter((r) => r.label).length === 6;
    save();
    return { completed: finished, reservedNanoUsd: budget.reservedNanoUsd, paidExecution: true };
  } catch {
    rows.push({
      status: "STOPPED",
      reason: "See sanitized aggregate-spend.jsonl; no retry authorized",
    });
    save();
    throw new Error("EXPERIMENT_STOPPED_NO_RETRY");
  } finally {
    budget.close();
  }
}

/** Explicit one-company entry; no A/B arms, retry, new research or production imports. */
export function executeNutrafolDemonstration(
  options: Omit<Parameters<typeof executeComparison>[0], "profile">,
) {
  return executeComparison({ ...options, profile: "NUTRAFOL_ONLY" });
}

/** Distinct one-shot journal; only writing and independent review may dispatch. */
export function executeNutrafolContinuation(
  options: Omit<Parameters<typeof executeComparison>[0], "profile">,
) {
  return executeComparison({ ...options, profile: "NUTRAFOL_CONTINUATION" });
}
