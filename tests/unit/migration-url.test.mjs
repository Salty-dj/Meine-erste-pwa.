import { expect, test } from "vitest";
import { migrationUrl } from "../../scripts/migration-url.mjs";
test("native migration TLS is required and verified, never silently downgraded", () => {
  const url = new URL(
    migrationUrl(
      "postgresql://example:placeholder@session.pooler.supabase.com:5432/postgres?schema=tsv&sslmode=verify-full",
    ),
  );
  expect(url.searchParams.get("sslmode")).toBe("require");
  expect(url.searchParams.get("sslaccept")).toBe("strict");
  expect(url.searchParams.get("schema")).toBe("tsv");
  expect(
    migrationUrl("postgresql://example:placeholder@localhost:5432/tsv_test"),
  ).not.toContain("sslmode");
});
test("rejects Supabase transaction pooler migrations without leaking the URL", () => {
  const secret =
    "postgresql://example:private-value@session.pooler.supabase.com:6543/postgres";
  expect(() => migrationUrl(secret)).toThrow("Session-Pooler");
  try {
    migrationUrl(secret);
  } catch (error) {
    expect(error.message).not.toContain("private-value");
  }
});

test("Prisma receives the CA file with required TLS and strict verification", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { rootCertificates } = await import("node:tls");
  const dir = mkdtempSync(join(tmpdir(), "tsv-migration-ca-"));
  const file = join(dir, "ca with space.crt");
  try {
    writeFileSync(file, rootCertificates[0]);
    const url = new URL(
      migrationUrl(
        "postgresql://example:placeholder@localhost/db?sslmode=disable",
        { DB_SSL_CA_FILE: file },
      ),
    );
    expect(url.searchParams.get("sslcert")).toBe(file);
    expect(url.searchParams.get("sslaccept")).toBe("strict");
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(() =>
      migrationUrl(url.toString(), { DB_SSL_CA_FILE: join(dir, "missing") }),
    ).toThrow("Datenbank-CA");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
