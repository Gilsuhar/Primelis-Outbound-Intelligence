/** Local build only. Never executes initialization or fetches a credential. */
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve("vitest/package.json"));
const { buildSync } = createRequire(vitestRequire.resolve("vite"))("esbuild");
buildSync({
  entryPoints: [resolve("ci/company-acceptance/initialize-entry.ts")],
  outfile: resolve("outputs/company-ci/initialize.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  logLevel: "silent",
});
console.log("Initializer built only; no SQL executed.");
