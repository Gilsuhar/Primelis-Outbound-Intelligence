// @vitest-environment node
import { describe, expect, it } from "vitest";
import { scanText } from "../../scripts/security/publication-scan.mjs";

describe("publication pattern scanning", () => {
  it.each(["eu1", "na1"])("detects low-entropy HubSpot shapes in %s fixtures without echoing them", region => {
    const value = ["pat", region, [8, 4, 4, 4, 12].map(size => "a".repeat(size)).join("-")].join("-");
    const findings = scanText("offline test fixture\n" + value);
    expect(findings).toEqual([{ rule: "hubspot-private-app-shape", line: 2 }]);
    expect(JSON.stringify(findings).includes(value)).toBe(false);
  });
  it.each(["eu1", "na1"])("accepts unmistakably synthetic non-UUID regional fixture %s", region => {
    expect(scanText(`pat-${region}-SYNTHETIC_NOT_A_CREDENTIAL`)).toEqual([]);
  });
  it("detects a GitHub token shape without relying on entropy", () => {
    expect(scanText("ghp_" + "a".repeat(36))).toEqual([{ rule: "github-token-shape", line: 1 }]);
  });
  it("detects PEM-shaped key material while distinguishing a non-base64 redaction fixture", () => {
    const wrap = (body: string) => "-----BEGIN " + "PRIVATE KEY-----\n" + body + "\n-----END " + "PRIVATE KEY-----";
    expect(scanText(wrap("A".repeat(64)))).toEqual([{ rule: "private-key-block-shape", line: 1 }]);
    expect(scanText(wrap("fictional-key"))).toEqual([]);
  });
});
