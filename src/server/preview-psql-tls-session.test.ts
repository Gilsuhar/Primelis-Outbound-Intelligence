// @vitest-environment node
import { EventEmitter } from "node:events";
import type { spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runTlsSession, validateClientTlsReport, clientFailureCategory, clientDiagnostic } from "../../scripts/preview/psql-tls-session.mjs";
import { connectionFiles } from "../../scripts/preview/provision-runtime-role.mjs";
import { readFileSync } from "node:fs";

const settings = connectionFiles("postgresql://postgres.txfxfrlhtvzwgluhnbpw:synthetic-only@aws-1-us-west-2.pooler.supabase.com:5432/postgres").env;
const report = 'You are connected to database "postgres" as user "postgres.txfxfrlhtvzwgluhnbpw" on host "aws-1-us-west-2.pooler.supabase.com" (address "192.0.2.1") at port "5432".\nSSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, compression: off, ALPN: none)';
const marker = "\nPREVIEW_CLIENT_TLS_CHECK_END\n";
const sql = readFileSync("scripts/preview/runtime-role.sql", "utf8");
function transport() {
  const child = Object.assign(new EventEmitter(), {
    stdin: Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn(), destroy: vi.fn() }),
    stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(),
  });
  const start = vi.fn(() => child);
  return { child, start: start as unknown as typeof spawn, mock: start };
}
afterEach(() => vi.useRealTimers());

