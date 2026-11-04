import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Build the actual application's URL/TLS guard, without importing the application.
// Use esbuild already pinned transitively by Vite in the frozen lockfile; no new dependency.
export async function buildRuntimeGuard() {
  const require = createRequire(import.meta.url);
  const testRequire = createRequire(require.resolve("vitest/package.json"));
  const { build } = createRequire(testRequire.resolve("vite/package.json"))("esbuild");
  await build({ entryPoints: ["src/lib/preview-runtime-tls.ts"], bundle: true, platform: "node", format: "esm", target: "node24",
    outfile: "node_modules/.cache/preview-runtime-acceptance/url-guard.mjs", sourcemap: false, logLevel: "silent",
    plugins: [{ name: "trusted-node-server-only-marker", setup(context) {
      // server-only is a framework build marker, not authorization. This bundle is
      // exclusively a Node operator artifact; all real URL/TLS guards remain bundled.
      context.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "node-only" }));
      context.onLoad({ filter: /.*/, namespace: "node-only" }, () => ({ contents: "export {};", loader: "js" }));
    } }],
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2 || process.env.PREVIEW_SETUP_DATABASE_URL || process.env.PREVIEW_RUNTIME_DATABASE_URL)
      throw new Error();
    await buildRuntimeGuard(); console.log("RUNTIME_ACCEPTANCE_GUARD_BUILT");
  } catch { console.error("RUNTIME_ACCEPTANCE_BUILD_FAILED"); process.exitCode = 1; }
}
