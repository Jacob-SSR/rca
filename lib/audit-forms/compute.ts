// lib/audit-forms/compute.ts
// คิดค่าที่ระบบต้องคิดให้เอง — คะแนนเต็ม/คะแนนที่ได้ต่อแถว สัดส่วน % และบรรทัดสรุปท้ายฟอร์ม
//
// เหตุผลที่ให้ระบบคิดแทนคน: บนกระดาษคนต้องบวกเลขเองทุกแถว แล้วบวกรวมท้ายฟอร์มอีก
// จุดนี้คือที่ที่ฟอร์มกระดาษพลาดบ่อยที่สุด (โดยเฉพาะแถวที่มี na ซึ่งคะแนนเต็มไม่เท่ากับแถวอื่น)
//
// ⚠️ ตัวคูณ/ตัวหารทั้งหมดอยู่ในไฟล์นี้ที่เดียว หน้าจอกับไฟล์ DOCX เรียกตัวเดียวกัน
//    จะได้ไม่มีทางที่เลขบนจอกับในไฟล์ไม่ตรงกัน

import {
  ICD_ERROR_CODES,
  type AuditFormDef,
  type FormColumn,
} from "@/lib/audit-forms/registry";

/** ค่าที่กรอกได้ในหนึ่งช่อง — "na" คือ "ไม่ประเมิน" ตามคู่มือ */
export type CellValue = string | number | "na" | null;
export type SheetRow = Record<string, CellValue>;

export const NA = "na";

