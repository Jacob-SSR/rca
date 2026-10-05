// lib/form/validate.ts
// ตรวจความถูกต้องของฟอร์มบนหน้าจอก่อนกดบันทึก/ตรวจ — บอกเป็นรายช่อง
//
// แยกสองระดับ
//   error   = บันทึกไม่ได้จริง (รูปแบบผิด / ยาวเกิน) — ปุ่มบันทึกจะไม่ยิง API
//   warning = บันทึกได้ แต่น่าจะผิด หรือจะเสียคะแนน — แจ้งให้เห็น ไม่ขวาง
//
// ⚠️ ไม่บังคับให้กรอกครบ (ดูเหตุผลใน lib/form/schema.ts) — ช่องว่างไม่ใช่ error

import { FORM_SECTIONS, recordFormSchema } from "@/lib/form/schema";
import { isIsoDate } from "@/lib/form/thai-date";

export type Issue = { field: string; level: "error" | "warning"; message: string };

const HN = /^[A-Za-z0-9-]{1,20}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ICD_ONLY_LINE = /^\(?[A-Z]\d{2}(\.?\d{1,2})?\)?$/i;

const LABEL = new Map(
  FORM_SECTIONS.flatMap((s) => s.fields.map((f) => [f.name as string, f.label] as const)),
);

export const fieldLabel = (name: string) => LABEL.get(name) ?? name;

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export function validateRecordForm(values: Record<string, string>): Issue[] {
  const out: Issue[] = [];
  const get = (k: string) => (values[k] ?? "").trim();

  // ── ความยาวเกิน / รูปแบบตาม schema (ตัวเดียวกับฝั่ง API) ──────────────────
  const parsed = recordFormSchema.safeParse(values);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      const max = (issue as { maximum?: number | bigint }).maximum;
      out.push({
        field,
        level: "error",
        message:
          issue.code === "too_big" && max !== undefined
            ? `ยาวเกิน ${String(max)} ตัวอักษร`
            : "รูปแบบไม่ถูกต้อง",
      });
    }
  }

  const hn = get("hn");
  if (hn && !HN.test(hn)) {
    out.push({ field: "hn", level: "error", message: "HN ต้องเป็นตัวเลข/ตัวอักษร ไม่เกิน 20 ตัว" });
  }

  const date = get("serviceDate");
  if (date) {
    if (!isIsoDate(date)) {
      out.push({ field: "serviceDate", level: "warning", message: "วันที่ไม่ใช่รูปแบบปฏิทิน — เลือกจากปฏิทินใหม่" });
    } else if (Number(date.slice(0, 4)) > 2400) {
      out.push({
        field: "serviceDate",
        level: "error",
        message: "ปีเป็น พ.ศ. — ในช่องปฏิทินให้เลือกปีปฏิทินของเครื่อง (ระบบแปลงเป็น พ.ศ. ในเอกสารให้เอง)",
      });
    } else if (date > todayIso()) {
      out.push({ field: "serviceDate", level: "error", message: "วันที่มารับบริการอยู่ในอนาคต" });
    }
  }

  const time = get("serviceTime");
  if (time && !TIME.test(time)) {
    out.push({ field: "serviceTime", level: "error", message: "เวลาต้องเป็น ชม:นาที เช่น 09:30" });
  }

  const age = get("age");
  if (age && !/\d/.test(age)) {
    out.push({ field: "age", level: "warning", message: 'อายุควรมีตัวเลข เช่น "52 ปี"' });
  }

  // คำวินิจฉัยที่เป็นรหัสล้วน = 0 คะแนนแน่นอน เตือนตั้งแต่ตอนพิมพ์
  const dxLines = get("diagnosis").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const codeOnly = dxLines.filter((l) => ICD_ONLY_LINE.test(l));
  if (codeOnly.length > 0) {
    out.push({
      field: "diagnosis",
      level: "warning",
      message: `มีบรรทัดที่เป็นรหัส ICD อย่างเดียว (${codeOnly.join(", ")}) — ต้องเขียนชื่อโรคเป็นคำเต็ม`,
    });
  }

  return out;
}

/** ฟอร์มว่างทั้งฟอร์ม — ตรวจ/สร้างเอกสารไม่ได้ */
export function isBlank(values: Record<string, string>): boolean {
  return Object.values(values).every((v) => (v ?? "").trim() === "");
}
