// app/api/auth/login/route.ts
// POST /api/auth/login — ตรวจกับตาราง users ตัวเดียวกับ ppc-hos-10667

import { NextResponse } from "next/server";
import { z } from "zod";
import { findUser } from "@/lib/auth/db";
import { verifyPassword } from "@/lib/auth/password";
import { signSession } from "@/lib/auth/jwt";
import { SESSION_MAX_AGE, TOKEN_COOKIE, cookieSecure } from "@/lib/auth/env";
import { capabilitiesForRole } from "@/lib/auth/permissions";
import { getClientIp, rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MINUTE = 60_000;

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});

/**
 * ข้อความเดียวกันหมดไม่ว่าจะ user ผิดหรือรหัสผิด
 * ถ้าแยกข้อความ จะกลายเป็นช่องให้ไล่เดาว่ามีใครอยู่ในระบบบ้าง
 */
const INVALID = { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };

function tooMany(retryAfterSec: number, message: string) {
  return NextResponse.json(
    { error: message, retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

export async function POST(req: Request) {
  const ip = getClientIp(req);

  // ── ชั้นที่ 1: จำกัดตาม IP — 10 ครั้ง / 5 นาที ──
  const ipLimit = rateLimit(`login:ip:${ip}`, 10, 5 * MINUTE);
  if (!ipLimit.ok) {
    return tooMany(ipLimit.retryAfterSec, "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(INVALID, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(INVALID, { status: 400 });
  }

  const { username, password } = parsed.data;

  // ── ชั้นที่ 2: จำกัดตาม username — 5 ครั้ง / 15 นาที ──
  // กันคนไล่เดารหัสของบัญชีเดียวจากหลาย IP
  const userKey = `login:user:${username.toLowerCase()}`;
  const userLimit = rateLimit(userKey, 5, 15 * MINUTE);
  if (!userLimit.ok) {
    return tooMany(
      userLimit.retryAfterSec,
      "บัญชีนี้ถูกพยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่",
    );
  }

  let user;
  try {
    user = await findUser(username);
  } catch (e) {
    console.error("login: ต่อฐานข้อมูลผู้ใช้ไม่ได้:", e);
    return NextResponse.json(
      { error: "ระบบยืนยันตัวตนไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลระบบ" },
      { status: 503 },
    );
  }

  // ยังต้องเรียก verifyPassword แม้ไม่พบ user เพื่อให้เวลาตอบใกล้เคียงกัน
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !ok) {
    return NextResponse.json(INVALID, { status: 401 });
  }

  const capabilities = capabilitiesForRole(user.role);
  if (capabilities.length === 0) {
    // ล็อกอินถูกต้องแต่ยังไม่ถูกตั้ง role ให้ใช้ระบบนี้
    return NextResponse.json(
      {
        error:
          "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานระบบตรวจคุณภาพเวชระเบียน กรุณาติดต่อผู้ดูแลระบบ",
      },
      { status: 403 },
    );
  }

  resetRateLimit(userKey);

  const token = await signSession({
    username: user.username,
    role: user.role,
    name: user.displayName,
  });

  const res = NextResponse.json({
    user: { username: user.username, name: user.displayName, role: user.role, capabilities },
  });

  res.cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return res;
}
