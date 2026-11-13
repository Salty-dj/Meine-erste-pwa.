import "dotenv/config";
import { spawnSync } from "node:child_process";
const target = process.env.TEST_DATABASE_URL;
if (!target || !new URL(target).pathname.endsWith("_test")) {
  console.error(
    "TEST_DATABASE_URL muss auf eine separate Testdatenbank mit Suffix _test zeigen.",
  );
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--config",
    "vitest.integration.config.ts",
  ],
  { stdio: "inherit", env: { ...process.env, DATABASE_URL: target } },
);
process.exit(result.status ?? 1);
