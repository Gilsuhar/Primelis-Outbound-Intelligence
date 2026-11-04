import type { NextConfig } from "next";
import { createWorkforceBuildInfo } from "./scripts/workforce-build-info";

const buildInfo =
  process.env.VERCEL_ENV === "preview"
    ? createWorkforceBuildInfo(process.cwd(), process.env.VERCEL_GIT_COMMIT_SHA)
    : null;
if (buildInfo) console.info("[workforce-build]", JSON.stringify(buildInfo));

const nextConfig: NextConfig = {
  // Public trust anchor required by the isolated Preview Prisma connection.
  outputFileTracingIncludes: { "/*": ["./scripts/preview/supabase-prod-ca-2021.crt"] },
  // Authorization grants arrive in callback query strings; never log incoming URLs.
  logging:
    process.env.LOCAL_OUTREACH_OAUTH_ENABLED === "true" ? { incomingRequests: false } : undefined,
  env: {
    NEXT_PUBLIC_WORKFORCE_BUILD_INFO: buildInfo ? JSON.stringify(buildInfo) : "",
  },
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
