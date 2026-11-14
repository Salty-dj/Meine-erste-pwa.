import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { migrationUrl } from "./migration-url.mjs";

if (!process.env.APP_URL || !process.env.DATABASE_URL) {
  console.error(
    "Render benötigt APP_URL und DATABASE_URL als Environment Variables.",
  );
  process.exit(1);
}
try {
  const url = new URL(process.env.APP_URL);
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error();
} catch {
  console.error(
    "APP_URL muss die vollständige öffentliche HTTPS-Origin ohne Unterpfad sein.",
  );
  process.exit(1);
}
if (process.env.SESSION_SECURE === "false") {
  console.error("Render benötigt SESSION_SECURE=true.");
  process.exit(1);
}
// Check the migration history before serving traffic. Production writes are a separate operation.
let connection;
try {
  connection = migrationUrl(process.env.DIRECT_URL || process.env.DATABASE_URL);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const migrationStatus = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "status"],
  { stdio: "inherit", env: { ...process.env, DATABASE_URL: connection } },
);
if (migrationStatus.status !== 0) {
  console.error(
    "Prisma-Migrationsstatus prüfen. Produktive Migrationen benötigen eine Freigabe.",
  );
  process.exit(migrationStatus.status ?? 1);
}
// Retain bootstrap values only in Render's secure configuration, not the app process.
for (const key of [
  "BOOTSTRAP_ADMIN",
  "ADMIN_EMAIL",
  "ADMIN_NAME",
  "ADMIN_PASSWORD",
  "DIRECT_URL",
])
  delete process.env[key];
const child = spawn(process.execPath, ["scripts/start.mjs"], {
  stdio: "inherit",
  env: process.env,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", () => {
  console.error("Webserver konnte nicht gestartet werden.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
