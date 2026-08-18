// lib/hosxp/env.ts
// env ของการเชื่อมต่อ HOSxP — ตรวจตอนใช้งาน ไม่ใช่ตอน boot
//
// สเปก Phase 2 ข้อ 3.9: ระบบต้องทำงานได้เต็มรูปแบบเมื่อไม่ได้ต่อ HOSxP
// จึงห้าม throw ตอน import ไม่งั้นทั้งแอปพังเพราะของเสริมที่ยังไม่ได้ตั้งค่า
//
// ── ทำไมถึงสืบค่าจาก AUTH_DB_* ต่อได้ ────────────────────────────────────────
// ที่โรงพยาบาลนี้ ตาราง users (ที่ใช้ล็อกอิน) กับตาราง master ของ HOSxP
// (kskdepartment / pttype) อยู่บน "เซิร์ฟเวอร์เครื่องเดียวกัน"
// การบังคับให้กรอก HOSXP_DB_HOST/USER/PASS ซ้ำอีกชุดทั้งที่เป็นค่าเดิมเป๊ะ
// มีแต่จะทำให้ตั้งค่าตกหล่น แล้ว dropdown ขึ้น "ยังไม่ได้เปิดการเชื่อมต่อ"
// ทั้งที่ต่อฐานได้อยู่แล้ว → ถ้าไม่ได้ตั้ง HOSXP_DB_* ก็ใช้ค่าของ AUTH_DB_* ต่อเลย

import { z } from "zod";

const schema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive().default(3306),
  user: z.string().min(1),
  password: z.string().min(1),
  // ไม่ใส่ default — ถ้าไม่ระบุจะต่อโดยไม่เลือก database
  // แล้วไปหาเอาว่าตาราง master อยู่ฐานไหนจริงๆ (ดู lib/hosxp/queries.ts)
  // ปลอดภัยกว่าเดาว่าชื่อ "hos" แล้วต่อไม่ติดเพราะแต่ละที่ตั้งชื่อไม่เหมือนกัน
  database: z.string().min(1).optional(),
});

export type HosxpConfig = z.infer<typeof schema>;

/** ค่าที่ตั้งไว้เฉพาะของ HOSxP ถ้าไม่มี ให้ตกไปใช้ของ AUTH_DB_* (เครื่องเดียวกัน) */
function raw() {
  const pick = (own: string | undefined, shared: string | undefined) =>
    own && own.length > 0 ? own : shared;

  return {
    host: pick(process.env.HOSXP_DB_HOST, process.env.AUTH_DB_HOST),
    port: pick(process.env.HOSXP_DB_PORT, process.env.AUTH_DB_PORT),
    user: pick(process.env.HOSXP_DB_USER, process.env.AUTH_DB_USER),
    password: pick(process.env.HOSXP_DB_PASS, process.env.AUTH_DB_PASS),
    // database ไม่สืบทอด — ฐานผู้ใช้กับฐาน HOSxP เป็นคนละฐานได้ (บนเครื่องเดียวกัน)
    database: process.env.HOSXP_DB_NAME || undefined,
  };
}

/**
 * เปิดใช้ HOSxP ไหม
 *
 * เปิดอัตโนมัติเมื่อ "มีค่าให้ต่อครบ" — ไม่ต้องมาตั้ง HOSXP_ENABLED=true ซ้ำ
 * ตั้ง HOSXP_ENABLED=false เมื่อไหร่ = สั่งปิด ไม่ว่าค่าจะครบหรือไม่
 */
export function isHosxpEnabled(): boolean {
  if (process.env.HOSXP_ENABLED === "false") return false;
  if (process.env.HOSXP_ENABLED === "true") return true;
  return schema.safeParse(raw()).success;
}

export function hosxpConfig(): HosxpConfig {
  const parsed = schema.safeParse(raw());

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => String(i.path[0]));
    throw new Error(
      `ตั้งค่าการเชื่อมต่อ HOSxP ไม่ครบ (ขาด: ${missing.join(", ")}) — ` +
        `ตั้ง HOSXP_DB_* หรือ AUTH_DB_* ใน .env (ตรวจด้วย npm run check:conn)`,
    );
  }

  return parsed.data;
}

/** อายุ cache ของตาราง master (วินาที) — แผนก/สิทธิแทบไม่เปลี่ยน */
export function hosxpCacheTtlSec(): number {
  const raw = Number(process.env.HOSXP_CACHE_TTL_SEC);
  return Number.isFinite(raw) && raw > 0 ? raw : 3600;
}
