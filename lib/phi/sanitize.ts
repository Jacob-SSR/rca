// lib/phi/sanitize.ts
// PHI Data Minimization — ต้องรันก่อนส่งข้อความเข้า AI ทุกครั้ง ไม่มีข้อยกเว้น (สเปกข้อ 2.3)
//
// mask:     ชื่อ-สกุล, HN, เลขบัตรประชาชน, ที่อยู่, เบอร์โทร
// ห้าม mask: อายุ, เพศ, โรคร่วม/โรคประจำตัว, ค่าตรวจร่างกาย, ชื่อยา
//            → มีผลต่อการประเมินเกณฑ์ และ evidence ต้องเป็นข้อความคลินิกจริง
//
// หลักการเขียน regex ที่นี่: "จับให้แคบ" ดีกว่า "จับให้กว้าง"
// mask เกินจะทำลาย evidence (เช่นกลืนคำว่า URI) ซึ่งผิดสเปกข้อ 2.3 หนักกว่าการหลุด PHI เล็กน้อย
// จึงยึด anchor ที่ label (HN:, ชื่อ:, โทร:) เป็นหลัก ไม่เดาจากรูปคำลอยๆ

export const MASK = {
  NAME: "[ชื่อ]",
  HN: "[HN]",
  CID: "[เลขบัตรประชาชน]",
  ADDRESS: "[ที่อยู่]",
  PHONE: "[เบอร์โทร]",
} as const;

export type MaskKind = keyof typeof MASK;

export type SanitizeResult = {
  text: string;
  /** จำนวนครั้งที่ mask แต่ละประเภท — ใช้ตรวจว่า sanitizer ทำงานจริง */
  counts: Record<MaskKind, number>;
};

type Pattern = { kind: MaskKind; re: RegExp; replace: (m: RegExpMatchArray) => string };

// คำนำหน้าชื่อไทยที่ใช้เป็น anchor ของ "ชื่อ-สกุล"
const THAI_TITLES = [
  "นาย",
  "นางสาว",
  "นาง",
  "ด\\.ช\\.",
  "ด\\.ญ\\.",
  "เด็กชาย",
  "เด็กหญิง",
  "น\\.ส\\.",
];

