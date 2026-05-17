/**
 * Prisma client singleton.
 *
 * In Next.js dev with HMR, modules can re-evaluate and naive
 * `new PrismaClient()` calls would leak connections. Pin the instance
 * to globalThis so we get the same client across reloads.
 *
 * Reference: https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
