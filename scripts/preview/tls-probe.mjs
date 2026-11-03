import net from "node:net";
import tls from "node:tls";

/** PostgreSQL SSLRequest only: no password/startup message is sent by this probe. */
export function probeTls(url, transport = { connect: net.connect, secure: tls.connect }) {
  return new Promise((resolve, reject) => {
    let secured;
    let settled = false;
    const socket = transport.connect({ host: url.hostname, port: Number(url.port), autoSelectFamily: false });
    const timer = setTimeout(() => finish(false), 10000);
    function finish(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      secured?.destroy();
      socket.destroy();
      if (ok) resolve({ tls: "verified" });
      else reject(new Error("PREVIEW_SETUP_TLS_CONNECTIVITY_FAILED"));
    }
    socket.once("error", () => finish(false));
    socket.once("end", () => finish(false));
    socket.once("connect", () => {
      const message = Buffer.alloc(8);
      message.writeInt32BE(8, 0);
      message.writeInt32BE(80877103, 4);
      socket.write(message);
    });
    socket.once("data", data => {
      if (data.length !== 1 || data[0] !== 83) return finish(false);
      secured = transport.secure({ socket, servername: url.hostname, rejectUnauthorized: true,
        minVersion: "TLSv1.2", checkServerIdentity: tls.checkServerIdentity });
      secured.once("error", () => finish(false));
      secured.once("end", () => finish(false));
      secured.once("secureConnect", () => finish(secured.authorized === true &&
        ["TLSv1.2", "TLSv1.3"].includes(secured.getProtocol()) &&
        !tls.checkServerIdentity(url.hostname, secured.getPeerCertificate())));
    });
  });
}
