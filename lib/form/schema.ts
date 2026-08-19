// lib/form/schema.ts
// Zod ของฟอร์มบันทึกเวชระเบียน — ใช้ร่วมกันทั้ง API และ UI
// จะได้ไม่มีกฎ validation สองชุดที่ค่อยๆ เพี้ยนออกจากกัน
//
// ทุกช่องเป็น optional โดยตั้งใจ: ระบบนี้ตรวจ "คุณภาพการบันทึก"
// ถ้าบังคับกรอกครบก่อนบันทึกได้ ก็จะไม่มีวันเจอเอกสารที่บันทึกไม่ครบให้ตรวจ
// — ซึ่งคือสิ่งที่ระบบนี้มีไว้เพื่อหา

import { z } from "zod";

/** ตัดช่องว่างหัวท้าย และเปลี่ยนสตริงว่างเป็น null (ให้ DB เก็บ NULL ไม่ใช่ "") */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

export const recordFormSchema = z.object({
  // ── ข้อมูลผู้ป่วย ──────────────────────────────────────────────────────────
  hn: text(20),
  patientName: text(200),
  age: text(50),
  gender: text(20),
  department: text(100),
  pttype: text(100),

  // ── SERVICE_DATETIME (เกณฑ์ข้อ 1, เต็ม 1) ──────────────────────────────────
  serviceDate: text(50),
  serviceTime: text(20),

  // ── CC (ข้อ 2, เต็ม 2) ─────────────────────────────────────────────────────
  chiefComplaint: text(2000),

  // ── HISTORY (ข้อ 3, เต็ม 3) ────────────────────────────────────────────────
  presentIllness: text(5000),
  pastHistory: text(5000),
  personalHistory: text(5000),

  // ── PHYSICAL_EXAM (ข้อ 4, เต็ม 4) ──────────────────────────────────────────
  vitalSigns: text(2000),
  physicalExam: text(5000),
  labResult: text(5000),

  // ── DIAGNOSIS (ข้อ 5, เต็ม 4) ──────────────────────────────────────────────
  diagnosis: text(5000),

  // ── TREATMENT (ข้อ 6, เต็ม 3) ──────────────────────────────────────────────
  treatment: text(5000),

  note: text(5000),
  recorder: text(200),
});

export type RecordFormInput = z.infer<typeof recordFormSchema>;

/** ตอนสร้างใหม่ ระบุ caseId ได้ (ไม่ระบุ = สร้างเคสใหม่ให้) */
export const createRecordFormSchema = recordFormSchema.extend({
  caseId: z.string().trim().min(1).optional(),
  caseTitle: z.string().trim().max(200).optional(),
});

export type CreateRecordFormInput = z.infer<typeof createRecordFormSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// เมตาดาต้าของช่อง — ใช้สร้าง UI และ DOCX จากที่เดียว
// เพิ่มช่องใหม่ต้องแก้ที่นี่ที่เดียว แล้วทั้งฟอร์มและเอกสารจะตามไปเอง
// ─────────────────────────────────────────────────────────────────────────────

export type FieldKind =
  | "line" // ช่องข้อความบรรทัดเดียว
  | "area" // ช่องข้อความหลายบรรทัด
  | "date" // ปฏิทินให้กดเลือก — เก็บเป็น YYYY-MM-DD
  | "time" // นาฬิกาให้กดเลือก — เก็บเป็น HH:mm
  | "select"; // เลือกจากรายการ

/** ที่มาของตัวเลือกใน dropdown ที่ต้องดึงตอน runtime */
export type OptionSource = "departments" | "pttypes";

export type FormField = {
  name: keyof RecordFormInput;
  label: string;
  kind: FieldKind;
  hint?: string;

  /** kind="select" — ตัวเลือกคงที่ที่รู้ล่วงหน้า */
  options?: readonly string[];

  /** kind="select" — ดึงตัวเลือกจาก HOSxP ตอนเปิดฟอร์ม */
  optionsFrom?: OptionSource;

  /**
   * kind="select" — ยอมให้ใช้ค่าที่ไม่มีในรายการ (พิมพ์ลงไปตรงๆ ได้เลย)
   * จำเป็นสำหรับทุก dropdown ในระบบนี้ เพราะห้ามให้รายการที่ไม่ครบ
   * ขวางการกรอกเวชระเบียน (ถ้าขวาง คนจะเลิกใช้แล้วกลับไปเขียนมือ)
   */
  allowOther?: boolean;
};

/** ตัวเลือกเพศ — LGBTQ ถือเป็นตัวเลือกตั้งต้น ไม่ใช่ "อื่นๆ" */
export const GENDER_OPTIONS = ["ชาย", "หญิง", "LGBTQ"] as const;

export type FormSection = {
  key: string;
  title: string;
  /** เกณฑ์ A1 ที่หัวข้อนี้ตรงกับ (null = ข้อมูลทั่วไป ไม่ถูกให้คะแนน) */
  criterion: string | null;
  maxScore: number | null;
  fields: FormField[];
};

