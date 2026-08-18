// lib/audit-forms/registry.ts
// นิยามแบบฟอร์มทั้ง 8 ใบในภาคผนวก ข ของคู่มือ สนย. มีนาคม 2558
//
// ที่นี่คือแหล่งความจริงเดียว — ทั้งหน้าจอกรอก ตัวคำนวณ และไฟล์ DOCX
// อ่านจากตัวนี้ทั้งหมด เพิ่มคอลัมน์ที่เดียวแล้วไปโผล่ครบทุกที่
// ถ้าแยกกันนิยาม สักวันตารางบนจอกับในไฟล์จะไม่ตรงกันโดยไม่มีใครรู้
//
// เลขหน้าที่อ้างคือหน้าใน PDF ของคู่มือ
//   A1 หน้า 17 (ตัวอย่าง) / 55 (ฟอร์มเปล่า)   A2 หน้า 56
//   A3 หน้า 27 (ตัวอย่าง) / 57                A4 หน้า 58
//   B1 หน้า 59   B2 หน้า 60   B3 หน้า 61   C1 หน้า 62
//
// ⚠️ ห้ามสลับ/เพิ่มคอลัมน์เอง ฟอร์มพวกนี้ถูกส่งให้ สสจ. และถูกเอาไปเทียบกับ
//    ของโรงพยาบาลอื่น ถ้าโครงไม่ตรงต้นฉบับ คนอ่านจะเทียบไม่ได้

/** ผลการตรวจรหัส ICD — สัญลักษณ์ตามคู่มือหน้า 15-16 (OPD) และ 25-26 (IPD) */
export const ICD_RESULTS = [
  { code: "Y", label: "Y — ให้รหัสถูกต้อง" },
  { code: "A", label: "A — ให้รหัสผิดพลาด" },
  { code: "B", label: "B — มีรหัสทั้งที่ไม่มีคำวินิจฉัยในบันทึก" },
  { code: "C", label: "C — รหัสด้อยคุณภาพ (คำวินิจฉัยไม่บอกชนิด/ตำแหน่ง)" },
  { code: "D", label: "D — รหัสมีตัวเลขไม่ครบทุกตำแหน่ง" },
  { code: "E", label: "E — ใช้สาเหตุภายนอก (V,W,X,Y) เป็นรหัสโรคหลัก" },
  { code: "F", label: "F — รหัสมีตัวเลขมากเกินไป" },
  { code: "G", label: "G — ควรมีรหัสนี้ แต่ไม่ปรากฏในข้อมูล" },
  { code: "H", label: "H — ไม่ควรมีรหัสนี้ แต่มีในข้อมูล" },
] as const;

/** สัญลักษณ์ที่นับว่า "ผิด" — ทุกตัวยกเว้น Y */
export const ICD_ERROR_CODES = ICD_RESULTS.map((r) => r.code).filter((c) => c !== "Y");

/**
 * ประเภทรหัส — คู่มือหน้า 25
 * OPD ใช้แค่ 1, 4, 5, P / IPD ใช้ครบ (มีโรคร่วม-โรคแทรก)
 */
const ICD_TYPES_IPD = [
  { code: "1", label: "1 — โรคหลัก" },
  { code: "2", label: "2 — โรคร่วม" },
  { code: "3", label: "3 — โรคแทรก" },
  { code: "4", label: "4 — โรคอื่น" },
  { code: "5", label: "5 — สาเหตุภายนอก" },
  { code: "P", label: "P — หัตถการ" },
];

const ICD_TYPES_OPD = ICD_TYPES_IPD.filter((t) => !["2", "3"].includes(t.code));

export type ColumnKind = "text" | "date" | "time" | "int" | "score" | "select" | "computed";

/** สูตรของช่องที่ระบบคิดให้ ไม่ให้คนกรอก */
export type ComputeKind = "maxScore" | "gotScore" | "percent";

export type FormColumn = {
  key: string;
  header: string;
  kind: ColumnKind;
  /** ความกว้างในไฟล์ DOCX (%) — รวมทุกคอลัมน์ต้องได้ 100 */
  width: number;
  /** kind="score" — คะแนนเต็มของหัวข้อนี้ */
  max?: number;
  /** kind="score" — ให้เลือก na ได้ (คู่มือระบุว่าหัวข้อไหน "ไม่ประเมิน" ได้บ้าง) */
  allowNA?: boolean;
  /** kind="select" */
  options?: { code: string; label: string }[];
  /** kind="computed" */
  compute?: ComputeKind;
  /** kind="computed" compute="percent" — เอาคีย์ไหนหารคีย์ไหน */
  numerator?: string;
  denominator?: string;
  /** คำอธิบายสั้นๆ ใต้หัวคอลัมน์ในหน้าจอกรอก (ไม่ลงไฟล์) */
  hint?: string;
};