const PATTERNS: Pattern[] = [
  // ── เลขบัตรประชาชน 13 หลัก (มี/ไม่มีขีดคั่น) ────────────────────────────────
  // ต้องมาก่อน HN เพราะยาวกว่าและเฉพาะเจาะจงกว่า
  {
    kind: "CID",
    re: /\b\d{1}[-\s]?\d{4}[-\s]?\d{5}[-\s]?\d{2}[-\s]?\d{1}\b/g,
    replace: () => MASK.CID,
  },
  {
    kind: "CID",
    re: /(เลขบัตรประชาชน|เลขประจำตัวประชาชน|บัตรประชาชน|CID)\s*[:：]?\s*[\d-\s]{13,20}/gi,
    replace: (m) => `${m[1]}: ${MASK.CID}`,
  },

  // ── HN / VN — ต้องมี label นำเสมอ ห้ามจับเลขลอยๆ (เลขลอยอาจเป็นค่าแล็บ) ─────
  {
    kind: "HN",
    re: /\b(HN|VN|AN|เลขที่ผู้ป่วย|หมายเลขผู้ป่วย)\s*[:：.]?\s*[\dA-Za-z-/]{4,20}/gi,
    replace: (m) => `${m[1]}: ${MASK.HN}`,
  },

  // ── เบอร์โทร ────────────────────────────────────────────────────────────────
  {
    kind: "PHONE",
    re: /\b0\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}\b/g,
    replace: () => MASK.PHONE,
  },
  {
    kind: "PHONE",
    re: /(โทรศัพท์|เบอร์โทร|โทร|Tel|Phone)\s*[:：.]?\s*[\d\s()+-]{6,20}/gi,
    replace: (m) => `${m[1]}: ${MASK.PHONE}`,
  },

  // ── ชื่อ-สกุล ───────────────────────────────────────────────────────────────
  // 1) มี label "ชื่อ-สกุล:" / "ชื่อผู้ป่วย:" นำหน้า
  {
    kind: "NAME",
    re: /(ชื่อ[-\s]?สกุล|ชื่อผู้ป่วย|ชื่อ-นามสกุล|ผู้ป่วยชื่อ|Name|Patient)\s*[:：.]?\s*[^\n,;|]{1,60}/gi,
    replace: (m) => `${m[1]}: ${MASK.NAME}`,
  },
  // 2) คำนำหน้าชื่อไทย + คำไทย 1-2 คำ (ชื่อ + สกุล)
  {
    kind: "NAME",
    re: new RegExp(`(?:${THAI_TITLES.join("|")})\\s*[ก-๙]+(?:\\s+[ก-๙]+)?`, "g"),
    replace: () => MASK.NAME,
  },
  // 3) แพทย์/พยาบาลผู้บันทึก — เป็น PHI ของบุคลากร ไม่ใช่ข้อมูลคลินิก
  {
    kind: "NAME",
    re: /(นพ\.|พญ\.|ทพ\.|ทพญ\.|ภก\.|ภญ\.|พว\.|Dr\.)\s*[ก-๙A-Za-z]+(?:\s+[ก-๙A-Za-z]+)?/g,
    replace: () => MASK.NAME,
  },

  // ── ที่อยู่ ─────────────────────────────────────────────────────────────────
  {
    kind: "ADDRESS",
    re: /(ที่อยู่|บ้านเลขที่|Address)\s*[:：.]?\s*[^\n]{1,120}/gi,
    replace: (m) => `${m[1]}: ${MASK.ADDRESS}`,
  },
  // "บ้านเลขที่ 99/1 หมู่ 5 ต.xxx อ.xxx จ.xxx" แบบไม่มี label
  {
    kind: "ADDRESS",
    re: /\d+(?:\/\d+)?\s*(?:หมู่|ม\.)\s*\d+\s*(?:ต\.|ตำบล)[^\s]+\s*(?:อ\.|อำเภอ)[^\s]+\s*(?:จ\.|จังหวัด)[^\s]+/g,
    replace: () => MASK.ADDRESS,
  },
  {
    kind: "ADDRESS",
    re: /(?:ต\.|ตำบล)\s?[ก-๙]+\s*(?:อ\.|อำเภอ)\s?[ก-๙]+\s*(?:จ\.|จังหวัด)\s?[ก-๙]+/g,
    replace: () => MASK.ADDRESS,
  },
];

/**
 * ลบ PHI ออกจากข้อความก่อนส่งเข้า AI
 * ไม่ทำลายข้อความคลินิก (อาการ, ค่าตรวจ, ชื่อยา, คำวินิจฉัย, อายุ, เพศ)
 */
export function sanitizePHI(input: string): SanitizeResult {
  const counts: Record<MaskKind, number> = { NAME: 0, HN: 0, CID: 0, ADDRESS: 0, PHONE: 0 };
  let text = input;

  for (const p of PATTERNS) {
    text = text.replace(p.re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpMatchArray;
      counts[p.kind] += 1;
      return p.replace(m);
    });
  }

  return { text, counts };
}

/** รวมจำนวน mask ทั้งหมด */
export function totalMasked(counts: Record<MaskKind, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

const MASK_TOKENS = Object.values(MASK);

/**
 * evidence ต้องเป็นข้อความทางคลินิกจริง ไม่ใช่ mask token ล้วนๆ (สเปกข้อ 2.3)
 * คืน true ถ้า evidence ใช้ได้
 */
export function isUsableEvidence(evidence: string): boolean {
  const trimmed = evidence.trim();
  if (!trimmed) return false;

  let stripped = trimmed;
  for (const token of MASK_TOKENS) {
    stripped = stripped.split(token).join("");
  }
  // เหลือตัวอักษร/ตัวเลขที่ไม่ใช่เครื่องหมายวรรคตอนอย่างน้อย 2 ตัว
  return stripped.replace(/[\s:：.,;|\-/]/g, "").length >= 2;
}
