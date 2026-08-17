// lib/auth/env.ts
// env ของระบบ auth — แยกจาก lib/env.ts เพราะตรวจตอน "ใช้งาน" ไม่ใช่ตอน boot
//
// เหตุผล: งานหลายอย่าง (seed, เทสต์ rule engine, generate เอกสารตัวอย่าง)
// ไม่ต้องใช้ auth เลย ถ้า throw ตั้งแต่ import จะรันงานพวกนั้นไม่ได้บนเครื่อง dev

import { z } from "zod";

const authDbSchema = z.object({
  host: z.string().min(1, "AUTH_DB_HOST is required"),
  port: z.coerce.number().int().positive().default(3306),
  user: z.string().min(1, "AUTH_DB_USER is required"),
  password: z.string().min(1, "AUTH_DB_PASS is required"),
  database: z.string().min(1).default("ppchos"),
});

export type AuthDbConfig = z.infer<typeof authDbSchema>;

export function authEnv(): AuthDbConfig {
  const parsed = authDbSchema.safeParse({
    host: process.env.AUTH_DB_HOST,
    port: process.env.AUTH_DB_PORT,
    user: process.env.AUTH_DB_USER,
    password: process.env.AUTH_DB_PASS,
    database: process.env.AUTH_DB_NAME,
  });

  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(
      `ตั้งค่าฐานข้อมูลผู้ใช้ไม่ครบ (${detail}) — ดู AUTH_DB_* ใน .env.example`,
    );
  }

  return parsed.data;
}

/**
 * JWT secret — ต้องยาวพอที่จะเดาไม่ได้
 * 32 ตัวอักษรคือขั้นต่ำที่ยอมรับได้สำหรับ HS256
 */
export function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET ต้องตั้งค่าและยาวอย่างน้อย 32 ตัวอักษร (openssl rand -hex 32)");
  }
  return new TextEncoder().encode(secret);
}

/** อายุ session (วินาที) */
export const SESSION_MAX_AGE = 8 * 60 * 60; // 8 ชั่วโมง เท่ากับ ppc-hos-10667

export const TOKEN_COOKIE = "token";

/** ตั้ง COOKIE_SECURE=true เมื่อเสิร์ฟผ่าน https */
export function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE === "true";
}
