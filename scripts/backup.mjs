import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync, chmodSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
const directory = resolve(process.env.BACKUP_DIR || "./backups");
mkdirSync(directory, { recursive: true, mode: 0o700 });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL fehlt.");
const url = new URL(process.env.DATABASE_URL);
const schema = url.searchParams.get("schema") || "public";
url.searchParams.delete("schema");
// Password is provided through the process environment, never through argv/logs.
const password = decodeURIComponent(url.password);
url.password = "";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = join(directory, `tsv-${stamp}.dump`);
const temp = file + ".tmp";
const env = {
  ...process.env,
  PGPASSWORD: password,
  PGDATABASE: url.toString(),
};
delete env.DATABASE_URL;
const backup = spawnSync(
  "pg_dump",
  ["--format=custom", "--schema", schema, "--file", temp],
  { env, stdio: ["ignore", "ignore", "pipe"] },
);
if (backup.status !== 0) {
  try {
    unlinkSync(temp);
  } catch {}
  console.error(
    "Backup fehlgeschlagen. PostgreSQL-Client, Datenbankzugriff und Zielverzeichnis prüfen.",
  );
  process.exit(1);
}
const check = spawnSync("pg_restore", ["--list", temp], { stdio: "ignore" });
if (check.status !== 0) {
  unlinkSync(temp);
  console.error("Backup-Prüfung fehlgeschlagen.");
  process.exit(1);
}
chmodSync(temp, 0o600);
renameSync(temp, file);
console.log("Backup erstellt und Archivstruktur geprüft:", file);
