// lib/hosxp/search-query.ts
// แยกว่าข้อความในช่องค้นหาคือ HN / เลขบัตรประชาชน / ชื่อ-สกุล
// pure ล้วน — ใช้ร่วมกันทั้งช่องค้นหาฝั่ง client และ API (ไม่แตะฐานข้อมูล)

/** HN/VN ของ HOSxP เป็นตัวเลข/ตัวอักษรล้วน */
export const HN_RE = /^[A-Za-z0-9-]{1,20}$/;

export type SearchKind = "empty" | "hn" | "cid" | "name";

/**
 * ตัวเลขล้วน 13 หลัก = เลขบัตรประชาชน, มีตัวเลขและเข้ารูป HN = HN, ที่เหลือ = ชื่อ
 * (HN ของ HOSxP ไม่ยาวถึง 13 หลัก จึงไม่ชนกับเลขบัตร)
 */
export function classifySearch(input: string): SearchKind {
  const raw = input.trim();
  if (raw === "") return "empty";
  const digits = raw.replace(/[\s-]/g, "");
  if (/^\d{13}$/.test(digits)) return "cid";
  if (HN_RE.test(raw) && /\d/.test(raw)) return "hn";
  return "name";
}

export type PatientQuery =
  | { kind: "cid"; cid: string }
  | { kind: "name"; first: string; last: string | null }
  | { kind: "invalid"; reason: string };

/** คำนำหน้าที่คนชอบพิมพ์ติดมา — ใน HOSxP แยกเก็บใน pname จึงต้องตัดก่อนค้น */
const PREFIX = /^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|mr\.?|mrs\.?|ms\.?|miss)\s*/i;

/** เลขบัตรประชาชนไทยถูกต้องตาม check digit หรือไม่ */
export function isValidThaiCid(cid: string): boolean {
  if (!/^\d{13}$/.test(cid)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(cid[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(cid[12]);
}

export function maskCid(cid: string): string {
  const c = cid.replace(/\D/g, "");
  if (c.length !== 13) return "";
  return `${c[0]}-xxxx-xxxxx-${c.slice(10, 12)}-${c[12]}`;
}

/** แปลงข้อความที่พิมพ์เป็นคำค้น — แยกที่นี่เพื่อเทสต์ได้โดยไม่ต้องมี DB */
export function parsePatientQuery(input: string): PatientQuery {
  const raw = input.trim();
  const digits = raw.replace(/[\s-]/g, "");

  if (/^\d+$/.test(digits) && digits.length === 13) {
    return isValidThaiCid(digits)
      ? { kind: "cid", cid: digits }
      : { kind: "invalid", reason: "เลขบัตรประชาชนไม่ถูกต้อง (หลักสุดท้ายไม่ตรง) — ตรวจอีกครั้ง" };
  }

  const name = raw.replace(PREFIX, "").replace(/\s+/g, " ").trim();
  if (name.length < 2) return { kind: "invalid", reason: "พิมพ์ชื่ออย่างน้อย 2 ตัวอักษร" };
  if (name.length > 100) return { kind: "invalid", reason: "ชื่อยาวเกินไป" };
  if (/[%_\\]/.test(name)) return { kind: "invalid", reason: "ชื่อมีอักขระที่ใช้ค้นไม่ได้ (% _ \\)" };

  const [first, ...rest] = name.split(" ");
  return { kind: "name", first, last: rest.length ? rest.join(" ") : null };
}

