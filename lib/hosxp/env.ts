// lib/hosxp/env.ts
// env ของการเชื่อมต่อ HOSxP — ตรวจตอนใช้งาน ไม่ใช่ตอน boot
//
// สเปก Phase 2 ข้อ 3.9: ระบบต้องทำงานได้เต็มรูปแบบเมื่อ HOSXP_ENABLED=false
// จึงห้าม throw ตอน import ไม่งั้นทั้งแอปพังเพราะของเสริมที่ยังไม่ได้ตั้งค่า

import { z } from "zod";

const schema = z.object({
  host: z.string().min(1, "HOSXP_DB_HOST is required"),
  port: z.coerce.number().int().positive().default(3306),
  user: z.string().min(1, "HOSXP_DB_USER is required"),
  password: z.string().min(1, "HOSXP_DB_PASS is required"),
  database: z.string().min(1).default("hos"),
});

export type HosxpConfig = z.infer<typeof schema>;

export function isHosxpEnabled(): boolean {
  return process.env.HOSXP_ENABLED === "true";
}

export function hosxpConfig(): HosxpConfig {
  const parsed = schema.safeParse({
    host: process.env.HOSXP_DB_HOST,
    port: process.env.HOSXP_DB_PORT,
    user: process.env.HOSXP_DB_USER,
    password: process.env.HOSXP_DB_PASS,
    database: process.env.HOSXP_DB_NAME,
  });

  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`ตั้งค่าการเชื่อมต่อ HOSxP ไม่ครบ (${detail}) — ดู HOSXP_DB_* ใน .env.example`);
  }

  return parsed.data;
}

/** อายุ cache ของตาราง master (วินาที) — แผนก/สิทธิแทบไม่เปลี่ยน */
export function hosxpCacheTtlSec(): number {
  const raw = Number(process.env.HOSXP_CACHE_TTL_SEC);
  return Number.isFinite(raw) && raw > 0 ? raw : 3600;
}
