// lib/auth/permissions.ts
// จุดเดียวที่กำหนดว่า role ไหนทำอะไรได้ในระบบ RCA
//
// ยืมโครงจาก ppc-hos-10667/lib/permissions.ts แต่ feature ของ RCA ต่างกันมาก
// ที่นั่นมีหลายสิบ dashboard แยกตามสายงาน ที่นี่มีงานเดียวคือตรวจคุณภาพเวชระเบียน
// จึงไม่แบ่งตามสายงาน แต่แบ่งตาม "ทำอะไรกับผลตรวจได้"
//
// ไฟล์นี้เป็น pure TypeScript ไม่มี dependency ภายนอก
// → import ได้ทั้งจาก proxy.ts (edge) และจาก component ฝั่ง client

/** ระดับสิทธิ์ในระบบ RCA */
export type Capability =
  | "view" // ดูผลตรวจ
  | "review" // อัปโหลด/สร้างเอกสารและสั่งตรวจ
  | "manage"; // ลบเคส แก้ timeline ของคนอื่น จัดการเกณฑ์

/**
 * ทุกบัญชีที่ล็อกอินได้ ใช้งานหลักได้ทั้งหมด — ดูผล, กรอกฟอร์ม, อัปโหลด, สั่งตรวจด้วย AI,
 * กด "ตรวจเดี๋ยวนี้" ของแผนกตัวเอง
 *
 * เดิมจำกัดตาม role (พยาบาลรายหน่วยดูได้อย่างเดียว, USER เข้าไม่ได้) แต่หน้างานจริง
 * ต้องให้ทุกหน่วยตรวจเวชระเบียนของหน่วยตัวเองได้ จึงเปิดให้ทุกคน
 *
 * ที่ยังสงวนไว้ (manage): ลบ/แก้เคสของคนอื่น และแก้ "ตารางเวลาตรวจอัตโนมัติ" ของทั้งระบบ
 * — เคสของตัวเองยังแก้/ลบได้เสมอ (ดู lib/auth/ownership.ts)
 */
export const BASE_CAPABILITIES: readonly Capability[] = ["view", "review"];

/** role ที่ได้สิทธิ์ผู้ดูแลระบบเพิ่ม (role จาก `users.role` ตารางเดียวกับ ppc-hos-10667) */
export const ROLE_CAPABILITIES: Record<string, readonly Capability[]> = {
  ADMIN: ["view", "review", "manage"],
  IT: ["view", "review", "manage"],
  DIRECTOR: ["view", "review", "manage"],
  DOCTOR: ["view", "review", "manage"],
  // เวชระเบียน / งานประกัน — เป็นเจ้าของงานตรวจคุณภาพตัวจริง
  FINANCE: ["view", "review", "manage"],
};

/**
 * สิทธิ์ของ role — ไม่มี role (ยังไม่ล็อกอิน) = ไม่มีสิทธิ์อะไรเลย
 * มี role อะไรก็ตาม = อย่างน้อย BASE_CAPABILITIES
 */
export function capabilitiesForRole(role: string | null | undefined): readonly Capability[] {
  const r = (role ?? "").trim().toUpperCase();
  if (r === "") return [];
  return [...new Set([...BASE_CAPABILITIES, ...(ROLE_CAPABILITIES[r] ?? [])])];
}

export function hasCapability(
  role: string | null | undefined,
  capability: Capability,
): boolean {
  return capabilitiesForRole(role).includes(capability);
}

// ─────────────────────────────────────────────────────────────────────────────
// การแมป path → สิทธิ์ที่ต้องใช้
//
// หลักการ: DENY BY DEFAULT
// path ที่ไม่ตรงกับกฎไหนเลย ต้องมีอย่างน้อยสิทธิ์ "view"
// → สร้าง route ใหม่แล้วลืมมาแก้ไฟล์นี้ ก็ยังถูกล็อกอัตโนมัติ ไม่หลุดเป็น public
// ─────────────────────────────────────────────────────────────────────────────

/** path ที่เข้าได้โดยไม่ต้องล็อกอิน — สั้นที่สุดเท่าที่จำเป็น */
export const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/me"];

/** path ที่ต้องมีสิทธิ์ "review" */
const REVIEW_PATHS = ["/api/review", "/api/cases", "/api/forms", "/api/auto-audit"];

/** path ที่ต้องมีสิทธิ์ "manage" */
const MANAGE_PATHS = ["/api/admin"];

function startsWithPath(pathname: string, prefix: string): boolean {
  return (
    pathname === prefix ||
    pathname.startsWith(prefix + "/") ||
    pathname.startsWith(prefix + "?")
  );
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => startsWithPath(pathname, p));
}

/** สิทธิ์ขั้นต่ำที่ path นี้ต้องการ */
export function requiredCapability(pathname: string): Capability {
  if (MANAGE_PATHS.some((p) => startsWithPath(pathname, p))) return "manage";
  if (REVIEW_PATHS.some((p) => startsWithPath(pathname, p))) return "review";
  return "view";
}

export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  return hasCapability(role, requiredCapability(pathname));
}

/**
 * GET บน path กลุ่ม review ควรให้คนที่มีแค่ "view" อ่านได้
 * (ดูรายการเคส/ผลตรวจ) — จำกัดเฉพาะ method ที่เปลี่ยนข้อมูล
 */
export function canAccessRequest(
  role: string | null | undefined,
  pathname: string,
  method: string,
): boolean {
  const needed = requiredCapability(pathname);

  if (needed === "review" && method.toUpperCase() === "GET") {
    return hasCapability(role, "view");
  }

  return hasCapability(role, needed);
}