/** ช่องบนหัวฟอร์มที่ต้องเติมก่อนตาราง */
export type FormMetaField = { key: string; label: string; kind: "text" | "date" };

/** บรรทัดสรุปท้ายฟอร์ม — แต่ละตระกูลสรุปคนละแบบ */
export type SummaryKind = "score" | "icdError" | "none";

export type AuditFormDef = {
  code: string;
  /** ชื่อเต็มตามที่พิมพ์บนหัวฟอร์มในคู่มือ */
  title: string;
  /** ใครเป็นคนใช้ฟอร์มนี้ — กันคนเปิดผิดใบ */
  scope: string;
  sourcePage: string;
  meta: FormMetaField[];
  columns: FormColumn[];
  summary: SummaryKind;
  /** ข้อความกำกับท้ายฟอร์ม (กติกาการกรอกจากคู่มือ) */
  notes: string[];
  /**
   * ฟอร์มนี้ดึง "รหัสที่มีอยู่แล้ว" จาก HOSxP มาเติมได้
   *
   * ผู้ตรวจสอบไม่ได้เป็นคนคิดรหัสพวกนี้ขึ้นมา เขามาตรวจว่ารหัสที่คนอื่นให้ไว้
   * ถูกหรือไม่ ตัวรหัสจึงมีอยู่ในระบบอยู่แล้ว — ให้พิมพ์ใหม่คือให้ทำงานซ้ำ
   * และเสี่ยงพิมพ์ผิดจนตรวจผิดตัว
   */
  icdLookup?: { kind: "opd" | "ipd"; keyColumn: string; dateColumn?: string };
};

const HOSPITAL_META: FormMetaField[] = [
  { key: "hospitalCode", label: "รหัสสถานพยาบาล", kind: "text" },
  { key: "hospitalName", label: "ชื่อสถานพยาบาล", kind: "text" },
  { key: "auditDate", label: "วันที่", kind: "date" },
  { key: "reviewer", label: "ตรวจโดย", kind: "text" },
];

const PROVINCE_META: FormMetaField[] = [
  { key: "province", label: "จังหวัด", kind: "text" },
  { key: "periodFrom", label: "ช่วงวันที่ (เริ่ม)", kind: "date" },
  { key: "periodTo", label: "ช่วงวันที่ (ถึง)", kind: "date" },
  { key: "reviewer", label: "ตรวจโดย", kind: "text" },
];

const NOTE_COLUMN: FormColumn = { key: "note", header: "หมายเหตุ", kind: "text", width: 20 };

/** คอลัมน์ท้ายของฟอร์มให้คะแนน (A1/A3) — ระบบคิดให้ทั้งคู่ */
const SCORE_TAIL: FormColumn[] = [
  {
    key: "maxScore",
    header: "คะแนนเต็ม",
    kind: "computed",
    compute: "maxScore",
    width: 7,
    hint: "หัวข้อที่เป็น na ไม่ถูกนำคะแนนเต็มมารวม",
  },
  { key: "gotScore", header: "คะแนนที่ได้", kind: "computed", compute: "gotScore", width: 7 },
];

/** คอลัมน์กลางของฟอร์มตรวจรหัส ICD (A2/A4) — เหมือนกันทั้งสองใบ */
function icdColumns(forIpd: boolean): FormColumn[] {
  return [
    {
      key: "diagnosis",
      header: "การวินิจฉัย หรือเหตุผลที่มารับบริการ",
      kind: "text",
      width: 22,
    },
    { key: "seq", header: "ลำดับ", kind: "int", width: 5 },
    {
      key: "icdType",
      header: "ประเภท",
      kind: "select",
      options: forIpd ? ICD_TYPES_IPD : ICD_TYPES_OPD,
      width: 8,
    },
    { key: "icd", header: "ICD", kind: "text", width: 9, hint: "รหัสที่อยู่ในข้อมูลเดิม" },
    {
      key: "auditIcd",
      header: "AuditICD",
      kind: "text",
      width: 9,
      hint: "รหัสที่ผู้ตรวจสอบให้เอง",
    },
    {
      key: "result",
      header: "ผลการตรวจ",
      kind: "select",
      options: [...ICD_RESULTS],
      width: 10,
    },
  ];
}

