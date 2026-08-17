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
 * role จาก `users.role` (ตารางเดียวกับ ppc-hos-10667) → สิทธิ์ใน RCA
 *
 * เกณฑ์ที่ใช้ตัดสิน: การตรวจคุณภาพการบันทึกเวชระเบียนเป็นงานของ
 * เวชระเบียน/ประกัน (FINANCE) แพทย์ (DOCTOR) และผู้บริหาร (DIRECTOR)
 * พยาบาลควรเห็นผลของหน่วยตัวเองได้เพื่อนำไปปรับปรุง แต่ไม่ต้องสั่งตรวจ
 *
 * role ที่ไม่อยู่ในตารางนี้ → ไม่มีสิทธิ์อะไรเลย (deny by default)
 */
export const ROLE_CAPABILITIES: Record<string, readonly Capability[]> = {
  ADMIN: ["view", "review", "manage"],
  IT: ["view", "review", "manage"],
  DIRECTOR: ["view", "review", "manage"],
  DOCTOR: ["view", "review", "manage"],

  // เวชระเบียน / งานประกัน — เป็นเจ้าของงานตรวจคุณภาพตัวจริง
  FINANCE: ["view", "review", "manage"],

  // หัวหน้าพยาบาล — ตรวจได้ ลบไม่ได้
  NURSE: ["view", "review"],

  // พยาบาลรายหน่วย — ดูผลได้อย่างเดียว เอาไปปรับปรุงการบันทึกของหน่วยตัวเอง
  NURSE_OPD: ["view"],
  NURSE_IPD: ["view"],
  NURSE_ER: ["view"],
  NURSE_LR: ["view"],
  NURSE_IC: ["view"],

  // ยังไม่ถูกจัดสายงาน — เข้าระบบได้แต่ยังไม่เห็นอะไร ต้องให้ ADMIN ตั้ง role ก่อน
  USER: [],
};

export function capabilitiesForRole(role: string | null | undefined): readonly Capability[] {
  const r = (role ?? "USER").toUpperCase();
  return ROLE_CAPABILITIES[r] ?? [];
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
const REVIEW_PATHS = ["/api/review", "/api/cases", "/api/forms"];

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
