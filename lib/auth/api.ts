// lib/auth/api.ts
// แปลง error ของ auth เป็น HTTP response — ใช้ร่วมกันทุก route handler

import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/session";

/** คืน NextResponse ถ้าเป็น error ของ auth, คืน null ถ้าไม่ใช่ (ให้ผู้เรียกจัดการต่อ) */
export function authErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return null;
}
