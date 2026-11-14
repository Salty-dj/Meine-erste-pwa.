import { loadDatabaseCA } from "../src/lib/database-ca.mjs";
/** Translate node-postgres TLS settings to the native Prisma engine's syntax. */
export function migrationUrl(connection, env = process.env) {
  try {
    const url = new URL(connection);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
    if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543")
      throw new Error();
    const certificate = loadDatabaseCA(env);
    if (certificate) {
      // Native Prisma uses sslcert for the trusted server CA, not pg's sslrootcert.
      url.searchParams.set("sslcert", certificate.path);
      url.searchParams.set("sslmode", "require");
      url.searchParams.set("sslaccept", "strict");
      url.searchParams.delete("sslrootcert");
    }
    const sslmode = url.searchParams.get("sslmode");
    // The native Prisma 6 engine silently treats unknown `verify-full` as a
    // fallback mode. Explicit require+strict is needed to prevent plaintext fallback.
    if (["verify-full", "verify-ca", "require"].includes(sslmode)) {
      url.searchParams.set("sslmode", "require");
      url.searchParams.set("sslaccept", "strict");
    }
    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Datenbank-CA"))
      throw error;
    throw new Error(
      "Migration benötigt DATABASE_URL oder DIRECT_URL als PostgreSQL-Verbindung. Bei Supabase den Session-Pooler (Port 5432) oder eine erreichbare Direktverbindung verwenden.",
    );
  }
}
