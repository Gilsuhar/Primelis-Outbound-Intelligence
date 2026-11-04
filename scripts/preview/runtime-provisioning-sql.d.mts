export function runtimeAuditSql(after?: boolean): string;
export function bindingAuditSql(after?: boolean): string;
export function activationAuditSql(phase: "preflight" | "before-password" | "before-commit" | "postcheck"): string;
