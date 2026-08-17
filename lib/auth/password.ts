// lib/auth/password.ts
// ตรวจรหัสผ่านกับค่าใน `users.passweb`
//
// ตารางนั้นมีรหัสสองรูปแบบปนกัน เพราะ ppc-hos-10667 ทยอยอัปเกรดจาก md5 เป็น bcrypt
// ตอนคนล็อกอิน — RCA จึงต้องรองรับทั้งสองแบบ
//
// ⚠️ RCA ไม่อัปเกรด hash และไม่เขียนอะไรกลับลงตารางนั้น
//    ปล่อยให้ ppc-hos-10667 เป็นเจ้าของการเขียนระบบเดียว

import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

/** เทียบสตริงแบบไม่รั่วข้อมูลผ่านเวลาที่ใช้เปรียบเทียบ */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false;

  // bcrypt — รูปแบบใหม่
  if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
    try {
      return await bcrypt.compare(plain, stored);
    } catch {
      return false;
    }
  }

  // md5 — รูปแบบเดิม (32 hex)
  if (/^[0-9a-f]{32}$/i.test(stored)) {
    return safeEqual(md5Hex(plain).toLowerCase(), stored.toLowerCase());
  }

  // รูปแบบที่ไม่รู้จัก — ปฏิเสธ ไม่เดา
  return false;
}
