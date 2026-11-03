import net from "node:net";
import tls from "node:tls";
import { verifiedCa } from "./tls-trust.mjs";

const categories = new Set(["DNS_NOT_FOUND", "DNS_TEMPORARY_FAILURE", "DNS_FAILED", "TCP_REFUSED", "NETWORK_UNREACHABLE",
  "CONNECTION_RESET", "DNS_TIMEOUT", "TCP_TIMEOUT", "SSL_RESPONSE_TIMEOUT", "TLS_TIMEOUT", "SSL_RESPONSE_REJECTED",
  "CERT_CHAIN_UNTRUSTED", "CERT_EXPIRED", "CERT_NOT_YET_VALID", "HOSTNAME_MISMATCH", "CERT_VALIDATION_FAILED",
  "TLS_PROTOCOL_REJECTED", "TLS_HANDSHAKE_FAILED", "TCP_FAILED", "CONNECTION_CLOSED", "PROBE_INTERNAL_ERROR"]);
export function tlsFailureCategory(error) {
  return categories.has(error?.category) ? error.category : "PROBE_INTERNAL_ERROR";
}
function classify(error, phase) {
  const codes = {
    ENOTFOUND: "DNS_NOT_FOUND", EAI_AGAIN: "DNS_TEMPORARY_FAILURE", ECONNREFUSED: "TCP_REFUSED",
    ENETUNREACH: "NETWORK_UNREACHABLE", EHOSTUNREACH: "NETWORK_UNREACHABLE", ECONNRESET: "CONNECTION_RESET",
    SELF_SIGNED_CERT_IN_CHAIN: "CERT_CHAIN_UNTRUSTED", DEPTH_ZERO_SELF_SIGNED_CERT: "CERT_CHAIN_UNTRUSTED",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "CERT_CHAIN_UNTRUSTED", UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "CERT_CHAIN_UNTRUSTED",
    CERT_HAS_EXPIRED: "CERT_EXPIRED", CERT_NOT_YET_VALID: "CERT_NOT_YET_VALID",
    ERR_TLS_CERT_ALTNAME_INVALID: "HOSTNAME_MISMATCH",
  };
  if (error?.code === "ETIMEDOUT") return `${phase}_TIMEOUT`;
  return Object.hasOwn(codes, error?.code) ? codes[error.code] :
    phase === "TLS" ? "TLS_HANDSHAKE_FAILED" : phase === "DNS" ? "DNS_FAILED" : "TCP_FAILED";
}

/** PostgreSQL SSLRequest only: no password/startup message is sent by this probe. */
export function probeTls(url, transport = { connect: net.connect, secure: tls.connect }) {
  return new Promise((resolve, reject) => {
    const ca = verifiedCa();
    let socket;
    let secured;
    let settled = false;
    let phase = "DNS";
    const timer = setTimeout(() => finish(false, `${phase}_TIMEOUT`), 10000);
    function finish(ok, category = "PROBE_INTERNAL_ERROR") {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      secured?.destroy();
      socket?.destroy();
      if (ok) resolve({ tls: "verified" });
      else reject(Object.assign(new Error("PREVIEW_SETUP_TLS_CONNECTIVITY_FAILED"), {
        category: categories.has(category) ? category : "PROBE_INTERNAL_ERROR",
      }));
    }
    try { socket = transport.connect({ host: url.hostname, port: Number(url.port), autoSelectFamily: false }); }
    catch (error) { finish(false, classify(error, phase)); return; }
    socket.once("error", error => finish(false, classify(error, phase)));
    socket.once("lookup", error => {
      if (settled) return;
      if (error) finish(false, classify(error, "DNS"));
      else phase = "TCP";
    });
    socket.once("end", () => finish(false, "CONNECTION_CLOSED"));
    socket.once("close", () => finish(false, "CONNECTION_CLOSED"));
    socket.once("connect", () => {
      if (settled) return;
      phase = "SSL_RESPONSE";
      const message = Buffer.alloc(8);
      message.writeInt32BE(8, 0);
      message.writeInt32BE(80877103, 4);
      try { socket.write(message); } catch (error) { finish(false, classify(error, phase)); }
    });
    socket.once("data", data => {
      if (settled) return;
      if (data.length !== 1 || data[0] !== 83) return finish(false, "SSL_RESPONSE_REJECTED");
      phase = "TLS";
      try {
        secured = transport.secure({ socket, servername: url.hostname, ca, rejectUnauthorized: true,
          minVersion: "TLSv1.2", checkServerIdentity: tls.checkServerIdentity });
        secured.once("error", error => finish(false, classify(error, phase)));
        secured.once("end", () => finish(false, "CONNECTION_CLOSED"));
        secured.once("close", () => finish(false, "CONNECTION_CLOSED"));
        secured.once("secureConnect", () => {
          try {
            if (secured.authorized !== true) return finish(false, "CERT_VALIDATION_FAILED");
            if (!["TLSv1.2", "TLSv1.3"].includes(secured.getProtocol())) return finish(false, "TLS_PROTOCOL_REJECTED");
            if (tls.checkServerIdentity(url.hostname, secured.getPeerCertificate())) return finish(false, "HOSTNAME_MISMATCH");
            finish(true);
          } catch { finish(false, "PROBE_INTERNAL_ERROR"); }
        });
      } catch (error) { finish(false, classify(error, phase)); }
    });
  });
}
