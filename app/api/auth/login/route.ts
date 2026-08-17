// app/api/auth/login/route.ts
// POST /api/auth/login — สำหรับเรียกจากภายนอก UI (สคริปต์ / ทดสอบ)
//
// หน้า login ในระบบใช้ Server Action `loginAction` ไม่ผ่าน route นี้
// แต่ตรรกะการยืนยันตัวตนใช้ตัวเดียวกัน (lib/auth/login.ts) จึงไม่มีทางเพี้ยนกัน

import { NextResponse } from "next/server";
import { SESSION_MAX_AGE, TOKEN_COOKIE, cookieSecure } from "@/lib/auth/env";
import { authenticate } from "@/lib/auth/login";
import { getClientIp } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const input = (body ?? {}) as { username?: unknown; password?: unknown };

  const result = await authenticate({
    username: input.username,
    password: input.password,
    ip: getClientIp(req),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      {
        status: result.status,
        headers: result.retryAfterSec
          ? { "Retry-After": String(result.retryAfterSec) }
          : undefined,
      },
    );
  }

  const res = NextResponse.json({ user: result.user });

  res.cookies.set(TOKEN_COOKIE, result.token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return res;
}
