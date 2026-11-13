// Optional development fallback for environments that cannot download native
// Prisma schema engines. Runtime query compiler/pg adapter are stable; only this
// optional CLI migration adapter is experimental in Prisma 6.
import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
export default defineConfig({
  schema: "prisma/schema.prisma",
  experimental: { adapter: true },
  engine: "js",
  adapter: async () =>
    new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
