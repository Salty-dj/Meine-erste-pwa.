import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseOptions } from "./database-config";
const options = databaseOptions(process.env);
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(options.pool, { schema: options.schema }),
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
