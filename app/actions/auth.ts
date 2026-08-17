"use server";

// Server Action สำหรับเข้า/ออกจากระบบ
//
// ทำเป็น Server Action ตามที่เอกสาร Next.js แนะนำ (guides/authentication)
// เพราะได้สามอย่างพร้อมกัน
//   1. ตั้ง cookie ฝั่ง server — client แก้ไม่ได้
//   2. redirect() ฝั่ง server — ไม่มี race แบบ router.push() ชนกับ router.refresh()
//   3. layout ถูก render ใหม่ทั้งชุด → แถบผู้ใช้มุมขวาบนอัปเดตทันที
//
// เคยเขียนเป็น fetch ฝั่ง client แล้ว router.push() + router.refresh()
// ผลคือ refresh() ไปยกเลิก navigation ที่ค้างอยู่ — cookie ติดและ header เปลี่ยน
// แต่ค้างหน้า login ไม่ไปไหน

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_MAX_AGE, TOKEN_COOKIE, cookieSecure } from "@/lib/auth/env";
import { authenticate, safeRedirectTarget } from "@/lib/auth/login";

export type LoginState = { error: string | null };

async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const result = await authenticate({
    username: formData.get("username"),
    password: formData.get("password"),
    ip: await clientIp(),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  (await cookies()).set(TOKEN_COOKIE, result.token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  // ⚠️ redirect() ทำงานด้วยการ throw — ต้องอยู่นอก try/catch ไม่ให้ถูกกลืน
  redirect(safeRedirectTarget(formData.get("next")?.toString()));
}

export async function logoutAction(): Promise<void> {
  (await cookies()).set(TOKEN_COOKIE, "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });

  redirect("/login");
}