/** กติกาการกรอกตารางรหัส — คู่มือหน้า 16 / 26 */
const ICD_NOTES = [
  "ข้อมูลผู้ป่วย 1 ราย อาจอยู่ใน 1 หรือหลายบรรทัด",
  "รหัส ICD 1 รหัส อยู่ใน 1 บรรทัดเท่านั้น ห้ามกรอกเกิน 1 รหัสต่อบรรทัด",
  "การกรอกข้อมูลประเภทรหัสหัตถการ ให้กำหนดประเภทรหัสเป็น P",
];

const SCORE_NOTES = [
  "ข้อมูลผู้ป่วย 1 ราย อยู่ใน 1 บรรทัด",
  "คะแนนเต็ม คือ ผลรวมคะแนนสูงสุดที่เป็นไปได้ ถ้าหัวข้อใดเป็น na ไม่ต้องนำคะแนนเต็มของหัวข้อนั้นมารวม",
];

export const AUDIT_FORMS: AuditFormDef[] = [
  // ── A1 : OPD คุณภาพการบันทึก ───────────────────────────────────────────────
  {
    code: "A1",
    title: "ตารางบันทึกผลการตรวจสอบคุณภาพการบันทึกข้อมูลผู้ป่วยนอก",
    scope: "โรงพยาบาล · ผู้ป่วยนอก · คุณภาพการบันทึก",
    sourcePage: "คู่มือ สนย. หน้า 17 (ตัวอย่าง) และ 55 (ฟอร์มเปล่า)",
    meta: HOSPITAL_META,
    columns: [
      { key: "hn", header: "HN", kind: "text", width: 9 },
      { key: "date", header: "วันที่", kind: "date", width: 8 },
      { key: "time", header: "เวลา", kind: "time", width: 6 },
      { key: "serviceDatetime", header: "วัน/เวลา", kind: "score", max: 1, width: 6 },
      { key: "cc", header: "CC", kind: "score", max: 2, width: 6 },
      { key: "history", header: "ประวัติ", kind: "score", max: 3, width: 6 },
      { key: "physicalExam", header: "ตรวจร่างกาย", kind: "score", max: 4, width: 6 },
      { key: "diagnosis", header: "คำวินิจฉัย", kind: "score", max: 4, allowNA: true, width: 6 },
      { key: "treatment", header: "การรักษา", kind: "score", max: 3, allowNA: true, width: 6 },
      ...SCORE_TAIL,
      { ...NOTE_COLUMN, width: 27 },
    ],
    summary: "score",
    notes: SCORE_NOTES,
  },

  // ── A2 : OPD คุณภาพการให้รหัส ICD ─────────────────────────────────────────
  {
    code: "A2",
    title: "ตารางบันทึกผลการตรวจสอบคุณภาพการให้รหัส ICD ผู้ป่วยนอก",
    scope: "โรงพยาบาล · ผู้ป่วยนอก · คุณภาพรหัส ICD",
    sourcePage: "คู่มือ สนย. หน้า 56",
    meta: HOSPITAL_META,
    columns: [
      { key: "hn", header: "HN", kind: "text", width: 9 },
      { key: "date", header: "วันที่", kind: "date", width: 8 },
      { key: "time", header: "เวลา", kind: "time", width: 6 },
      ...icdColumns(false),
      { ...NOTE_COLUMN, width: 14 },
    ],
    summary: "icdError",
    notes: ICD_NOTES,
    icdLookup: { kind: "opd", keyColumn: "hn", dateColumn: "date" },
  },

  // ── A3 : IPD คุณภาพการบันทึก ──────────────────────────────────────────────
  {
    code: "A3",
    title: "ตารางบันทึกผลการตรวจสอบคุณภาพการบันทึกข้อมูลผู้ป่วยใน",
    scope: "โรงพยาบาล · ผู้ป่วยใน · คุณภาพการบันทึก",
    sourcePage: "คู่มือ สนย. หน้า 27 (ตัวอย่าง) และ 57 (ฟอร์มเปล่า)",
    meta: HOSPITAL_META,
    columns: [
      { key: "an", header: "AN", kind: "text", width: 9 },
      { key: "dischargeDate", header: "วันที่จำหน่าย", kind: "date", width: 9 },
      // ⚠️ DS1 ต่ำสุดคือ 1 ไม่ใช่ 0 — คู่มือหน้า 22 ไม่มีเกณฑ์คะแนน 0 ของหัวข้อนี้
      {
        key: "ds1",
        header: "DS1",
        kind: "score",
        max: 4,
        width: 5,
        hint: "Discharge Summary ส่วนของแพทย์ (ต่ำสุด 1)",
      },
      {
        key: "ds2",
        header: "DS2",
        kind: "score",
        max: 3,
        width: 5,
        hint: "Discharge Summary ส่วนอื่น",
      },
      { key: "hx", header: "Hx", kind: "score", max: 4, width: 5, hint: "บันทึกประวัติ" },
      { key: "pe", header: "PE", kind: "score", max: 4, width: 5, hint: "บันทึกการตรวจร่างกาย" },
      { key: "progress", header: "Progress", kind: "score", max: 4, width: 6, hint: "Progress Note" },
      {
        key: "op",
        header: "Op",
        kind: "score",
        max: 4,
        allowNA: true,
        width: 5,
        hint: "บันทึกการผ่าตัด — ไม่มีผ่าตัดให้เลือก na",
      },
      {
        key: "ob",
        header: "OB",
        kind: "score",
        max: 4,
        allowNA: true,
        width: 5,
        hint: "บันทึกการคลอด — ไม่มีคลอดให้เลือก na",
      },
      { key: "nurse", header: "Nurse", kind: "score", max: 4, width: 6, hint: "Nurses’ Note" },
      ...SCORE_TAIL,
      { ...NOTE_COLUMN, width: 26 },
    ],
    summary: "score",
    notes: [
      ...SCORE_NOTES,
      "DS1 = Discharge Summary ส่วนของแพทย์, DS2 = Discharge Summary ส่วนอื่น, Hx = บันทึกประวัติ, " +
        "PE = บันทึกการตรวจร่างกาย, Progress = Progress Note, Op = บันทึกการผ่าตัด, " +
        "OB = บันทึกการคลอด, Nurse = Nurses’ Note",
    ],
  },

  // ── A4 : IPD คุณภาพการให้รหัส ICD ─────────────────────────────────────────
  {
    code: "A4",
    title: "ตารางบันทึกผลการตรวจสอบคุณภาพการให้รหัส ICD ผู้ป่วยใน",
    scope: "โรงพยาบาล · ผู้ป่วยใน · คุณภาพรหัส ICD",
    sourcePage: "คู่มือ สนย. หน้า 28 (ตัวอย่าง) และ 58 (ฟอร์มเปล่า)",
    meta: HOSPITAL_META,
    columns: [
      { key: "an", header: "AN", kind: "text", width: 9 },
      { key: "dischargeDate", header: "วันที่จำหน่าย", kind: "date", width: 9 },
      ...icdColumns(true),
      { ...NOTE_COLUMN, width: 19 },
    ],
    summary: "icdError",
    notes: ICD_NOTES,
    icdLookup: { kind: "ipd", keyColumn: "an" },
  },

  // ── B1 : Data Center จังหวัด — ผลตรวจตามกฎ ────────────────────────────────
  {
    code: "B1",
    title: "ตารางแสดงผลการตรวจสอบคุณภาพการให้รหัส ICD ตามกฎ ณ Data Center",
    scope: "สสจ. · เทียบผลตามกฎรายสถานพยาบาล",
    sourcePage: "คู่มือ สนย. หน้า 34 (ตัวอย่าง) และ 59 (ฟอร์มเปล่า)",
    meta: PROVINCE_META,
    columns: [
      { key: "hospitalCode", header: "รหัสสถานพยาบาล", kind: "text", width: 16 },
      { key: "rule", header: "กฎที่ตรวจสอบ", kind: "text", width: 16 },
      { key: "found", header: "จำนวน case ที่พบ", kind: "int", width: 14 },
      { key: "total", header: "จำนวน case ทั้งหมด", kind: "int", width: 15 },
      {
        key: "percent",
        header: "สัดส่วน (%)",
        kind: "computed",
        compute: "percent",
        numerator: "found",
        denominator: "total",
        width: 12,
      },
      { ...NOTE_COLUMN, width: 27 },
    ],
    summary: "none",
    notes: [],
  },

  // ── B2 : เทียบคุณภาพรหัสระหว่างสถานพยาบาล ─────────────────────────────────
  {
    code: "B2",
    title: "ตารางเปรียบเทียบคุณภาพการให้รหัส ICD ตามกฎระหว่างสถานพยาบาล",
    scope: "สสจ. · เทียบระหว่างสถานพยาบาลในจังหวัด",
    sourcePage: "คู่มือ สนย. หน้า 35 (ตัวอย่าง) และ 60 (ฟอร์มเปล่า)",
    meta: PROVINCE_META,
    columns: [
      { key: "hospitalCode", header: "รหัสสถานพยาบาล", kind: "text", width: 18 },
      { key: "wrong", header: "จำนวน case ที่ผิด", kind: "int", width: 16 },
      { key: "total", header: "จำนวน case ทั้งหมด", kind: "int", width: 17 },
      {
        key: "percent",
        header: "สัดส่วน (%)",
        kind: "computed",
        compute: "percent",
        numerator: "wrong",
        denominator: "total",
        width: 13,
      },
      { ...NOTE_COLUMN, width: 36 },
    ],
    summary: "none",
    notes: [],
  },

  // ── B3 : เทียบรายอำเภอ ────────────────────────────────────────────────────
  {
    code: "B3",
    title:
      "ตารางเปรียบเทียบคุณภาพการบันทึกข้อมูลการให้บริการ และคุณภาพการให้รหัส ICD ของสถานพยาบาลในแต่ละอำเภอ",
    scope: "สสจ. · เทียบรายอำเภอ",
    sourcePage: "คู่มือ สนย. หน้า 36 (ตัวอย่าง) และ 61 (ฟอร์มเปล่า)",
    meta: [
      { key: "province", label: "จังหวัด", kind: "text" },
      { key: "periodFrom", label: "ช่วงวันที่ (เริ่ม)", kind: "date" },
      { key: "periodTo", label: "ช่วงวันที่ (ถึง)", kind: "date" },
    ],
    columns: [
      { key: "district", header: "อำเภอ", kind: "text", width: 16 },
      { key: "qualityScore", header: "คะแนนคุณภาพการบันทึกข้อมูล", kind: "text", width: 20 },
      { key: "wrong", header: "จำนวน case ที่ให้รหัสผิด", kind: "int", width: 16 },
      { key: "total", header: "จำนวน case ทั้งหมด", kind: "int", width: 15 },
      {
        key: "percent",
        header: "สัดส่วน ICD ที่ผิด (%)",
        kind: "computed",
        compute: "percent",
        numerator: "wrong",
        denominator: "total",
        width: 14,
      },
      { ...NOTE_COLUMN, width: 19 },
    ],
    summary: "none",
    notes: [],
  },

  // ── C1 : เทียบรายจังหวัด (ระดับเขตสุขภาพ) ─────────────────────────────────
  {
    code: "C1",
    title:
      "ตารางเปรียบเทียบคุณภาพการบันทึกข้อมูลการให้บริการ และคุณภาพการให้รหัส ICD ของสถานพยาบาลในแต่ละจังหวัด",
    scope: "เขตสุขภาพ · เทียบรายจังหวัด",
    sourcePage: "คู่มือ สนย. หน้า 37 (ตัวอย่าง) และ 62 (ฟอร์มเปล่า)",
    meta: [
      { key: "healthZone", label: "เขตสุขภาพ", kind: "text" },
      { key: "periodFrom", label: "ช่วงวันที่ (เริ่ม)", kind: "date" },
      { key: "periodTo", label: "ช่วงวันที่ (ถึง)", kind: "date" },
    ],
    columns: [
      { key: "province", header: "จังหวัด", kind: "text", width: 16 },
      { key: "qualityScore", header: "คะแนนคุณภาพการบันทึกข้อมูล", kind: "text", width: 20 },
      { key: "wrong", header: "จำนวน case ที่ให้รหัสผิด", kind: "int", width: 16 },
      { key: "total", header: "จำนวน case ทั้งหมด", kind: "int", width: 15 },
      {
        key: "percent",
        header: "สัดส่วน ICD ที่ผิด (%)",
        kind: "computed",
        compute: "percent",
        numerator: "wrong",
        denominator: "total",
        width: 14,
      },
      { ...NOTE_COLUMN, width: 19 },
    ],
    summary: "none",
    notes: [],
  },
];

export function getAuditForm(code: string): AuditFormDef | null {
  return AUDIT_FORMS.find((f) => f.code === code.toUpperCase()) ?? null;
}

export function isAuditFormCode(code: string): boolean {
  return getAuditForm(code) !== null;
}
