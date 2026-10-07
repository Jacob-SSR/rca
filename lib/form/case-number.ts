// lib/form/case-number.ts
// รูปแบบเลขที่เคส — pure function แยกจาก service.ts (ที่ต้องต่อ DB) เพื่อให้เทสต์ได้โดยไม่มีฐานข้อมูล

/** ส่วนหลักของเลขเคส "HN-ปปปปดดวว" (ยังไม่กันซ้ำ) — null ถ้า HN ใช้ไม่ได้ */
export function caseNumberBase(hn?: string | null, serviceDate?: string | null, now: Date = new Date()): string | null {
  const cleanHn = (hn ?? "").trim();
  if (!/^[A-Za-z0-9]{1,20}$/.test(cleanHn)) return null;
  const iso =
    serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(serviceDate.trim())
      ? serviceDate.trim()
      : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
  const [y, m, d] = iso.split("-");
  return `${cleanHn}-${Number(y) + 543}${m}${d}`;
}

