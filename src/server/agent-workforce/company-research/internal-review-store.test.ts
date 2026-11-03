// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
  access: vi.fn(),
  reader: vi.fn(),
}));
vi.mock("../public-sources", async (original) => ({
  ...(await original<typeof import("../public-sources")>()),
  readPublicSource: mocks.reader,
}));
vi.mock("node:fs/promises", () => mocks);
vi.mock("./config", () => ({ requireLocalCompanyAccess: mocks.access }));
import {
  createInternalReview,
  inspectReviewImage,
  listInternalReviews,
  persistAlicePublicEvidenceImport,
} from "./internal-review-store";
import { verifyReusableCompanyResearch } from "./automatic-execution";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.readdir.mockResolvedValue([]);
  mocks.stat.mockResolvedValue({ size: 1000 });
});
it("accepts a name alone or domain alone without any contact, model, or database", async () => {
  for (const company of ["A new company", "new-company.example"]) {
    const doc = await createInternalReview("actor", "localhost:3000", { company });
    expect(doc).toMatchObject({ company, review: null, image: null, owner: "actor" });
  }
  expect(mocks.writeFile).toHaveBeenCalledTimes(2);
  expect(mocks.writeFile.mock.calls[0][2]).toEqual({ flag: "wx" });
});
it("rejects attempts to submit clearance, a completed review, real-contact data, or image URLs", async () => {
  for (const extra of [
    { approved: true },
    { review: {} },
    { contact: "Real contact" },
    { imageUrl: "https://example.com/x.png" },
  ])
    await expect(
      createInternalReview("actor", "localhost:3000", { company: "Acme", ...extra }),
    ).rejects.toThrow();
  expect(mocks.writeFile).not.toHaveBeenCalled();
});
it("rejects an unavailable saved-research selection without falling back to research or writing a report", async () => {
  await expect(
    createInternalReview(
      "actor",
      "localhost:3000",
      {
        company: "nutrafol.com",
        reuseResearchId: "60d7aec5-b74f-4674-ba8c-383878702eb9",
      },
      true,
    ),
  ).rejects.toThrow("SAVED_RESEARCH_NOT_VERIFIED");
  expect(mocks.reader).not.toHaveBeenCalled();
  expect(mocks.writeFile).not.toHaveBeenCalled();
});
it("checks authorization and localhost before filesystem reads or writes", async () => {
  await expect(listInternalReviews("actor", "external.example")).rejects.toThrow(
    "LOCAL_COMPANY_ONLY",
  );
  mocks.access.mockImplementation(() => {
    throw new Error("LOCAL_COMPANY_ONLY");
  });
  await expect(
    createInternalReview("other", "localhost:3000", { company: "Acme" }),
  ).rejects.toThrow();
  expect(mocks.readdir).not.toHaveBeenCalled();
  expect(mocks.writeFile).not.toHaveBeenCalled();
});
it("rejects malformed, oversized, and executable image payloads", () => {
  for (const base64 of [
    "bad!",
    Buffer.from("<svg>not a screenshot</svg>").toString("base64"),
    Buffer.alloc(2_000_001).toString("base64"),
  ])
    expect(() => inspectReviewImage({ mime: "image/jpeg", base64 })).toThrow("INVALID_IMAGE");
});
it("preserves original image bytes and hashes without inventing market or timestamp", () => {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJj8AAAAASUVORK5CYII=";
  const image = inspectReviewImage({ mime: "image/png", base64 });
  expect(image.base64).toBe(base64);
  expect(image.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(Object.keys(image).sort()).toEqual(["base64", "mime", "sha256"]);
  expect(() => inspectReviewImage({ mime: "image/jpeg", base64 })).toThrow("INVALID_IMAGE");
});
it("checks stored image integrity, owner and document identity before returning it", async () => {
  const doc = await createInternalReview("actor", "localhost:3000", { company: "Acme" });
  mocks.readdir.mockResolvedValue([`${doc.id}.json`]);
  mocks.readFile.mockResolvedValue(JSON.stringify(doc));
  expect(await listInternalReviews("actor", "localhost:3000")).toHaveLength(1);
  mocks.readFile.mockResolvedValue(JSON.stringify({ ...doc, owner: "other" }));
  expect(await listInternalReviews("actor", "localhost:3000")).toEqual([]);
  mocks.readFile.mockResolvedValue(
    JSON.stringify({
      ...doc,
      image: { mime: "image/jpeg", base64: "AAAA", sha256: "a".repeat(64) },
    }),
  );
  expect(await listInternalReviews("actor", "localhost:3000")).toEqual([]);
});
it("preserves supplied profile text as unverified provenance and rejects changed local evidence", async () => {
  const text =
    "\nGlobal One Search Lead. " + "User-supplied professional profile context. ".repeat(3) + "\n";
  const doc = await createInternalReview("actor", "localhost:3000", {
    company: "swarovski.com",
    profile: { name: "Alice De Benetti", text },
  });
  expect(doc.suppliedProfile).toMatchObject({
    name: "Alice De Benetti",
    source: "PASTED_TEXT",
    value: text,
    status: "USER_SUPPLIED_UNVERIFIED",
  });
  expect(doc.suppliedProfile?.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(doc.automatic).toBeUndefined();
  mocks.readdir.mockResolvedValue([`${doc.id}.json`]);
  mocks.readFile.mockResolvedValue(JSON.stringify(doc));
  expect(await listInternalReviews("actor", "localhost:3000")).toHaveLength(1);
  mocks.readFile.mockResolvedValue(
    JSON.stringify({ ...doc, suppliedProfile: { ...doc.suppliedProfile, value: "tampered" } }),
  );
  expect(await listInternalReviews("actor", "localhost:3000")).toEqual([]);
  expect(mocks.writeFile).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
    flag: "wx",
  });
});
it("persists Alice source captures as pending source reports and never exposes them as reusable grounded research", async () => {
  const doc = await persistAlicePublicEvidenceImport(
    "actor",
    "localhost:3000",
    new Date("2026-10-22T10:00:00.000Z"),
  );
  expect(doc.importedEvidence).toMatchObject({
    kind: "PUBLIC_EVIDENCE_IMPORT",
    status: "PENDING_INDEPENDENT_GROUNDING",
    aliceCurrentEmployment: "UNKNOWN",
    aliceCurrentTitle: "UNKNOWN",
    aliceCurrentResponsibilities: "UNKNOWN",
  });
  expect(doc.importedEvidence?.sources).toHaveLength(3);
  expect(doc.importedEvidence?.sourceReports).toHaveLength(4);
  expect(
    doc.importedEvidence?.sourceReports.every(
      (report) => report.status === "SOURCE_REPORTED_UNVERIFIED",
    ),
  ).toBe(true);
  expect(doc.automatic).toBeUndefined();
  expect(doc.review).toBeNull();
  expect(mocks.writeFile).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
    flag: "wx",
  });
  const saved = JSON.parse(mocks.writeFile.mock.calls.at(-1)![1] as string);
  mocks.readdir.mockResolvedValue([`${doc.id}.json`]);
  mocks.readFile.mockResolvedValue(JSON.stringify(saved));
  const listed = await listInternalReviews("actor", "localhost:3000");
  expect(listed[0].importedEvidence?.sources).toHaveLength(3);
  expect(() => verifyReusableCompanyResearch(listed[0], "actor", "Swarovski")).toThrow(
    "SAVED_RESEARCH_NOT_VERIFIED",
  );
  mocks.readFile.mockResolvedValue(
    JSON.stringify({
      ...saved,
      importedEvidence: {
        ...saved.importedEvidence,
        sources: [
          { ...saved.importedEvidence.sources[0], excerpt: "tampered" },
          ...saved.importedEvidence.sources.slice(1),
        ],
      },
    }),
  );
  expect(await listInternalReviews("actor", "localhost:3000")).toEqual([]);
});
it("bounds history and does not overwrite existing local work", async () => {
  mocks.readdir.mockResolvedValue(Array.from({ length: 25 }, (_, i) => `${i}.json`));
  await expect(
    createInternalReview("actor", "localhost:3000", { company: "Acme" }),
  ).rejects.toThrow("REVIEW_LIMIT");
  expect(mocks.writeFile).not.toHaveBeenCalled();
});
it("executes retrieval and persists the returned source, without any manually assembled review", async () => {
  mocks.reader.mockResolvedValue({
    url: "https://example.com/",
    title: "Fictional fixture",
    text: "Fictional company context. ".repeat(10),
  });
  const doc = await createInternalReview(
    "actor",
    "localhost:3000",
    { company: "example.com" },
    true,
  );
  expect(mocks.reader).toHaveBeenCalledTimes(1);
  expect(mocks.reader).toHaveBeenCalledWith("https://example.com/");
  expect(doc.review).toBeNull();
  expect(doc.execution?.sources).toHaveLength(1);
  expect(JSON.parse(mocks.writeFile.mock.calls[0][1]).execution).toEqual(doc.execution);
  mocks.readdir.mockResolvedValue([`${doc.id}.json`]);
  mocks.readFile.mockResolvedValue(JSON.stringify(doc));
  expect((await listInternalReviews("actor", "localhost:3000"))[0].execution).toEqual(
    doc.execution,
  );
  mocks.readFile.mockResolvedValue(
    JSON.stringify({
      ...doc,
      execution: {
        ...doc.execution,
        sources: [{ ...doc.execution!.sources[0], text: "tampered ".repeat(20) }],
      },
    }),
  );
  expect(await listInternalReviews("actor", "localhost:3000")).toEqual([]);
});
it("blocks concurrent retrieval and releases its local lock after completion", async () => {
  let finish!: (value: { url: string; title: string; text: string }) => void;
  mocks.reader.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = createInternalReview("actor", "localhost:3000", { company: "example.com" }, true);
  await vi.waitFor(() => expect(mocks.reader).toHaveBeenCalledTimes(1));
  await expect(
    createInternalReview("actor", "localhost:3000", { company: "example.com" }, true),
  ).rejects.toThrow("RESEARCH_BUSY");
  finish({ url: "https://example.com/", title: "Fixture", text: "Fictional text ".repeat(10) });
  await first;
  await expect(
    createInternalReview("actor", "localhost:3000", { company: "Name only" }, true),
  ).resolves.toBeTruthy();
});
