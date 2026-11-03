/** Builds only the finite CI harness. No provider/database import or execution. */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve("vitest/package.json"));
const { buildSync } = createRequire(vitestRequire.resolve("vite"))("esbuild");
const result = buildSync({
  entryPoints: [resolve("ci/company-acceptance/entry.ts")],
  outfile: resolve("outputs/company-ci/worker.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  alias: { "@": resolve("src"), "server-only": resolve("src/test/server-only.ts") },
  logLevel: "silent",
  metafile: true,
});
writeFileSync(resolve("outputs/company-ci/build-inputs.json"), JSON.stringify(Object.keys(result.metafile.inputs).sort(), null, 2) + "\n");
console.log("Isolated fixture CI harness built; no execution performed.");
