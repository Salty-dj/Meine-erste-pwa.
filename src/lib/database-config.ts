/** pg owns TLS negotiation; never replace sslmode/certificate options with insecure overrides. */
export function databaseOptions(env: Record<string, string | undefined>) {
  const connectionString = env.DATABASE_URL;
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
  const max = Number(env.DB_POOL_MAX ?? "3");
  if (!Number.isInteger(max) || max < 1 || max > 20) {
    throw new Error("DB_POOL_MAX muss eine ganze Zahl zwischen 1 und 20 sein.");
  }
  return {
    pool: {
      connectionString,
      max,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    },
    schema,
  };
}
