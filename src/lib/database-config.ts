import { loadDatabaseCA } from "./database-ca.mjs";

/** Scope custom CA trust to PostgreSQL and always retain peer verification. */
export function databaseOptions(env: Record<string, string | undefined>) {
  let connectionString = env.DATABASE_URL;
  const certificate = loadDatabaseCA(env);
  let schema = "public";
  if (connectionString) {
    try {
      const url = new URL(connectionString);
      if (!["postgres:", "postgresql:"].includes(url.protocol))
        throw new Error();
      schema = url.searchParams.get("schema") || "public";
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error();
    } catch {
      throw new Error(
        "DATABASE_URL muss eine gültige PostgreSQL-Adresse mit gültigem Schemanamen enthalten.",
      );
    }
  }
  if (certificate && connectionString) {
    const url = new URL(connectionString);
    // pg-connection-string replaces an explicit ssl object when these URL
    // parameters exist. Remove them only after validating/loading the CA.
    for (const key of [
      "sslmode",
      "sslcert",
      "sslkey",
      "sslrootcert",
      "ssl",
      "uselibpqcompat",
      "sslnegotiation",
    ])
      url.searchParams.delete(key);
    connectionString = url.toString();
  }
  const max = Number(env.DB_POOL_MAX ?? "3");
  if (!Number.isInteger(max) || max < 1 || max > 20) {
    throw new Error("DB_POOL_MAX muss eine ganze Zahl zwischen 1 und 20 sein.");
  }
  return {
    pool: {
      connectionString,
      ...(certificate
        ? { ssl: { ca: certificate.ca, rejectUnauthorized: true } }
        : {}),
      max,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    },
    schema,
  };
}
