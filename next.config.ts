import type { NextConfig } from "next";
import { createWorkforceBuildInfo } from "./scripts/workforce-build-info";

const buildInfo =
  process.env.VERCEL_ENV === "preview"
    ? createWorkforceBuildInfo(process.cwd(), process.env.VERCEL_GIT_COMMIT_SHA)
    : null;
if (buildInfo) console.info("[workforce-build]", JSON.stringify(buildInfo));

const nextConfig: NextConfig = {
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