/** ปัดเป็นทศนิยม 2 ตำแหน่ง — ต้นฉบับเขียน 2.5 / 57.6 คือทศนิยมไม่เกินหนึ่งถึงสองตำแหน่ง */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** อ่านค่าเป็นตัวเลข — ค่าว่าง/na/อ่านไม่ออก คืน null ไม่ใช่ 0 */
export function num(value: CellValue): number | null {
  if (value === null || value === undefined || value === NA) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function scoreColumns(form: AuditFormDef): FormColumn[] {
  return form.columns.filter((c) => c.kind === "score");
}

/**
 * คะแนนเต็มของแถว
 * คู่มือหน้า 16/26: "ถ้ารายการใดผลการประเมินเป็น na ไม่ต้องนำคะแนนเต็มของรายการนั้นมารวม"
 *
 * ช่องที่ยังไม่ได้กรอก (null) ต่างจาก na — ยังไม่ตรวจ ไม่ใช่ไม่ต้องตรวจ
 * จึงยังนับคะแนนเต็มไว้ ไม่งั้นฟอร์มที่กรอกครึ่งเดียวจะดูเหมือนได้คะแนนดีเกินจริง
 */
export function rowMaxScore(form: AuditFormDef, row: SheetRow): number {
  return scoreColumns(form)
    .filter((c) => row[c.key] !== NA)
    .reduce((sum, c) => sum + (c.max ?? 0), 0);
}

/** คะแนนที่ได้ของแถว — na และช่องว่างนับเป็น 0 คะแนน */
export function rowGotScore(form: AuditFormDef, row: SheetRow): number {
  return scoreColumns(form).reduce((sum, c) => sum + (num(row[c.key]) ?? 0), 0);
}

/** ค่าของช่องที่ระบบคิดให้ — คืน null เมื่อยังคิดไม่ได้ (จะได้แสดงเป็นช่องว่าง ไม่ใช่ 0) */
export function computedValue(
  form: AuditFormDef,
  column: FormColumn,
  row: SheetRow,
): number | null {
  if (column.compute === "maxScore") return rowMaxScore(form, row);
  if (column.compute === "gotScore") return rowGotScore(form, row);

  if (column.compute === "percent") {
    const a = num(row[column.numerator ?? ""]);
    const b = num(row[column.denominator ?? ""]);
    if (a === null || b === null || b === 0) return null;
    return round2((a / b) * 100);
  }

  return null;
}

/** แถวที่ยังไม่ได้กรอกอะไรเลย — ไม่เอาไปรวมในบรรทัดสรุป */
export function isEmptyRow(form: AuditFormDef, row: SheetRow): boolean {
  return form.columns
    .filter((c) => c.kind !== "computed")
    .every((c) => {
      const v = row[c.key];
      return v === null || v === undefined || String(v).trim() === "";
    });
}

export type ScoreSummary = {
  kind: "score";
  rows: number;
  totalScore: number;
  maxScore: number;
  percentage: number | null;
};

export type IcdSummary = {
  kind: "icdError";
  rows: number;
  /** จำนวนของแต่ละสัญลักษณ์ A–H (ไม่รวม Y ที่แปลว่าถูก) */
  errorCounts: Record<string, number>;
  wrongCount: number;
  totalCodes: number;
  percentage: number | null;
};

export type NoSummary = { kind: "none"; rows: number };

export type SheetSummary = ScoreSummary | IcdSummary | NoSummary;

/**
 * บรรทัดสรุปท้ายฟอร์ม
 *
 * A1/A3 → "คะแนนที่ได้ทั้งหมด ___ คะแนนเต็ม ___ สัดส่วน ___ %"
 * A2/A4 → "Error A___ B___ ... จำนวนรหัสที่ผิด ___ รหัสทั้งหมด ___ ผิดพลาด ___ %"
 * B/C   → ต้นฉบับไม่มีบรรทัดสรุป จึงไม่ใส่เพิ่มเอง
 */
export function summarize(form: AuditFormDef, rows: SheetRow[]): SheetSummary {
  const filled = rows.filter((r) => !isEmptyRow(form, r));

  if (form.summary === "score") {
    const totalScore = filled.reduce((s, r) => s + rowGotScore(form, r), 0);
    const maxScore = filled.reduce((s, r) => s + rowMaxScore(form, r), 0);
    return {
      kind: "score",
      rows: filled.length,
      totalScore,
      maxScore,
      percentage: maxScore > 0 ? round2((totalScore / maxScore) * 100) : null,
    };
  }

  if (form.summary === "icdError") {
    const errorCounts: Record<string, number> = Object.fromEntries(
      ICD_ERROR_CODES.map((c) => [c, 0]),
    );

    let totalCodes = 0;

    for (const r of filled) {
      const result = String(r.result ?? "").trim().toUpperCase();
      if (result === "") continue; // ยังไม่ได้ตัดสิน ไม่นับเป็นรหัสที่ตรวจแล้ว
      totalCodes += 1;
      if (result in errorCounts) errorCounts[result] += 1;
    }

    const wrongCount = Object.values(errorCounts).reduce((a, b) => a + b, 0);

    return {
      kind: "icdError",
      rows: filled.length,
      errorCounts,
      wrongCount,
      totalCodes,
      percentage: totalCodes > 0 ? round2((wrongCount / totalCodes) * 100) : null,
    };
  }

  return { kind: "none", rows: filled.length };
}

/**
 * ตรวจค่าที่กรอกมาก่อนบันทึก
 * คืนรายการข้อความผิดพลาด — ว่าง = ผ่าน
 *
 * ตั้งใจให้ "เตือน" ไม่ใช่ "ห้ามบันทึก" ในเรื่องที่ยังกรอกไม่ครบ
 * เพราะคนตรวจกรอกทีละนิดระหว่างเปิดแฟ้มดู ต้องเซฟค้างไว้ได้
 * แต่ค่าที่ผิดกติกาชัดๆ (คะแนนเกินเต็ม, สัญลักษณ์ที่ไม่มีในคู่มือ) ต้องกันไว้
 */
export function validateRow(
  form: AuditFormDef,
  row: SheetRow,
  rowIndex: number,
): string[] {
  const errors: string[] = [];
  const where = `แถวที่ ${rowIndex + 1}`;

  for (const c of form.columns) {
    const raw = row[c.key];
    if (raw === null || raw === undefined || String(raw).trim() === "") continue;

    if (c.kind === "score") {
      if (raw === NA) {
        if (!c.allowNA) errors.push(`${where}: ${c.header} เลือก na ไม่ได้ตามเกณฑ์ในคู่มือ`);
        continue;
      }
      const n = num(raw);
      if (n === null || !Number.isInteger(n)) {
        errors.push(`${where}: ${c.header} ต้องเป็นจำนวนเต็ม`);
      } else if (n < 0 || n > (c.max ?? 0)) {
        errors.push(`${where}: ${c.header} ต้องอยู่ระหว่าง 0 ถึง ${c.max}`);
      }
    }

    if (c.kind === "int") {
      const n = num(raw);
      if (n === null || !Number.isInteger(n) || n < 0) {
        errors.push(`${where}: ${c.header} ต้องเป็นจำนวนเต็มไม่ติดลบ`);
      }
    }

    if (c.kind === "select" && c.options) {
      const v = String(raw).trim().toUpperCase();
      if (!c.options.some((o) => o.code.toUpperCase() === v)) {
        errors.push(`${where}: ${c.header} ไม่มีตัวเลือก "${raw}" ในคู่มือ`);
      }
    }
  }

  // ตัวหารเป็น 0 ไม่ใช่ error แต่ทำให้ % คิดไม่ได้ — เตือนให้รู้ตัว
  for (const c of form.columns) {
    if (c.kind !== "computed" || c.compute !== "percent") continue;
    const a = num(row[c.numerator ?? ""]);
    const b = num(row[c.denominator ?? ""]);
    if (a !== null && (b === null || b === 0)) {
      errors.push(`${where}: กรอก ${c.numerator} แล้วแต่ ${c.denominator} ยังว่างหรือเป็น 0`);
    }
  }

  return errors;
}

export function validateRows(form: AuditFormDef, rows: SheetRow[]): string[] {
  return rows.flatMap((r, i) => (isEmptyRow(form, r) ? [] : validateRow(form, r, i)));
}
