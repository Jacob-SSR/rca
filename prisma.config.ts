// prisma.config.ts
// Prisma 7 ย้าย connection URL ออกจาก schema.prisma มาไว้ที่นี่
// (schema.prisma ไม่มี `url` แล้ว — CLI อ่านจากไฟล์นี้, runtime ใช้ driver adapter ใน lib/prisma.ts)

import "dotenv/config";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),

  // ใช้เฉพาะคำสั่งฝั่ง CLI (migrate / db push / introspect)
  datasource: {
    url: env("DATABASE_URL"),
  },

  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});
