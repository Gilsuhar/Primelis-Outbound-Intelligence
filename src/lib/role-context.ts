import type { FixtureUser, UserRole } from "@/features/knowledge/types";

export type TrustedRoleContext = FixtureUser;

export function normalizeTrustedRole(value: unknown): UserRole {
  return value === "KNOWLEDGE_ADMIN" ? "KNOWLEDGE_ADMIN" : "SALES_USER";
}

export function getTrustedRoleContext(env: NodeJS.ProcessEnv = process.env): TrustedRoleContext {
  const role = normalizeTrustedRole(env.PRIMELIS_ROLE_CONTEXT);

  return role === "KNOWLEDGE_ADMIN"
    ? {
        id: "seed-admin-user",
        name: "Knowledge Admin",
        role,
      }
    : {
        id: "seed-sales-user",
        name: "Sales User",
        role,
      };
}
