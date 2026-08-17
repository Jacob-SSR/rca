// lib/form/thai-date.ts
// แปลงวันที่ระหว่าง "รูปแบบที่เก็บ" กับ "รูปแบบที่แสดงในเอกสาร"
//
// เก็บใน DB เป็น ISO `YYYY-MM-DD` (ค.ศ.) เพราะ <input type="date"> ใช้รูปแบบนี้
// และเรียงลำดับได้จริง — แต่เอกสารเวชระเบียนต้องแสดงเป็นวันที่ไทย พ.ศ.
//
// ⚠️ ต้องรองรับข้อความอิสระด้วย ฟอร์มเก่าที่กรอกก่อนมี date picker เก็บเป็น
// "14 สิงหาคม 2569" ตรงๆ — ค่าที่แปลงไม่ได้ต้องส่งผ่านไปเหมือนเดิม ห้ามทิ้ง

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

/** ค่านี้เป็น ISO `YYYY-MM-DD` ไหม (ใช้ตัดสินว่า date picker แสดงค่านี้ได้) */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value.trim());
  if (!m) return false;

  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  // เช็คว่าวันที่มีอยู่จริง — "2026-02-30" ผ่าน regex แต่ไม่มีในปฏิทิน
  return (
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(mo) - 1 &&
    date.getDate() === Number(d)
  );
}

/**
 * ISO → วันที่ไทย พ.ศ. เช่น "2026-08-14" → "14 สิงหาคม 2569"
 * ค่าที่ไม่ใช่ ISO คืนกลับไปเหมือนเดิม (ฟอร์มเก่าที่พิมพ์เป็นข้อความไทยอยู่แล้ว)
 */
export function formatThaiDate(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (!isIsoDate(raw)) return raw;

  const [y, mo, d] = raw.split("-").map(Number);
  // พ.ศ. = ค.ศ. + 543
  return `${d} ${THAI_MONTHS[mo - 1]} ${y + 543}`;
}

/**
 * เวลาที่เก็บ (HH:mm หรือ HH:mm:ss) → "HH:mm"
 * ค่าที่ไม่เข้ารูปแบบคืนกลับไปเหมือนเดิม
 */
export function formatTime(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!m) return raw;

  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return raw;

  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
