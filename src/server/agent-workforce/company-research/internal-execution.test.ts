// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { executeInternalResearch } from "./internal-execution";

const text =
  "Fictional fixture only. Acme sells inventory management software for retailers. No paid-search, competitor or savings evidence is supplied.";
it("retrieves actual reader text once, preserves provenance, and blocks unsupported reasoning", async () => {
  const reader = vi
    .fn()
    .mockResolvedValue({ url: "https://acme.example/", title: "Fictional Acme", text });
  const result = await executeInternalResearch("acme.example", false, reader);
  expect(reader).toHaveBeenCalledTimes(1);
  expect(reader).toHaveBeenCalledWith("https://acme.example/");
  expect(result.sources[0]).toMatchObject({
    text,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
  expect(result).toMatchObject({
    status: "BLOCKED",
    approved: false,
    grounding: "NOT_RUN",
    independentQuality: "NOT_RUN",
    canSend: false,
    canEnroll: false,
  });
  expect(result.stages.find((s) => s.stage === "PUBLIC_RETRIEVAL")?.status).toBe("COMPLETED");
  expect(result.stages.find((s) => s.stage === "ANGLES_AND_DRAFTS")?.code).toBe(
    "NO_AUTHORIZED_INFERENCE",
  );
  expect(result).not.toHaveProperty("emails");
});
it("never guesses domains or retrieves IPs, action URLs, social profiles or embedded credentials", async () => {
  const reader = vi.fn();
  for (const input of [
    "Nutrafol",
    "A real company",
    "http://example.com",
    "127.0.0.1",
    "2130706433",
    "169.254.169.254",
    "example.local",
    "https://user:secret@example.com",
    "https://example.com/?token=x",
    "https://example.com/action",
    "https://linkedin.com",
    "https://example.com/#x",
  ]) {
    const result = await executeInternalResearch(input, false, reader);
    expect(result.sources).toEqual([]);
    expect(result.stages[0].code).toBe("PUBLIC_DOMAIN_REQUIRED");
  }
  expect(reader).not.toHaveBeenCalled();
});
it("retains supplied-image blocker without inferring advertisers, country or capture context", async () => {
  const result = await executeInternalResearch("Company", true, vi.fn());
  expect(result.stages.find((s) => s.stage === "SCREENSHOT_ANALYSIS")?.code).toBe(
    "IMAGE_INTERPRETER_UNAVAILABLE",
  );
  expect(result).not.toHaveProperty("advertisers");
});
it("surfaces safe transport codes without retries and never stores arbitrary error contents", async () => {
  for (const message of [
    "SOURCE_REDIRECT",
    "SOURCE_TOO_LARGE",
    "SOURCE_TLS",
    "SOURCE_DNS_NOT_PUBLIC",
    "PUBLIC_SOURCE_PROXY_UNSUPPORTED",
    "secret raw upstream error",
  ]) {
    const reader = vi.fn().mockRejectedValue(new Error(message));
    const result = await executeInternalResearch("example.com", false, reader);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(result.sources).toEqual([]);
    expect(result.stages[1].code).toBe(
      message.startsWith("secret") ? "SOURCE_UNAVAILABLE" : message,
    );
    expect(JSON.stringify(result)).not.toContain("secret raw");
  }
});
it("rejects changed source identity and malformed extracted text", async () => {
  for (const page of [
    { url: "https://unrelated.example/", title: "Other", text },
    { url: "https://example.com/", title: "Tiny", text: "too short" },
    { url: "https://example.com/", title: "Huge", text: "x".repeat(18001) },
  ]) {
    const result = await executeInternalResearch(
      "example.com",
      false,
      vi.fn().mockResolvedValue(page),
    );
    expect(result.sources).toEqual([]);
    expect(result.stages[1].code).toBe("SOURCE_CONTENT_REJECTED");
  }
});
