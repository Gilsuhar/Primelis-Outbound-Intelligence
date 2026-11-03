import { assertPreviewOperation } from "../src/lib/preview-policy.mjs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

assertPreviewOperation("database-migration");
const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve("prisma/build/index.js"), "migrate", "dev", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
