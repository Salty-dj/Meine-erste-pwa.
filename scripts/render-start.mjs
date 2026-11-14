import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";

// Render Free has no paid pre-deploy step/shell: migrate before accepting requests.
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
for (const command of [
  ["scripts/migrate.mjs"],
  ["--import", "tsx", "scripts/render-bootstrap.ts"],
]) {
  const result = spawnSync(process.execPath, command, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
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
