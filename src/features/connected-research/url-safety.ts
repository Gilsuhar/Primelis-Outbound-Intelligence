import net from "node:net";

import type { SafeUrlResult } from "./types";

const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

function isPrivateIpv4(host: string) {
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function isBlockedIp(host: string) {
  const version = net.isIP(host);
  if (version === 4) {
    return isPrivateIpv4(host);
  }
  if (version === 6) {
    const normalized = host.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    );
  }
  return false;
}

export function normalizeDomain(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .toLowerCase();
}

export function validatePublicCompanyUrl(value: string): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    return { ok: false, code: "INVALID_DOMAIN", message: "Invalid company URL or domain." };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return {
      ok: false,
      code: "UNSUPPORTED_PROTOCOL",
      message: "Only http and https URLs are supported.",
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      code: "EMBEDDED_CREDENTIALS",
      message: "URLs with embedded credentials are not allowed.",
    };
  }
  const hostname = url.hostname.toLowerCase();
  if (
    !hostname.includes(".") ||
    blockedHostnames.has(hostname) ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return { ok: false, code: "INTERNAL_HOST", message: "Internal hostnames are not allowed." };
  }
  if (isBlockedIp(hostname)) {
    return {
      ok: false,
      code: "PRIVATE_IP",
      message: "Private, loopback, and link-local addresses are not allowed.",
    };
  }

  return { ok: true, url, normalizedDomain: normalizeDomain(hostname) };
}

export function isSameNormalizedDomain(candidate: string, normalizedDomain: string) {
  const checked = validatePublicCompanyUrl(candidate);
  return checked.ok && checked.normalizedDomain === normalizedDomain;
}
