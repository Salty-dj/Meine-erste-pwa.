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
