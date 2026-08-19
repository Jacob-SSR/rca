// lib/auth/ownership.ts
// ใครแก้/ลบของชิ้นไหนได้บ้าง — ตัดสินที่นี่ที่เดียว
//
// กติกา: เจ้าของแก้และลบของตัวเองได้ คนอื่นดูได้อย่างเดียว
//        ยกเว้นคนที่มีสิทธิ์ "manage" (ผู้ดูแลระบบ) ที่จัดการได้ทุกอัน
//        เพราะต้องมีคนเก็บกวาดของที่เจ้าของลาออกไปแล้วได้
//
// ⚠️ ของเก่าที่ไม่มีเจ้าของ (createdBy เป็น null — สร้างก่อนมีระบบนี้)
//    ให้ถือว่าไม่มีใครเป็นเจ้าของ ต้องมีสิทธิ์ manage เท่านั้นถึงจะแตะได้
//    ปล่อยให้ใครก็ได้แก้จะกลายเป็นช่องโหว่ทันทีที่ createdBy เป็น null

import { hasCapability } from "@/lib/auth/permissions";
import type { Session } from "@/lib/auth/session";

export type Owned = { createdBy?: string | null };

/** เจ้าของตัวจริงไหม (ไม่นับสิทธิ์ manage) */
export function isOwner(session: Session | null, item: Owned): boolean {
  const owner = (item.createdBy ?? "").trim();
  if (owner === "") return false;
  return owner.toLowerCase() === (session?.username ?? "").trim().toLowerCase();
}

/** แก้/ลบได้ไหม — เจ้าของ หรือผู้ดูแลระบบ */
export function canModify(session: Session | null, item: Owned): boolean {
  if (!session) return false;
  if (hasCapability(session.role, "manage")) return true;
  return isOwner(session, item);
}

export class NotOwnerError extends Error {
  readonly status = 403;
  constructor(what = "รายการนี้") {
    super(`${what}ถูกสร้างโดยผู้ใช้คนอื่น — แก้ไขหรือลบได้เฉพาะเจ้าของเท่านั้น`);
    this.name = "NotOwnerError";
  }
}

/** โยน error ถ้าไม่ใช่เจ้าของ — ใช้ใน route handler */
export function requireOwner(session: Session | null, item: Owned, what?: string): void {
  if (!canModify(session, item)) throw new NotOwnerError(what);
}
