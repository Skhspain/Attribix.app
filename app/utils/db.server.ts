// Centralized Prisma client for server code
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import pkg from "@prisma/client";

const { PrismaClient } = pkg;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClientType;
};

export const db: PrismaClientType =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export default db;
