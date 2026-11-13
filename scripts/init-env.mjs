import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) {
  console.log(".env existiert bereits und bleibt unverändert.");
  process.exit(0);
}
const password = randomBytes(32).toString("hex");
const origin = process.env.CODESPACE_NAME
  ? `https://${process.env.CODESPACE_NAME}-3000.app.github.dev`
  : "http://localhost:3000";
writeFileSync(
  ".env",
  `DB_PASSWORD=${password}\nDATABASE_URL=postgresql://tsv:${password}@localhost:5432/tsv?schema=public\nAPP_URL=${origin}\nSESSION_SECURE=${origin.startsWith("https:")}\nBACKUP_DIR=./backups\n`,
  { mode: 0o600 },
);
console.log(
  ".env mit zufälligem lokalem Datenbankpasswort erstellt. Keine Zugangsdaten wurden ausgegeben.",
);
