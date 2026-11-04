/* eslint-disable @typescript-eslint/no-require-imports */
// Test-process preload only. No application import, database, persistence or auth override.
require("./offline-guard.cjs");
const net = require("node:net");
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const value = Array.isArray(args[0]) ? args[0][0] : args[0];
  const port = value && typeof value === "object" ? value.port : value;
  if (Number(port) === 5432) throw new Error("ACCEPTANCE_DATABASE_CONNECTION_DENIED");
  return connect.apply(this, args);
};
if (
  process.env.RECYCLER_ACCEPTANCE !== "synthetic-local-only" ||
  process.env.NODE_ENV !== "development" ||
  process.env.VERCEL ||
  !process.env.LOCAL_DEV_SESSION_TOKEN
)
  throw new Error("ACCEPTANCE_ENVIRONMENT_REQUIRED");
const deny = () => {
  throw new Error("ACCEPTANCE_DATABASE_OPERATION_DENIED");
};
globalThis.prisma = new Proxy(
  {},
  {
    get(_target, key) {
      if (key !== "user") return deny;
      return new Proxy(
        {},
        {
          get(_target, operation) {
            if (operation !== "findFirst") return deny;
            return async ({ where }) =>
              where.id === "local-development-agent-workforce" &&
              where.email === "local-development@example.invalid" &&
              where.role === "SALES_USER"
                ? {
                    id: where.id,
                    email: where.email,
                    role: where.role,
                    name: "Synthetic acceptance reviewer",
                  }
                : null;
          },
        },
      );
    },
  },
);
