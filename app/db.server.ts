// app/db.server.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

// Prevent multiple instances during dev / HMR
if (process.env.NODE_ENV === "development") {
  globalForPrisma.prisma = prisma;
}

// Named export (preferred)
export const db = prisma;

// Default export (optional compatibility)
export default prisma;
