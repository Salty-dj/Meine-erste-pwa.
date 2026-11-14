import { afterAll, expect, test } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import { databaseOptions } from "../../src/lib/database-config";
import { loadDatabaseCA } from "../../src/lib/database-ca.mjs";
// Public system root used only as a valid PEM parsing fixture, never as a test private key.
const directory = mkdtempSync(join(tmpdir(), "tsv-ca-"));
const certificate = join(directory, "ca.crt");
writeFileSync(certificate, rootCertificates[0]);
afterAll(() => rmSync(directory, { recursive: true, force: true }));
test("custom CA cannot be overwritten by URL SSL settings", () => {
  const options = databaseOptions({
    DATABASE_URL:
      "postgresql://example:placeholder@localhost/db?schema=tsv&sslmode=verify-full&sslrootcert=ignored&sslaccept=strict",
    DB_SSL_CA_FILE: certificate,
  });
  expect(options.pool.ssl).toEqual({
    ca: rootCertificates[0],
    rejectUnauthorized: true,
  });
  const url = new URL(options.pool.connectionString!);
  expect(url.searchParams.has("sslmode")).toBe(false);
  expect(url.searchParams.has("sslrootcert")).toBe(false);
  expect(url.searchParams.get("schema")).toBe("tsv");
});
test("configured missing or malformed CA fails closed", () => {
  expect(() =>
    loadDatabaseCA({ DB_SSL_CA_FILE: join(directory, "missing.crt") }),
  ).toThrow("Datenbank-CA");
  const malformed = join(directory, "malformed.crt");
  writeFileSync(malformed, "not a certificate");
  expect(() => databaseOptions({ DB_SSL_CA_FILE: malformed })).toThrow(
    "Datenbank-CA",
  );
});
