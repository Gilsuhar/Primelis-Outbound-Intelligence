// @vitest-environment node
// Fictional loopback PostgreSQL wire peer only. No database or SQL execution.
import { beforeAll, expect, it } from "vitest";
import { createServer, type Socket } from "node:net";
import { createSecureContext, TLSSocket, rootCertificates } from "node:tls";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

let cert: string, key: string, certificatePath: string, untrustedCaPath: string;
beforeAll(() => {
  mkdirSync("outputs", { recursive: true });
  const directory = mkdtempSync(resolve("outputs/fictional-tls-"));
  certificatePath = join(directory, "fictional-localhost-cert.pem");
  untrustedCaPath = join(directory, "unrelated-public-roots.pem");
  writeFileSync(untrustedCaPath, rootCertificates.join("\n"));
  const keyPath = join(directory, "fictional-localhost-key.pem");
  const openssl =
    process.platform === "win32" ? "C:/Program Files/Git/mingw64/bin/openssl.exe" : "openssl";
  const generated = spawnSync(
    openssl,
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout",
      keyPath,
      "-out",
      certificatePath,
    ],
    { encoding: "utf8", timeout: 15000, windowsHide: true },
  );
  expect(generated.status, "offline OpenSSL certificate generation").toBe(0);
  cert = readFileSync(certificatePath, "utf8");
  key = readFileSync(keyPath, "utf8");
});

async function peer(plaintext = false, hostnameMismatch = false) {
  let startup = false;
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => undefined);
    socket.once("data", (request) => {
      if (request.length !== 8 || request.readInt32BE(4) !== 80877103) {
        socket.destroy();
        return;
      }
      if (plaintext) {
        socket.end("N");
        return;
      }
      socket.write("S");
      const secured = new TLSSocket(socket, {
        isServer: true,
        secureContext: createSecureContext({ key, cert }),
      });
      sockets.add(secured);
      secured.on("error", () => undefined);
      secured.once("data", () => {
        startup = true;
        // Auth OK + server version + encoding + ReadyForQuery, never a SQL engine.
        const packet = (type: string, payload: Buffer) => {
          const size = Buffer.alloc(4);
          size.writeInt32BE(payload.length + 4);
          return Buffer.concat([Buffer.from(type), size, payload]);
        };
        secured.write(
          Buffer.concat([
            packet("R", Buffer.alloc(4)),
            packet("S", Buffer.from("server_version\0" + "18.0\0")),
            packet("S", Buffer.from("client_encoding\0UTF8\0")),
            packet("Z", Buffer.from("I")),
          ]),
        );
        // Any query is refused; tests exercise transport only, never SQL execution.
        secured.on("data", () => secured.end());
      });
    });
  });
  const host = hostnameMismatch ? "127.0.0.2" : "127.0.0.1";
  await new Promise<void>((done) => server.listen(0, host, done));
  const port = (server.address() as { port: number }).port;
  return {
    port,
    host,
    startup: () => startup,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

it.each(["untrusted", "hostname", "plaintext", "trusted"] as const)(
  "actual Prisma strict transport: %s",
  async (mode) => {
    const endpoint = await peer(mode === "plaintext", mode === "hostname");
    const url = new URL(
      `postgresql://fictional:fictional@${endpoint.host}:${endpoint.port}/fictional`,
    );
    url.search = "sslmode=require&sslaccept=strict&connection_limit=1&connect_timeout=2";
    if (mode === "hostname" || mode === "trusted")
      url.searchParams.set("sslcert", certificatePath.replace(/\\/g, "/"));
    const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
    let connected = false;
    try {
      await db.$connect();
      connected = true;
    } catch {
      /* No raw driver errors/secrets in reports. */
    } finally {
      await db.$disconnect();
      await endpoint.close();
    }
    expect(endpoint.startup()).toBe(mode === "trusted");
    expect(connected).toBe(mode === "trusted");
  },
  15000,
);

it.each(["untrusted", "hostname", "plaintext", "trusted"] as const)(
  "actual psql verify-full transport: %s",
  async (mode) => {
    const endpoint = await peer(mode === "plaintext", mode === "hostname");
    const psql =
      process.platform === "win32"
        ? "C:/Program Files/PostgreSQL/17/bin/psql.exe"
        : "/usr/bin/psql";
    expect(existsSync(psql), "installed psql required for offline transport regression").toBe(true);
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"])
      if (process.env[name]) env[name] = process.env[name];
    Object.assign(env, {
      PGHOST: endpoint.host,
      PGPORT: String(endpoint.port),
      PGDATABASE: "fictional",
      PGUSER: "fictional",
      PGPASSWORD: "fictional",
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: mode === "untrusted" ? untrustedCaPath : certificatePath,
      PGGSSENCMODE: "disable",
      PGCONNECT_TIMEOUT: "2",
      LC_ALL: "C",
    });
    let output = "";
    const code = await new Promise<number | null>((done, reject) => {
      const child = spawn(psql, ["-X", "-w", "-q"], { env, windowsHide: true });
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("offline peer timeout"));
      }, 8000);
      child.stdout.on("data", (data: Buffer) => {
        output += data.toString();
        if (output.includes("FICTIONAL_TLS_CHECK_DONE")) child.stdin.end("\\q\n");
      });
      child.stdin.on("error", () => undefined);
      child.stdin.write("\\conninfo\n\\echo FICTIONAL_TLS_CHECK_DONE\n");
      child.stderr.resume();
      child.on("error", reject);
      child.on("close", (status) => {
        clearTimeout(timeout);
        done(status);
      });
    });
    await endpoint.close();
    expect(endpoint.startup()).toBe(mode === "trusted");
    if (mode === "trusted") {
      expect(code).toBe(0);
      expect(output).toContain("SSL connection (protocol: TLSv1.");
    } else expect(code).not.toBe(0);
  },
  15000,
);
