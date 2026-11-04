import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { validateGitHubContext } from "./github-context.mjs";
import { restrictedRuntimeCredential } from "./runtime-credential.mjs";
import { verifyRuntimePrisma } from "./verify-runtime-prisma.mjs";

const fail = () => { throw new Error("PREVIEW_RUNTIME_ACCEPTANCE_CONFIGURATION"); };
export function applicationRuntimeBindings(env) {
  validateGitHubContext(env);
  if (env.PREVIEW_SETUP_APPROVAL !== "accept-runtime-prisma:txfxfrlhtvzwgluhnbpw" ||
      env.PREVIEW_SETUP_APPROVED_PROJECT_REF !== "txfxfrlhtvzwgluhnbpw" ||
      env.PREVIEW_SETUP_APPROVED_ENDPOINT !== "aws-1-us-west-2.pooler.supabase.com:5432" ||
      Object.keys(env).some(k => /^(?:DATABASE_URL|DIRECT_URL|PREVIEW_SETUP_DATABASE_URL|PREVIEW_VERIFY_DATABASE_URL|NODE_OPTIONS|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|PRISMA_|PG|OPENSSL_|LD_|DYLD_|VERCEL)/.test(k))) fail();
  restrictedRuntimeCredential(env);
  const branch = env.GITHUB_REF.slice("refs/heads/".length);
  // Explicit acceptance inputs to the real application guard, not cloud configuration
  // or a claim that this operator process is an actual Vercel deployment.
  return { NODE_ENV: "production", VERCEL_ENV: "preview", NEXT_PUBLIC_VERCEL_ENV: "preview",
    VERCEL_PROJECT_ID: "prj_sicQocH4juE1Nr5gGpSA61mThxBT", PREVIEW_APPROVED_VERCEL_PROJECT_ID: "prj_sicQocH4juE1Nr5gGpSA61mThxBT",
    VERCEL_GIT_COMMIT_REF: branch, PREVIEW_APPROVED_BRANCH: branch,
    PREVIEW_APPROVED_SUPABASE_PROJECT_REF: "txfxfrlhtvzwgluhnbpw", NEXT_PUBLIC_PREVIEW_SUPABASE_PROJECT_REF: "txfxfrlhtvzwgluhnbpw",
    NEXT_PUBLIC_PREVIEW_SUPABASE_URL: "https://txfxfrlhtvzwgluhnbpw.supabase.co",
    PREVIEW_APPROVED_DATABASE_ENDPOINT: "aws-1-us-west-2.pooler.supabase.com:5432", PREVIEW_APPROVED_DATABASE_ROLE: "recycler_preview_app",
    PREVIEW_DATABASE_URL: env.PREVIEW_RUNTIME_DATABASE_URL };
}

export async function runRuntimeClient(env, deps) {
  const bindings = applicationRuntimeBindings(env);
  const url = deps.url(bindings); // actual bundled runtimeDatabaseUrl
  if (deps.version !== "5.22.0") fail();
  let client;
  try {
    client = deps.connect(url);
    return await verifyRuntimePrisma(client);
  } finally { await client?.$disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) fail();
    applicationRuntimeBindings(process.env); // reject administrator input before importing Prisma
    const { runtimeDatabaseUrl } = await import(pathToFileURL(resolve("node_modules/.cache/preview-runtime-acceptance/url-guard.mjs")).href);
    const { PrismaClient, Prisma } = await import("@prisma/client");
    const result = await runRuntimeClient(process.env, { url: runtimeDatabaseUrl, version: Prisma.prismaVersion.client,
      connect: url => new PrismaClient({ datasources: { db: { url } }, log: [], errorFormat: "minimal" }) });
    console.log(JSON.stringify(result));
  } catch (error) {
    const code = /^PREVIEW_RUNTIME_VERIFY_(SESSION|PRIVILEGES|PROFILE|VISIBLE_PROFILES|UNAUTHORIZED_PROFILE|DENIED_READ_SUCCEEDED|CONNECTION_OR_QUERY)$/.test(error?.message ?? "")
      ? error.message : "PREVIEW_RUNTIME_ACCEPTANCE_CLIENT_FAILED";
    console.error(JSON.stringify({ status: "RUNTIME_ACCEPTANCE_FAILED", code })); process.exitCode = 1;
  }
}
