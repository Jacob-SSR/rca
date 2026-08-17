// lib/auth/login.ts
// ตรรกะการยืนยันตัวตน — ใช้ร่วมกันระหว่าง Server Action (UI) และ route handler (API)
// ไม่ควรมีสองสำเนาที่ค่อยๆ เพี้ยนออกจากกัน โดยเฉพาะเรื่อง rate limit

import { z } from "zod";
import { findUser } from "@/lib/auth/db";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/jwt";
import { capabilitiesForRole, type Capability } from "@/lib/auth/permissions";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";

const MINUTE = 60_000;

export const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

/**
 * ข้อความเดียวกันหมดไม่ว่าจะ user ผิดหรือรหัสผิด
 * ถ้าแยกข้อความ จะกลายเป็นช่องให้ไล่เดาว่ามีใครอยู่ในระบบบ้าง
 */
const INVALID_MESSAGE = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";

export type AuthSuccess = {
  ok: true;
  token: string;
  user: { username: string; name: string; role: string; capabilities: readonly Capability[] };
};

export type AuthFailure = {
  ok: false;
  status: 400 | 401 | 403 | 429 | 503;
  error: string;
  retryAfterSec?: number;
};

export type AuthResult = AuthSuccess | AuthFailure;

export async function authenticate(input: {
  username: unknown;
  password: unknown;
  ip: string;
}): Promise<AuthResult> {
  // ── ชั้นที่ 1: จำกัดตาม IP — 10 ครั้ง / 5 นาที ──
  const ipLimit = rateLimit(`login:ip:${input.ip}`, 10, 5 * MINUTE);
  if (!ipLimit.ok) {
    return {
      ok: false,
      status: 429,
      error: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่",
      retryAfterSec: ipLimit.retryAfterSec,
    };
  }

  const parsed = credentialsSchema.safeParse({
    username: input.username,
    password: input.password,
  });
  if (!parsed.success) {
    return { ok: false, status: 400, error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" };
  }

  const { username, password } = parsed.data;

  // ── ชั้นที่ 2: จำกัดตาม username — 5 ครั้ง / 15 นาที ──
  // กันคนไล่เดารหัสของบัญชีเดียวจากหลาย IP
  const userKey = `login:user:${username.toLowerCase()}`;
  const userLimit = rateLimit(userKey, 5, 15 * MINUTE);
  if (!userLimit.ok) {
    return {
      ok: false,
      status: 429,
      error: "บัญชีนี้ถูกพยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่",
      retryAfterSec: userLimit.retryAfterSec,
    };
  }

  let user;
  try {
    user = await findUser(username);
  } catch (e) {
    console.error("login: ต่อฐานข้อมูลผู้ใช้ไม่ได้:", e);
    return {
      ok: false,
      status: 503,
      error: "ระบบยืนยันตัวตนไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลระบบ",
    };
  }

  // ยังต้องเรียก verifyPassword แม้ไม่พบ user เพื่อให้เวลาตอบใกล้เคียงกัน
  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !passwordOk) {
    return { ok: false, status: 401, error: INVALID_MESSAGE };
  }

  const capabilities = capabilitiesForRole(user.role);
  if (capabilities.length === 0) {
    // ล็อกอินถูกต้องแต่ยังไม่ถูกตั้ง role ให้ใช้ระบบนี้
    return {
      ok: false,
      status: 403,
      error:
        "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานระบบตรวจคุณภาพเวชระเบียน กรุณาติดต่อผู้ดูแลระบบ",
    };
  }

  resetRateLimit(userKey);

  const token = await signSession({
    username: user.username,
    role: user.role,
    name: user.displayName,
  });

  return {
    ok: true,
    token,
    user: {
      username: user.username,
      name: user.displayName,
      role: user.role,
      capabilities,
    },
  };
}

/** path ปลายทางหลัง login — รับเฉพาะ path ภายใน กัน open redirect ไปเว็บนอก */
export function safeRedirectTarget(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
