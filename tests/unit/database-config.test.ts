import { expect, test } from "vitest";
import { databaseOptions } from "../../src/lib/database-config";
test("Supabase pool configuration retains TLS URL and the requested schema", () => {
  const url =
    "postgresql://postgres.demo:example-only@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=verify-full&schema=tsv";
  const options = databaseOptions({ DATABASE_URL: url });
  expect(options.pool.connectionString).toBe(url);
  expect(options.pool.max).toBe(3);
  expect(options.schema).toBe("tsv");
  expect(options.pool).not.toHaveProperty("ssl");
});
test("pool size validation and schema validation fail without leaking secrets", () => {
  expect(databaseOptions({ DB_POOL_MAX: "5" }).pool.max).toBe(5);
  for (const DB_POOL_MAX of ["0", "-1", "21", "invalid", "1.5"])
    expect(() => databaseOptions({ DB_POOL_MAX })).toThrow("DB_POOL_MAX");
  expect(() =>
    databaseOptions({ DATABASE_URL: "https://private-value" }),
  ).toThrow("DATABASE_URL");
  expect(() =>
    databaseOptions({
      DATABASE_URL: "postgresql://u:private-value@host/db?schema=bad-name",
    }),
  ).toThrow("DATABASE_URL");
});
