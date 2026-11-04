import { spawn } from "node:child_process";
import type { ClientResult } from "./provision-runtime-role.mjs";
export function validateClientTlsReport(report: string, settings: Record<string, string>): "VERIFIED";
export function runTlsSession(args: string[], settings: Record<string, string>, sql: string, start?: typeof spawn): Promise<ClientResult>;
