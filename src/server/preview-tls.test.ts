// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import { caPath, prismaTlsUrl, verifiedCa } from "../../scripts/preview/tls-trust.mjs";
import { probeTls, tlsFailureCategory } from "../../scripts/preview/tls-probe.mjs";
import { diagnoseTls } from "../../scripts/preview/diagnose-tls.mjs";

const endpoint = new URL("postgresql://aws-1-us-west-2.pooler.supabase.com:5432");
function transport() {
  const socket = Object.assign(new EventEmitter(), { write: vi.fn(), destroy: vi.fn() });
  const secured = Object.assign(new EventEmitter(), { destroy: vi.fn(), authorized: true,
    getProtocol: (): string => "TLSv1.3", getPeerCertificate: () => ({ subjectaltname: "DNS:*.pooler.supabase.com" }) });
  return { socket, secured, connect: vi.fn<(options: Record<string, unknown>) => typeof socket>(() => socket),
    secure: vi.fn<(options: Record<string, unknown>) => typeof secured>(() => secured) };
}
afterEach(() => vi.useRealTimers());

describe("pinned public Supabase CA", () => {
  it("accepts the reviewed public CA, rejecting other roots and appended certificates", () => {
    const pem = readFileSync(caPath);
    expect(verifiedCa().equals(pem)).toBe(true);
    for (const value of [Buffer.from("invalid"), Buffer.from(rootCertificates[0]), Buffer.concat([pem, pem])])
      expect(() => verifiedCa(() => value)).toThrow("CA_REJECTED");
  });
  it.each([0, Date.UTC(2032, 0, 1)])("rejects not-yet-valid or expired trust anchors", now => {
    expect(() => verifiedCa(undefined, now)).toThrow("CA_REJECTED");
  });
  it("does not expose read errors", () => {
    expect(() => verifiedCa(() => { throw new Error("private-value"); })).toThrow(/^PREVIEW_SETUP_CA_REJECTED$/);
  });
  it("adds only the pinned Prisma CA path and preserves encoded credentials and strict settings", () => {
    const input = "postgresql://postgres.synthetic:test%40value%3Aencoded@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=strict";
    const url = new URL(prismaTlsUrl(input));
    const original = new URL(input);
    expect(url.username).toBe(original.username); expect(url.password).toBe(original.password);
    expect(url.host).toBe(original.host); expect(url.pathname).toBe(original.pathname);
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("sslaccept")).toBe("strict");
    expect(url.searchParams.get("sslcert")).toBe(caPath);
    expect([...url.searchParams.keys()].sort()).toEqual(["sslaccept", "sslcert", "sslmode"]);
  });
  it.each(["", "?sslmode=require", "?sslmode=prefer&sslaccept=strict", "?sslmode=require&sslaccept=accept_invalid_certs",
    "?sslmode=require&sslaccept=strict&sslcert=unapproved", "?sslmode=require&sslaccept=strict&sslmode=require"])("rejects modified trust configuration %s", query => {
    expect(() => prismaTlsUrl(`postgresql://${endpoint.host}/postgres${query}`)).toThrow("CONFIGURATION_REJECTED");
  });
});

