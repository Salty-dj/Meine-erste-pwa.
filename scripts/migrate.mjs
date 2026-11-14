import "dotenv/config";
import { spawnSync } from "node:child_process";
import { migrationUrl } from "./migration-url.mjs";
let connection;
try {
  connection = migrationUrl(process.env.DIRECT_URL || process.env.DATABASE_URL);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: connection },
  },
);
process.exit(result.status ?? 1);
