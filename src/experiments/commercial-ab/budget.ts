/** Local experiment only. No production imports, database writes or automatic recovery. */
import { createHash } from "node:crypto";
import { openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { z } from "zod";

export const MODEL = "gpt-5.4-mini-2026-03-17";
export const CAP_NANO_USD = 1_000_000_000;
export const INPUT_LIMIT = 33_000;
export const OUTPUT_LIMITS = {
  EVIDENCE_VALIDATION: 4500,
  STRATEGY: 4500,
  SEQUENCE: 6000,
  QUALITY_REVIEW: 3500,
} as const;
export type Stage = keyof typeof OUTPUT_LIMITS;
const quotas: Record<Stage, number> = {
  EVIDENCE_VALIDATION: 3,
  STRATEGY: 6,
  SEQUENCE: 6,
  QUALITY_REVIEW: 6,
};
// Integer nanodollars; full uncached rates plus 2% headroom. Never refund reservations.
export const reserveCost = (stage: Stage) =>
  Math.ceil(((INPUT_LIMIT * 750 + OUTPUT_LIMITS[stage] * 4500) * 102) / 100);
export const MAX_RESERVED_NANO_USD = (Object.keys(quotas) as Stage[]).reduce(
  (sum, stage) => sum + quotas[stage] * reserveCost(stage),
  0,
);
export const NUTRAFOL_CAP_NANO_USD = 200_000_000;
export const NUTRAFOL_MAX_RESERVED_NANO_USD = (Object.keys(quotas) as Stage[]).reduce(
  (sum, stage) => sum + reserveCost(stage),
  0,
);
export const CONTINUATION_CAP_NANO_USD = 100_000_000;
export const CONTINUATION_STAGES = ["SEQUENCE", "QUALITY_REVIEW"] as const;
export const CONTINUATION_MAX_RESERVED_NANO_USD = CONTINUATION_STAGES.reduce(
  (sum, stage) => sum + reserveCost(stage),
  0,
);
export type ExperimentProfile = "AB" | "NUTRAFOL_ONLY" | "NUTRAFOL_CONTINUATION";

const bodySchema = z
  .object({
    model: z.literal(MODEL),
    store: z.literal(false),
    max_output_tokens: z.number().int(),
    reasoning: z.object({ effort: z.literal("low") }).strict(),
    instructions: z.string().min(1),
    input: z.string().min(1),
    text: z
      .object({
        format: z
          .object({
            type: z.literal("json_schema"),
            name: z.enum(["evidence_validation", "strategy", "sequence", "quality_review"]),
            strict: z.literal(true),
            schema: z.record(z.unknown()),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
const usageSchema = z.object({
  model: z.literal(MODEL),
  service_tier: z.literal("default"),
  status: z.literal("completed"),
  usage: z.object({
    input_tokens: z.number().int().nonnegative().max(INPUT_LIMIT),
    output_tokens: z.number().int().nonnegative(),
  }),
});
const countSchema = z.object({
  object: z.literal("response.input_tokens"),
  input_tokens: z.number().int().positive(),
});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export class ExperimentBudget {
  private fd: number;
  private busy = false;
  private halted = false;
  private spent = 0;
  private counts: Record<Stage, number> = {
    EVIDENCE_VALIDATION: 0,
    STRATEGY: 0,
    SEQUENCE: 0,
    QUALITY_REVIEW: 0,
  };
  private requests = new Set<string>();
  /**
   * Exclusive creation is also the cross-process lock. Never delete/reinitialize this
   * journal after an interruption. Existing/partial journals block a second execution.
   * Credentials, prompts and response content never enter this journal.
   */
  constructor(
    path: string,
    approval: {
      executionApproved: boolean;
      binding: string;
      dailyRemainingNanoUsd: number;
      monthlyRemainingNanoUsd: number;
    },
    private readonly network: typeof fetch = fetch,
    private readonly profile: ExperimentProfile = "AB",
  ) {
    if (!["AB", "NUTRAFOL_ONLY", "NUTRAFOL_CONTINUATION"].includes(profile))
      throw new Error("EXPERIMENT_PROFILE_INVALID");
    if (!approval.executionApproved || !/^[a-f0-9]{64}$/.test(approval.binding))
      throw new Error("EXPERIMENT_EXECUTION_NOT_APPROVED");
    for (const remaining of [approval.dailyRemainingNanoUsd, approval.monthlyRemainingNanoUsd])
      if (
        !Number.isSafeInteger(remaining) ||
        remaining <
          (profile === "NUTRAFOL_CONTINUATION"
            ? CONTINUATION_MAX_RESERVED_NANO_USD
            : profile === "NUTRAFOL_ONLY"
              ? NUTRAFOL_MAX_RESERVED_NANO_USD
              : MAX_RESERVED_NANO_USD)
      )
        throw new Error("EXPERIMENT_ACCOUNT_BUDGET_INSUFFICIENT");
    this.fd = openSync(path, "wx", 0o600);
    this.record({
      event: "OPEN",
      binding: approval.binding,
      capNanoUsd: this.cap,
      profile,
      mode: "INTERNAL_EXPERIMENT_ONLY",
      model: MODEL,
    });
  }
  private get cap() {
    if (this.profile === "NUTRAFOL_CONTINUATION") return CONTINUATION_CAP_NANO_USD;
    return this.profile === "NUTRAFOL_ONLY" ? NUTRAFOL_CAP_NANO_USD : CAP_NANO_USD;
  }
  private record(value: Record<string, unknown>) {
    const bytes = Buffer.from(JSON.stringify(value) + "\n");
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(this.fd, bytes, offset, bytes.length - offset);
      if (!written) throw new Error("EXPERIMENT_JOURNAL_WRITE_FAILED");
      offset += written;
    }
    fsyncSync(this.fd); // durable reservation must succeed BEFORE dispatch
  }
  get reservedNanoUsd() {
    return this.spent;
  }
  close() {
    this.halted = true;
    closeSync(this.fd);
  }
  readonly fetch: typeof fetch = (url, init) => this.dispatch(url, init);
  forSlot(slot: string): typeof fetch {
    if (
      !/^(nutrafol|lumatrail|harborledger):(shared|A|B):(EVIDENCE_VALIDATION|STRATEGY|SEQUENCE|QUALITY_REVIEW)$/.test(
        slot,
      )
    )
      throw new Error("EXPERIMENT_SLOT_INVALID");
    if (this.profile === "NUTRAFOL_ONLY" && !/^nutrafol:(shared|A):/.test(slot))
      throw new Error("EXPERIMENT_SLOT_INVALID");
    if (
      this.profile === "NUTRAFOL_CONTINUATION" &&
      !/^nutrafol:A:(SEQUENCE|QUALITY_REVIEW)$/.test(slot)
    )
      throw new Error("EXPERIMENT_SLOT_INVALID");
    return (url, init) => this.dispatch(url, init, slot);
  }
  private async dispatch(
    url: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
    slot?: string,
  ): Promise<Response> {
    if (this.halted || this.busy) throw new Error("EXPERIMENT_STOPPED_OR_BUSY");
    this.busy = true;
    let requestId: string | undefined;
    try {
      if (
        url !== "https://api.openai.com/v1/responses" ||
        init?.method !== "POST" ||
        init.redirect !== "error" ||
        typeof init.body !== "string"
      )
        throw new Error("EXPERIMENT_TRANSPORT_DENIED");
      const body = bodySchema.parse(JSON.parse(init.body));
      const stage = body.text.format.name.toUpperCase() as Stage;
      const quota = this.profile === "AB" ? quotas[stage] : 1;
      if (body.max_output_tokens !== OUTPUT_LIMITS[stage] || this.counts[stage] >= quota)
        throw new Error("EXPERIMENT_STAGE_LIMIT");
      if (
        this.profile !== "AB" &&
        (this.profile === "NUTRAFOL_CONTINUATION"
          ? CONTINUATION_STAGES
          : (Object.keys(quotas) as Stage[]))[
          Object.values(this.counts).reduce((a, b) => a + b, 0)
        ] !== stage
      )
        throw new Error("EXPERIMENT_STAGE_ORDER");
      // Reject request expansion and preserve the existing conservative byte bound.
      if (Buffer.byteLength(init.body, "utf8") + 4096 > INPUT_LIMIT)
        throw new Error("EXPERIMENT_INPUT_LIMIT");
      if (
        slot &&
        (slot.split(":")[2] !== stage ||
          (slot.split(":")[1] === "shared") !== (stage === "EVIDENCE_VALIDATION"))
      )
        throw new Error("EXPERIMENT_SLOT_INVALID");
      requestId = hash(slot ?? init.body);
      if (this.requests.has(requestId)) throw new Error("EXPERIMENT_REPLAY_DENIED");
      const reserve = reserveCost(stage);
      if (this.spent + reserve > this.cap) throw new Error("EXPERIMENT_AGGREGATE_CAP");
      // Verify actual model input serialization before generation, including JSON schema.
      // Counting endpoint performs no generation. No tools, images or hidden conversation.
      const counted = await this.network("https://api.openai.com/v1/responses/input_tokens", {
        method: "POST",
        redirect: "error",
        headers: init.headers,
        signal: init.signal,
        body: JSON.stringify({
          model: body.model,
          instructions: body.instructions,
          input: body.input,
          text: body.text,
          reasoning: body.reasoning,
          truncation: "disabled",
        }),
      });
      if (!counted.ok) throw new Error("EXPERIMENT_TOKEN_COUNT_FAILED");
      const count = countSchema.parse(await counted.json()).input_tokens;
      // Fixed 4,096-token allowance, NOT a claim that visible text counts all tokens.
      if (count + 4096 > INPUT_LIMIT) throw new Error("EXPERIMENT_INPUT_LIMIT");
      this.record({
        event: "RESERVED",
        requestId,
        stage,
        reserveNanoUsd: reserve,
        countedInputTokens: count,
        outputLimit: body.max_output_tokens,
      });
      this.requests.add(requestId);
      this.spent += reserve;
      this.counts[stage]++;
      const response = await this.network(url, {
        ...init,
        body: JSON.stringify({ ...body, service_tier: "default", truncation: "disabled" }),
      });
      if (!response.ok) throw new Error(`EXPERIMENT_HTTP_${response.status}`);
      const result = usageSchema.parse(await response.clone().json());
      if (
        result.usage.output_tokens > OUTPUT_LIMITS[stage] ||
        result.usage.input_tokens > count + 4096
      )
        throw new Error("EXPERIMENT_PROVIDER_BOUND_VIOLATION");
      const actual = result.usage.input_tokens * 750 + result.usage.output_tokens * 4500;
      if (actual > reserve) throw new Error("EXPERIMENT_PROVIDER_BOUND_VIOLATION");
      this.record({
        event: "USAGE",
        requestId,
        stage,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        actualNanoUsd: actual,
      });
      return response;
    } catch (error) {
      this.halted = true;
      const code =
        error instanceof Error && /^EXPERIMENT_[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : "EXPERIMENT_INVALID_OR_UNAVAILABLE_RESPONSE";
      // Even missing/malformed usage and interrupted output retain the full reservation.
      this.record({ event: "STOP", requestId, code, reservedNanoUsd: this.spent });
      throw new Error(code);
    } finally {
      this.busy = false;
    }
  }
}