describe("sanitized strict TLS diagnostics", () => {
  it.each([
    ["ENOTFOUND", "DNS_NOT_FOUND", false], ["EAI_AGAIN", "DNS_TEMPORARY_FAILURE", false],
    ["ECONNREFUSED", "TCP_REFUSED", false], ["ENETUNREACH", "NETWORK_UNREACHABLE", false],
    ["EHOSTUNREACH", "NETWORK_UNREACHABLE", false], ["ECONNRESET", "CONNECTION_RESET", false],
    ["SELF_SIGNED_CERT_IN_CHAIN", "CERT_CHAIN_UNTRUSTED", true],
    ["DEPTH_ZERO_SELF_SIGNED_CERT", "CERT_CHAIN_UNTRUSTED", true],
    ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_CHAIN_UNTRUSTED", true],
    ["UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_CHAIN_UNTRUSTED", true],
    ["CERT_HAS_EXPIRED", "CERT_EXPIRED", true], ["CERT_NOT_YET_VALID", "CERT_NOT_YET_VALID", true],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "HOSTNAME_MISMATCH", true],
    ["ERR_SSL_WRONG_VERSION_NUMBER", "TLS_HANDSHAKE_FAILED", true],
    ["ETIMEDOUT", "TLS_TIMEOUT", true], ["ETIMEDOUT", "DNS_TIMEOUT", false],
    ["private-value", "DNS_FAILED", false],
  ])("maps %s to fixed category %s", async (code, category, secure) => {
    const t = transport();
    const pending = probeTls(endpoint, t).catch(error => error);
    if (secure) { t.socket.emit("connect"); t.socket.emit("data", Buffer.from("S")); }
    (secure ? t.secured : t.socket).emit("error", Object.assign(new Error("private-value"), { code }));
    const error = await pending;
    expect(error.message).toBe("PREVIEW_SETUP_TLS_CONNECTIVITY_FAILED");
    expect(tlsFailureCategory(error)).toBe(category);
    expect(JSON.stringify(error)).not.toContain("private-value");
    expect(t.socket.destroy).toHaveBeenCalledOnce(); expect(t.connect).toHaveBeenCalledOnce();
  });
  it.each(["DNS", "TCP", "SSL_RESPONSE", "TLS"])("reports timeout phase %s", async phase => {
    vi.useFakeTimers(); const t = transport();
    const pending = probeTls(endpoint, t).catch(error => error);
    if (phase === "TCP") t.socket.emit("lookup", null);
    if (["SSL_RESPONSE", "TLS"].includes(phase)) t.socket.emit("connect");
    if (phase === "TLS") t.socket.emit("data", Buffer.from("S"));
    await vi.advanceTimersByTimeAsync(10001);
    expect(tlsFailureCategory(await pending)).toBe(`${phase}_TIMEOUT`);
  });
  it.each(["N", "SS", ""])("rejects malformed or negative SSL response", async response => {
    const t = transport(); const pending = probeTls(endpoint, t).catch(error => error);
    t.socket.emit("data", Buffer.from(response));
    expect(tlsFailureCategory(await pending)).toBe("SSL_RESPONSE_REJECTED"); expect(t.secure).not.toHaveBeenCalled();
  });
  it.each(["connect", "secure"] as const)("sanitizes synchronous %s exceptions and cleans timers", async boundary => {
    vi.useFakeTimers(); const t = transport();
    t[boundary].mockImplementation(() => { throw Object.assign(new Error("private-value"), { code: "ECONNRESET" }); });
    const pending = probeTls(endpoint, t).catch(error => error);
    if (boundary === "secure") t.socket.emit("data", Buffer.from("S"));
    expect(tlsFailureCategory(await pending)).toBe("CONNECTION_RESET"); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["end", "close"])("rejects premature %s without waiting for timeout", async event => {
    const t = transport(); const pending = probeTls(endpoint, t).catch(error => error);
    t.socket.emit(event); expect(tlsFailureCategory(await pending)).toBe("CONNECTION_CLOSED");
  });
  it.each(["hostname", "unauthorized", "protocol"])("still rejects %s", async failure => {
    const t = transport(); const pending = probeTls(endpoint, t).catch(error => error);
    if (failure === "hostname") t.secured.getPeerCertificate = () => ({ subjectaltname: "DNS:wrong.invalid" });
    if (failure === "unauthorized") t.secured.authorized = false;
    if (failure === "protocol") t.secured.getProtocol = () => "TLSv1.1";
    t.socket.emit("data", Buffer.from("S")); t.secured.emit("secureConnect");
    expect(tlsFailureCategory(await pending)).toBe({ hostname: "HOSTNAME_MISMATCH", unauthorized: "CERT_VALIDATION_FAILED", protocol: "TLS_PROTOCOL_REJECTED" }[failure]);
  });
  it.each(["--system-trust", "--pinned-ca"])("diagnoses safely using %s", async mode => {
    const t = transport(); const pending = diagnoseTls(mode, t);
    t.socket.emit("connect"); t.socket.emit("data", Buffer.from("S")); t.secured.emit("secureConnect");
    expect(await pending).toEqual({ status: "VERIFIED", dns: "RESOLVED", tcp: "CONNECTED", sslRequest: "ACCEPTED", tls: "CHAIN_AND_HOSTNAME_VERIFIED" });
    expect(t.connect).toHaveBeenCalledWith({ host: endpoint.hostname, port: 5432, autoSelectFamily: false });
    const options = t.secure.mock.calls[0][0];
    expect(options).toMatchObject({ servername: endpoint.hostname, rejectUnauthorized: true, minVersion: "TLSv1.2" });
    expect(options.ca).toEqual(mode === "--pinned-ca" ? verifiedCa() : undefined);
    expect(t.socket.write).toHaveBeenCalledOnce();
    const bytes = t.socket.write.mock.calls[0][0] as Buffer;
    expect(bytes.length).toBe(8); expect(bytes.readInt32BE(0)).toBe(8); expect(bytes.readInt32BE(4)).toBe(80877103);
  });
  it("rejects diagnostic arguments without any network call", async () => {
    const t = transport(); expect(await diagnoseTls("private-value", t)).toEqual({ status: "ARGUMENT_REJECTED" });
    expect(t.connect).not.toHaveBeenCalled(); expect(tlsFailureCategory({ category: "private-value" })).toBe("PROBE_INTERNAL_ERROR");
  });
});
