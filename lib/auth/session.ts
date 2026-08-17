// lib/auth/session.ts
// อ่าน session จาก cookie ฝั่ง server (page / route handler)
//
// ⚠️ proxy.ts กันทุก path ไว้แล้ว แต่ห้ามพึ่ง proxy อย่างเดียว
//    เอกสาร Next.js เองระบุว่า proxy ไม่ควรเป็นชั้นตรวจสิทธิ์ชั้นเดียว
//    route ที่แตะข้อมูลผู้ป่วยต้องเรียก requireSession() ซ้ำเสมอ

import { cookies } from "next/headers";
import { TOKEN_COOKIE } from "@/lib/auth/env";
import { verifySession, type SessionPayload } from "@/lib/auth/jwt";
import { hasCapability, type Capability } from "@/lib/auth/permissions";

export type Session = SessionPayload;

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  return verifySession(token);
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "กรุณาเข้าสู่ระบบ") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "คุณไม่มีสิทธิ์ทำรายการนี้") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** ต้องล็อกอินแล้ว — ไม่งั้น throw */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/** ต้องล็อกอินและมีสิทธิ์ที่กำหนด — ไม่งั้น throw */
export async function requireCapability(capability: Capability): Promise<Session> {
  const session = await requireSession();
  if (!hasCapability(session.role, capability)) throw new ForbiddenError();
  return session;
}
