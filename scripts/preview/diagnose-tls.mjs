import net from "node:net";
import tls from "node:tls";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { probeTls, tlsFailureCategory } from "./tls-probe.mjs";

// Deliberately no URL/credential input, Prisma import, startup packet, SQL or retry.
export async function diagnoseTls(mode, transport = { connect: net.connect, secure: tls.connect }) {
  if (!["--system-trust", "--pinned-ca"].includes(mode)) return { status: "ARGUMENT_REJECTED" };
  const result = { status: "FAILED", dns: "NOT_CONFIRMED", tcp: "NOT_REACHED", sslRequest: "NOT_REACHED", tls: "NOT_REACHED" };
  try {
    await probeTls(new URL("postgresql://aws-1-us-west-2.pooler.supabase.com:5432"), {
      connect(options) {
        const socket = transport.connect(options);
        socket.once("connect", () => { result.dns = "RESOLVED"; result.tcp = "CONNECTED"; });
        socket.once("data", data => { result.sslRequest = data.length === 1 && data[0] === 83 ? "ACCEPTED" : "REJECTED"; });
        return socket;
      },
      secure(options) {
        // Comparison uses Node's default trust store, with verification still mandatory.
        const strictOptions = { ...options };
        if (mode === "--system-trust") delete strictOptions.ca;
        return transport.secure(strictOptions);
      },
    });
    result.status = "VERIFIED"; result.tls = "CHAIN_AND_HOSTNAME_VERIFIED";
  } catch (error) {
    result.tls = error?.message === "PREVIEW_SETUP_CA_REJECTED" ? "CA_REJECTED" : tlsFailureCategory(error);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = process.argv.length === 3 ? await diagnoseTls(process.argv[2]) : { status: "ARGUMENT_REJECTED" };
  console.log(JSON.stringify(result));
  process.exitCode = result.status === "VERIFIED" ? 0 : 1;
}
