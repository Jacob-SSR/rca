// lib/prisma.ts
// PrismaClient singleton — กัน connection pool บานตอน hot reload ของ next dev
//
// Prisma 7 ต่อ DB ผ่าน driver adapter: MySQL/MariaDB ใช้ @prisma/adapter-mariadb
// (ตัว connection string อ่านจาก env.DATABASE_URL ที่ผ่าน validate มาแล้ว)

import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaMariaDb(env.DATABASE_URL);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
