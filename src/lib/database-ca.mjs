import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { X509Certificate } from "node:crypto";

/** Load only the database trust anchor; never alter global TLS verification. */
export function loadDatabaseCA(env = process.env) {
  const defaultPath = "/etc/secrets/supabase-ca.crt";
  const configured = env.DB_SSL_CA_FILE;
  const file =
    configured || (existsSync(defaultPath) ? defaultPath : undefined);
  if (!file) return undefined;
  try {
    const path = resolve(file);
    const ca = readFileSync(path, "utf8");
    // Reject empty/malformed files instead of silently falling back to other trust.
    new X509Certificate(ca);
    return { path, ca };
  } catch {
    throw new Error(
      "Datenbank-CA konnte nicht gelesen werden. DB_SSL_CA_FILE bzw. das Render Secret File prüfen (gültiges PEM-Zertifikat erforderlich).",
    );
  }
}