export const FORM_SECTIONS: FormSection[] = [
  {
    key: "patient",
    title: "ข้อมูลผู้ป่วย",
    criterion: null,
    maxScore: null,
    fields: [
      { name: "hn", label: "HN", kind: "line" },
      { name: "patientName", label: "ชื่อ-สกุล", kind: "line" },
      { name: "age", label: "อายุ", kind: "line", hint: 'เช่น "52 ปี" หรือ "1 ปี 6 เดือน"' },
      {
        name: "gender",
        label: "เพศ",
        kind: "select",
        options: GENDER_OPTIONS,
        allowOther: true,
      },
      {
        name: "department",
        label: "แผนก",
        kind: "select",
        optionsFrom: "departments",
        allowOther: true,
        hint: "พิมพ์เพื่อค้นหา หรือกดลูกศรลงเพื่อดูทั้งหมด — ไม่มีในรายการก็พิมพ์ลงไปได้เลย",
      },
      {
        name: "pttype",
        label: "สิทธิการรักษา",
        kind: "select",
        optionsFrom: "pttypes",
        allowOther: true,
        hint: "พิมพ์เพื่อค้นหา หรือกดลูกศรลงเพื่อดูทั้งหมด — ไม่มีในรายการก็พิมพ์ลงไปได้เลย",
      },
    ],
  },
  {
    key: "service",
    title: "วันเวลาที่มารับบริการ",
    criterion: "SERVICE_DATETIME",
    maxScore: 1,
    fields: [
      {
        name: "serviceDate",
        label: "วันที่",
        kind: "date",
        hint: "กดเลือกจากปฏิทิน — เอกสารจะแสดงเป็นวันที่ไทย พ.ศ. ให้เอง",
      },
      { name: "serviceTime", label: "เวลา", kind: "time", hint: "กดเลือกเวลา" },
    ],
  },
  {
    key: "cc",
    title: "อาการสำคัญ / เหตุผลที่มา",
    criterion: "CC",
    maxScore: 2,
    fields: [
      {
        name: "chiefComplaint",
        label: "อาการสำคัญ (CC)",
        kind: "area",
        hint: "ระบุระยะเวลาด้วยจึงจะได้คะแนนเต็ม เช่น “ไข้ ไอ เจ็บคอ 2 วัน”",
      },
    ],
  },
  {
    key: "history",
    title: "ประวัติการเจ็บป่วย",
    criterion: "HISTORY",
    maxScore: 3,
    fields: [
      { name: "presentIllness", label: "ประวัติปัจจุบัน (PI)", kind: "area" },
      { name: "pastHistory", label: "โรคประจำตัว / ประวัติอดีต (PH)", kind: "area" },
      {
        name: "personalHistory",
        label: "ประวัติส่วนตัว / ปัจจัยเสี่ยง (SH)",
        kind: "area",
        hint: "อาชีพ สูบบุหรี่ สุรา ประวัติครอบครัว แพ้ยา",
      },
    ],
  },
  {
    key: "exam",
    title: "ผลการตรวจร่างกายและผลชันสูตร",
    criterion: "PHYSICAL_EXAM",
    maxScore: 4,
    fields: [
      { name: "vitalSigns", label: "สัญญาณชีพ (V/S)", kind: "area" },
      {
        name: "physicalExam",
        label: "ผลตรวจร่างกาย (PE)",
        kind: "area",
        hint: "บันทึกแยกรายระบบ บรรทัดละระบบ — ต้องมากกว่าสองระบบจึงจะได้คะแนนสูงสุด",
      },
      {
        name: "labResult",
        label: "ผลตรวจชันสูตร (Lab / X-ray)",
        kind: "area",
        hint: "รวมผลเอกซเรย์ด้วย — ส่งตรวจแล้วต้องบันทึกผล ไม่งั้นเสียคะแนน (ไม่ได้ส่งตรวจเลย ไม่เสียคะแนน)",
      },
    ],
  },
  {
    key: "diagnosis",
    title: "คำวินิจฉัยโรค",
    criterion: "DIAGNOSIS",
    maxScore: 4,
    fields: [
      {
        name: "diagnosis",
        label: "คำวินิจฉัย",
        kind: "area",
        hint: "บรรทัดละ 1 โรค เขียนเป็นคำเต็ม ระบุชนิด/ตำแหน่ง — ห้ามใช้รหัส ICD หรือคำย่อ",
      },
    ],
  },
  {
    key: "treatment",
    title: "การรักษา",
    criterion: "TREATMENT",
    maxScore: 3,
    fields: [
      {
        name: "treatment",
        label: "การรักษา",
        kind: "area",
        hint: "บรรทัดละ 1 รายการ ระบุชื่อยา ขนาด รูปแบบ วิธีใช้ ปริมาณ ให้ครบ",
      },
    ],
  },
  {
    key: "other",
    title: "อื่นๆ",
    criterion: null,
    maxScore: null,
    fields: [
      { name: "note", label: "หมายเหตุ", kind: "area" },
      { name: "recorder", label: "ผู้บันทึก", kind: "line" },
    ],
  },
];

/** ชื่อช่องทั้งหมดตามลำดับในฟอร์ม */
export const FORM_FIELD_NAMES = FORM_SECTIONS.flatMap((s) => s.fields.map((f) => f.name));
