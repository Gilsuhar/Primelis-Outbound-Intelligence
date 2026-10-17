import { beforeEach, describe, expect, it, vi } from "vitest";
import { dailyHandlers } from "./handlers";
import { dailyConfig } from "./state";
import type { DailyContact, DailyRun } from "@/features/agent-workforce/daily/contracts";
import { collectedContact, observation } from "@/test/sales-agent-collection-fixtures";
import { initialRun } from "../store";
import { newResearch } from "../prospect-research/engine";
import { workforceIntake } from "@/test/workforce-fixtures";
const mocks = vi.hoisted(() => ({
  raw: [] as unknown[],
  eligibility: vi.fn(),
  verify: vi.fn(),
  researchGet: vi.fn(),
  enqueue: vi.fn(),
  researchAdvance: vi.fn(),
  retryResearch: vi.fn(),
  draftRead: vi.fn(),
  prepare: vi.fn(),
  draftAdvance: vi.fn(),
  priorDrafts: vi.fn(),
  mutate: vi.fn(),
  syncStart: vi.fn(),
  syncStep: vi.fn(),
  historyRecheck: vi.fn(async () => true),
  integrationGet: vi.fn(),
  integrationChange: vi.fn(),
}));
vi.mock("@/server/sales-agent/evidence-store", () => ({
  PrismaEvidenceStore: class {
    list = async () => mocks.raw;
    suppressionRecords = async () => [];
    find = async (_actor: string, id: string) =>
      mocks.raw.find(
        (s) => (s as { contact: { hubspotRecordId: string } }).contact.hubspotRecordId === id,
      );
  },
}));
vi.mock("@/server/integrations/store", () => ({
  PrismaIntegrationStore: class {
    get = mocks.integrationGet;
    change = mocks.integrationChange;
  },
}));
vi.mock("@/server/integrations/sync", () => ({
  IntegrationSync: class {
    start = mocks.syncStart;
    step = mocks.syncStep;
    refreshAfterVerification = mocks.historyRecheck;
    resume = vi.fn();
  },
}));
vi.mock("@/server/verification/service", () => ({ retryVerification: mocks.verify }));
vi.mock("../safety", () => ({ checkWorkforceEligibility: mocks.eligibility }));
vi.mock("../prospect-research/engine", async () => ({
  ...(await vi.importActual("../prospect-research/engine")),
  ProspectResearchEngine: class {
    enqueue = mocks.enqueue;
    advance = mocks.researchAdvance;
    retryFailed = mocks.retryResearch;
    store = { get: mocks.researchGet };
  },
}));
vi.mock("../draft-studio/engine", () => ({
  DraftStudioEngine: class {
    read = mocks.draftRead;
    prepare = mocks.prepare;
    advance = mocks.draftAdvance;
    mutate = mocks.mutate;
    store = { byContact: mocks.priorDrafts };
  },
}));
const config = dailyConfig({ NODE_ENV: "test" });
const fakeRun = (): DailyRun => ({
  id: "fictional-daily-run",
  key: "fictional-test",
  localDate: "2026-10-19",
  trigger: "MANUAL",
  status: "RUNNING",
  stage: "CONTACTS",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  finishedAt: null,
  lease: null,
  attempts: 0,
  nextAttemptAt: null,
  reason: null,
  estimatedUsd: 0,
  discovered: 0,
  deferred: 0,
  contacts: [],
  errors: [],
});
const contact = (stage: DailyContact["stage"] = "VERIFY_EMAIL"): DailyContact => ({
  id: collectedContact.hubspotRecordId,
  status: "WAITING",
  stage,
  attempts: 0,
  nextAttemptAt: null,
  decision: "HOLD",
  reasons: [],
  researchCompleted: false,
  draftPrepared: false,
});
const snapshot = () => ({
  version: 1,
  contact: { ...collectedContact, observedAt: new Date().toISOString() },
  observations: [observation("role", "Director of Paid Search")],
  blockers: [],
  collectedAt: new Date().toISOString(),
  provenanceAtCollection: [],
  providers: [{ provider: "HUBSPOT", status: "CONNECTED", message: "Fictional isolated test" }],
  integrationReceipts: { HUBSPOT: { jobId: "fictional-import", operation: "IMPORTED" } },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.raw = [snapshot()];
  mocks.eligibility.mockResolvedValue({ status: "READY", reasons: [], blockDrafting: false });
  mocks.priorDrafts.mockResolvedValue([]);
  mocks.verify.mockResolvedValue({ started: true });
  mocks.integrationGet.mockResolvedValue({
    state: { job: null, lastSuccessfulSync: null },
    version: 0,
    secret: null,
  });
  mocks.integrationChange.mockImplementation(
    async (_actor, _provider, update) =>
      (await update({ state: {}, version: 0, secret: null })).value,
  );
});
describe("daily pipeline adapters with fictional external records", () => {
  it("deduplicates strictly by HubSpot ID and excludes contacts outside fixed owner/intake scope", async () => {
    mocks.raw = [
      snapshot(),
      snapshot(),
      { ...snapshot(), contact: { ...collectedContact, ownerId: "someone-else" } },
    ];
    const result = await dailyHandlers(config).intake("actor", fakeRun(), 25);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts![0].id).toBe(collectedContact.hubspotRecordId);
  });
  it("enforces maximum contacts and records deferred actual records", async () => {
    mocks.raw = [
      snapshot(),
      { ...snapshot(), contact: { ...collectedContact, hubspotRecordId: "fictional-two" } },
    ];
    const result = await dailyHandlers(config).intake("actor", fakeRun(), 1);
    expect(result.contacts).toHaveLength(1);
    expect(result.deferred).toBe(1);
  });
  it("runs email and employment adapters separately before research", async () => {
    const handlers = dailyHandlers(config),
      c = contact();
    const first = await handlers.contact("actor", fakeRun(), c);
    expect(first.contact!.stage).toBe("VERIFY_EMPLOYMENT");
    expect(mocks.verify).toHaveBeenLastCalledWith("actor", c.id, "EMAIL", expect.any(String));
    const second = await handlers.contact("actor", fakeRun(), first.contact!);
    expect(second.contact!.stage).toBe("RESEARCH");
    expect(mocks.verify).toHaveBeenLastCalledWith("actor", c.id, "EMPLOYMENT", expect.any(String));
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("prepares review-only content for HOLD without changing eligibility", async () => {
    mocks.eligibility.mockResolvedValue({
      status: "HOLD",
      reasons: ["Authoritative complaints history unavailable"],
      blockDrafting: false,
    });
    mocks.prepare.mockResolvedValue({
      ...initialRun("actor", "insight", workforceIntake, new Date()),
      draftStudio: { qualityDecision: null },
    });
    mocks.draftAdvance.mockResolvedValue({ draftStudio: { nextRetryAt: null } });
    const result = await dailyHandlers(config).contact("actor", fakeRun(), {
      ...contact("DRAFT"),
      researchCompleted: true,
      researchId: "fictional-research",
    });
    expect(result.contact).toMatchObject({
      status: "RUNNING",
      decision: "HOLD",
      draftPrepared: false,
    });
    expect(mocks.prepare).toHaveBeenCalled();
  });
  it("rejects suppressed prospects before any verification or research call", async () => {
    mocks.eligibility.mockResolvedValue({
      status: "REJECTED",
      reasons: ["Suppressed"],
      blockDrafting: true,
    });
    const result = await dailyHandlers(config).contact("actor", fakeRun(), contact());
    expect(result.contact!.status).toBe("BLOCKED");
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("revalidates previous drafts and blocks confirmed invalid email before research", async () => {
    const raw = snapshot();
    raw.observations.push({
      ...observation("emailVerification", {
        status: "INVALID",
        independentlyVerified: true,
        emailMatchesCurrentRecord: true,
        businessEmailVerified: true,
      }),
      subjectEmail: raw.contact.email,
    });
    mocks.raw = [raw];
    const previous = initialRun(
      "actor",
      "old",
      { ...workforceIntake, hubspotRecordId: collectedContact.hubspotRecordId },
      new Date(),
    );
    Object.assign(previous, { draftStudio: { reviewStatus: "PENDING" } });
    mocks.priorDrafts.mockResolvedValue([previous]);
    mocks.draftRead.mockResolvedValue({ ...previous, status: "GENERATION_FAILED", sequence: null });
    mocks.eligibility.mockResolvedValue({
      status: "HOLD",
      reasons: ["Email changed after approval"],
      blockDrafting: true,
    });
    const result = await dailyHandlers(config).contact("actor", fakeRun(), contact("DRAFT"));
    expect(mocks.draftRead).toHaveBeenCalledWith("actor", previous.id);
    expect(result.contact!.draftPrepared).toBe(false);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("partial optional provider outages do not block independently completed research but do not claim full research", async () => {
    const research = initialRun("actor", "source", workforceIntake, new Date());
    research.prospectResearch = newResearch("0".repeat(64), new Date());
    for (const stage of Object.values(research.prospectResearch.stages)) stage.status = "COMPLETE";
    research.prospectResearch.stages.SIMILARWEB.status = "DATA_UNAVAILABLE";
    research.prospectResearch.stages.SERP.status = "DATA_UNAVAILABLE";
    research.prospectResearch.status = "PARTIAL";
    mocks.researchGet.mockResolvedValue(research);
    const result = await dailyHandlers(config).contact("actor", fakeRun(), {
      ...contact("RESEARCH"),
      researchId: research.id,
    });
    expect(result.contact).toMatchObject({
      stage: "DRAFT",
      researchCompleted: true,
      draftPrepared: false,
    });
    expect(mocks.draftAdvance).not.toHaveBeenCalled();
  });
  it("keeps incomplete synchronization incomplete", async () => {
    mocks.integrationGet.mockResolvedValue({
      state: { job: { id: "partial-job", status: "RUNNING" }, lastSuccessfulSync: null },
    });
    mocks.syncStart.mockResolvedValue({ id: "partial-job", status: "RUNNING" });
    const result = await dailyHandlers(config).sync("actor", fakeRun(), "HUBSPOT");
    expect(result.done).toBe(false);
    expect(result.syncJobId).toBe("partial-job");
  });
});
it("does not keep an exhausted research stage pending when configured retries exceed the adapter ceiling", async () => {
  const research = initialRun("actor", "source", workforceIntake, new Date());
  research.prospectResearch = newResearch("0".repeat(64), new Date());
  for (const stage of Object.values(research.prospectResearch.stages)) stage.status = "COMPLETE";
  Object.assign(research.prospectResearch.stages.COMPANY, { status: "FAILED", attempts: 3 });
  mocks.researchGet.mockResolvedValue(research);
  const result = await dailyHandlers({ ...config, maxRetries: 3 }).contact("actor", fakeRun(), {
    ...contact("RESEARCH"),
    researchId: research.id,
  });
  expect(result.contact!.stage).toBe("DRAFT");
  expect(result.contact!.researchCompleted).toBe(false);
  expect(mocks.researchAdvance).not.toHaveBeenCalled();
});
it("does not count a deferred retry as a provider research attempt", async () => {
  const research = initialRun("actor", "source", workforceIntake, new Date());
  research.prospectResearch = newResearch("0".repeat(64), new Date());
  for (const stage of Object.values(research.prospectResearch.stages)) stage.status = "COMPLETE";
  const retryAt = new Date(Date.now() + 60000).toISOString();
  Object.assign(research.prospectResearch.stages.COMPANY, {
    status: "FAILED",
    attempts: 1,
    retryAt,
  });
  mocks.researchGet.mockResolvedValue(research);
  const result = await dailyHandlers(config).contact("actor", fakeRun(), {
    ...contact("RESEARCH"),
    researchId: research.id,
  });
  expect(result.retryAt).toBe(retryAt);
  expect(mocks.researchAdvance).not.toHaveBeenCalled();
  expect(mocks.integrationChange).not.toHaveBeenCalled();
});
it("a run invalidated by changed evidence cannot loop through pending research", async () => {
  const research = initialRun("actor", "source", workforceIntake, new Date());
  research.prospectResearch = newResearch("0".repeat(64), new Date());
  research.prospectResearch.status = "STALE";
  mocks.researchGet.mockResolvedValue(research);
  const result = await dailyHandlers(config).contact("actor", fakeRun(), {
    ...contact("RESEARCH"),
    researchId: research.id,
  });
  expect(result.contact!.status).toBe("BLOCKED");
  expect(mocks.researchAdvance).not.toHaveBeenCalled();
});