describe("same-connection libpq TLS evidence before releasing SQL", () => {
  it.each([
    ['server certificate for "private.invalid" does not match host name "other.invalid"', "TLS_HOSTNAME"],
    ["SSL error: certificate verify failed", "TLS_CERTIFICATE"],
    ["root certificate file private-path does not exist", "TLS_CERTIFICATE"],
    ["self-signed certificate", "TLS_CERTIFICATE"],
    ["could not translate host name private.invalid", "CONNECTION_DNS"],
    ["connection timed out", "CONNECTION_TIMEOUT"],
    ["Connection refused", "CONNECTION_TCP"],
    ["password authentication failed for user private-user", "CONNECTION_AUTHENTICATION"],
    ["SSL error: handshake failed", "TLS_HANDSHAKE"],
    ['psql:<stdin>:80: ERROR:  42809: "private-relation" is not a sequence', "SQL_WRONG_OBJECT_TYPE"],
    ["ERROR: 42501: permission denied private", "SQL_PERMISSION"],
    ["ERROR: 25006: read-only transaction private", "SQL_READ_ONLY"],
    ["ERROR: 42601: syntax error private", "SQL_SYNTAX"],
    ["ERROR: P0001: private guard", "SQL_GUARD_REJECTED"],
    ["FATAL: 08006: private", "CONNECTION_LOST"],
    ["private unknown output", "CLIENT_EXIT"],
  ])("classifies private errors without disclosing details %#", (stderr, category) => {
    expect(clientFailureCategory(stderr)).toBe(category);
  });
  it("allows only fixed diagnostic fields at the log boundary", () => {
    expect(clientDiagnostic({ category: "private", phase: "private", sqlReleased: "private", stderr: "private" }))
      .toEqual({ category: "UNCLASSIFIED", phase: "BEFORE_SQL", sqlReleased: "UNKNOWN" });
  });
  it("classifies certificate rejection before SQL is released", async () => {
    const t = transport(), pending = runTlsSession([], settings, sql, t.start).catch(e => e);
    t.child.stderr.emit("data", Buffer.from("SSL error: certificate verify failed private"));
    t.child.emit("close", 2, null);
    expect(clientDiagnostic(await pending)).toEqual({ category: "TLS_CERTIFICATE", phase: "BEFORE_SQL", sqlReleased: false });
    expect(t.child.stdin.end).not.toHaveBeenCalled();
  });
  it("retains uncertainty when a process error follows SQL release", async () => {
    const t = transport(), pending = runTlsSession([], settings, sql, t.start).catch(e => e);
    t.child.stdout.emit("data", Buffer.from(report + marker));
    t.child.emit("error", new Error("private process failure"));
    expect(clientDiagnostic(await pending)).toEqual({ category: "PROCESS_EXECUTION", phase: "BEFORE_SQL", sqlReleased: true });
    expect(t.mock).toHaveBeenCalledOnce();
  });
  it("distinguishes client output parsing from connection failure", async () => {
    const t = transport(), pending = runTlsSession([], settings, sql, t.start).catch(e => e);
    t.child.stdout.emit("data", Buffer.from("malformed report" + marker));
    expect(clientDiagnostic(await pending).category).toBe("TLS_OUTPUT_PARSING");
    expect(t.child.stdin.end).not.toHaveBeenCalled();
  });
  it.each(["TLSv1.2", "TLSv1.3"])("accepts pinned-client evidence for %s", protocol => {
    expect(validateClientTlsReport(report.replace("TLSv1.3", protocol), settings)).toBe("VERIFIED");
    expect(validateClientTlsReport(report.replace(' (address "192.0.2.1")', ""), settings)).toBe("VERIFIED");
  });
  it.each([
    report.split("\n")[0], report.replace("TLSv1.3", "TLSv1.1"), report.replace("compression: off", "compression: on"),
    report.replace("5432", "6543"), report.replace("pooler.supabase.com", "invalid.example"), report + "\n" + report,
    report.replace("192.0.2.1", "not-an-ip"), "", "private error",
  ])("rejects missing, ambiguous or wrong TLS evidence %#", value => {
    expect(() => validateClientTlsReport(value, settings)).toThrow(/^PREVIEW_ROLE_CLIENT_TLS_EVIDENCE$/);
  });
  it.each<Record<string, string>>([
    { PGSSLMODE: "require" }, { PGSSLROOTCERT: "/untrusted.crt" }, { PGGSSENCMODE: "prefer" },
    { PGSSLMINPROTOCOLVERSION: "TLSv1" }, { PGHOST: "production.invalid" }, { PGPORT: "6543" },
  ])("rejects weakening actual connection configuration %#", override => {
    expect(() => validateClientTlsReport(report, { ...settings, ...override })).toThrow("CLIENT_TLS_EVIDENCE");
  });
  it("withholds all SQL until complete evidence, uses one connection, and discards raw conninfo", async () => {
    const t = transport(), pending = runTlsSession([], settings, sql, t.start);
    expect(t.child.stdin.write).toHaveBeenCalledOnce();
    expect(t.child.stdin.write).toHaveBeenCalledWith("\\conninfo\n\\echo PREVIEW_CLIENT_TLS_CHECK_END\n");
    expect(t.child.stdin.end).not.toHaveBeenCalled();
    t.child.stdout.emit("data", Buffer.from(report.slice(0, 40)));
    expect(t.child.stdin.end).not.toHaveBeenCalled();
    t.child.stdout.emit("data", Buffer.from(report.slice(40) + marker));
    expect(t.child.stdin.end).toHaveBeenCalledOnce(); expect(t.child.stdin.end).toHaveBeenCalledWith(sql);
    t.child.stdout.emit("data", Buffer.from('{"backendTls":"REPORTED_NO_TLS"}\n'));
    t.child.emit("close", 0, null);
    expect(await pending).toEqual({ status: 0, signal: null, clientTls: "VERIFIED", stdout: '{"backendTls":"REPORTED_NO_TLS"}\n', stderr: "" });
    expect(t.mock).toHaveBeenCalledOnce();
  });
  it.each(["invalid certificate", "wrong certificate hostname", "untrusted CA"])("cannot reach role SQL after libpq fails: %s", error => {
    const t = transport(), pending = runTlsSession([], settings, sql, t.start);
    t.child.stderr.emit("data", Buffer.from(`private libpq ${error}`)); t.child.emit("close", 2, null);
    expect(t.child.stdin.end).not.toHaveBeenCalled();
    return expect(pending).rejects.toThrow(/^PREVIEW_ROLE_CLIENT_TLS_EVIDENCE$/);
  });
  it.each([report.split("\n")[0] + marker, report.replace("TLSv1.3", "TLSv1.1") + marker, report + marker + "unexpected"])("kills client without releasing SQL on invalid report %#", async value => {
    const t = transport(), pending = runTlsSession([], settings, sql, t.start);
    t.child.stdout.emit("data", Buffer.from(value));
    await expect(pending).rejects.toThrow("CLIENT_TLS_EVIDENCE");
    expect(t.child.stdin.end).not.toHaveBeenCalled(); expect(t.child.kill).toHaveBeenCalledWith("SIGKILL");
  });
  it("stops without retry or SQL when the evidence marker never arrives", async () => {
    vi.useFakeTimers(); const t = transport();
    const pending = runTlsSession([], settings, sql, t.start).catch(e => e);
    t.child.stdout.emit("data", Buffer.from(report));
    await vi.advanceTimersByTimeAsync(180000);
    expect((await pending).message).toBe("PREVIEW_ROLE_CLIENT_TLS_EVIDENCE");
    expect(t.child.stdin.end).not.toHaveBeenCalled(); expect(t.mock).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("fails closed on process/pipe errors and bounded output", async () => {
    for (const event of ["error", "pipe", "overflow"] as const) {
      const t = transport(), pending = runTlsSession([], settings, sql, t.start);
      if (event === "error") t.child.emit("error", new Error("private"));
      if (event === "pipe") t.child.stdin.emit("error", new Error("private"));
      if (event === "overflow") t.child.stdout.emit("data", Buffer.from("x".repeat(16385)));
      await expect(pending).rejects.toThrow(/^PREVIEW_ROLE_CLIENT_TLS_EVIDENCE$/);
      expect(t.child.stdin.end).not.toHaveBeenCalled();
    }
  });
});
