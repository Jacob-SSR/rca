// lib/audit-forms/service.ts
// CRUD ของแผ่นงานแบบฟอร์มตรวจสอบคุณภาพ
//
// ทุกทางเข้า (API / หน้าเว็บ) ต้องผ่านที่นี่ จะได้ตรวจค่าและตัด key แปลกปลอมที่เดียว

import { prisma } from "@/lib/prisma";
import { getAuditForm, type AuditFormDef } from "@/lib/audit-forms/registry";
import { validateRows, type CellValue, type SheetRow } from "@/lib/audit-forms/compute";

export class AuditFormError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AuditFormError";
  }
}

/**
 * รับเฉพาะคีย์ที่ฟอร์มนั้นมีจริง
 *
 * ⚠️ สำคัญกว่าที่คิด — rows เก็บเป็น JSON ถ้ารับทุกอย่างที่ client ส่งมา
 *    ใครก็ยัดข้อมูลอะไรก็ได้เข้าฐานผ่านฟอร์มนี้ และช่องคำนวณที่ client ส่งมา
 *    จะกลายเป็นค่าที่เชื่อไม่ได้ (คนแก้ตัวเลขในหน้าเว็บแล้วคะแนนเพี้ยน)
 *    ช่อง computed จึงถูกตัดทิ้งเสมอ แล้วคิดใหม่ตอนแสดง/ตอนออกไฟล์
 */
function sanitizeRows(form: AuditFormDef, input: unknown): SheetRow[] {
  if (!Array.isArray(input)) return [];

  const editable = form.columns.filter((c) => c.kind !== "computed");

  return input.slice(0, 1000).map((raw) => {
    const row: SheetRow = {};
    const src = (raw ?? {}) as Record<string, unknown>;

    for (const c of editable) {
      const v = src[c.key];
      if (v === null || v === undefined) {
        row[c.key] = null;
        continue;
      }
      // เก็บเป็น string เสมอ ยกเว้นตัวเลข — JSON จาก client ปนชนิดกันมั่ว
      row[c.key] = (typeof v === "number" ? v : String(v).trim().slice(0, 500)) as CellValue;
    }

    return row;
  });
}

function sanitizeMeta(form: AuditFormDef, input: unknown): Record<string, string> {
  const src = (input ?? {}) as Record<string, unknown>;
  const meta: Record<string, string> = {};
  for (const f of form.meta) {
    meta[f.key] = String(src[f.key] ?? "").trim().slice(0, 200);
  }
  return meta;
}

export type AuditSheetInput = {
  formCode: string;
  title?: string | null;
  meta?: unknown;
  rows?: unknown;
  actor?: string | null;
};

function prepare(input: AuditSheetInput) {
  const form = getAuditForm(input.formCode);
  if (!form) throw new AuditFormError(`ไม่รู้จักแบบฟอร์ม "${input.formCode}"`, 404);

  const rows = sanitizeRows(form, input.rows);

  // ค่าที่ผิดกติกาชัดๆ ต้องไม่เข้าฐาน — ที่กรอกไม่ครบยังเซฟค้างได้
  const errors = validateRows(form, rows);
  if (errors.length > 0) {
    throw new AuditFormError(errors.slice(0, 10).join("\n"), 422);
  }

  return { form, rows, meta: sanitizeMeta(form, input.meta) };
}

export async function createAuditSheet(input: AuditSheetInput) {
  const { form, rows, meta } = prepare(input);

  return prisma.auditSheet.create({
    data: {
      formCode: form.code,
      title: (input.title ?? "").trim().slice(0, 200) || null,
      meta,
      rows,
      createdBy: input.actor ?? null,
      updatedBy: input.actor ?? null,
    },
  });
}

export async function updateAuditSheet(id: string, input: AuditSheetInput) {
  const existing = await prisma.auditSheet.findUnique({ where: { id } });
  if (!existing) throw new AuditFormError("ไม่พบแผ่นงานนี้", 404);

  // ห้ามเปลี่ยนชนิดฟอร์มของแผ่นที่กรอกไปแล้ว — คอลัมน์คนละชุด ข้อมูลเดิมจะกลายเป็นขยะ
  if (input.formCode.toUpperCase() !== existing.formCode) {
    throw new AuditFormError("เปลี่ยนชนิดแบบฟอร์มของแผ่นที่สร้างแล้วไม่ได้", 409);
  }

  const { form, rows, meta } = prepare(input);

  return prisma.auditSheet.update({
    where: { id },
    data: {
      title: (input.title ?? "").trim().slice(0, 200) || null,
      meta,
      rows,
      updatedBy: input.actor ?? null,
      formCode: form.code,
    },
  });
}

export async function deleteAuditSheet(id: string) {
  const existing = await prisma.auditSheet.findUnique({ where: { id } });
  if (!existing) throw new AuditFormError("ไม่พบแผ่นงานนี้", 404);
  await prisma.auditSheet.delete({ where: { id } });
}

export async function getAuditSheet(id: string) {
  const sheet = await prisma.auditSheet.findUnique({ where: { id } });
  if (!sheet) return null;

  const form = getAuditForm(sheet.formCode);
  if (!form) return null;

  return {
    ...sheet,
    form,
    meta: (sheet.meta ?? {}) as Record<string, string>,
    // กันข้อมูลเก่าที่ schema ของฟอร์มเปลี่ยนไปแล้ว — ตัดให้เหลือคีย์ที่ยังมีอยู่
    rows: sanitizeRows(form, sheet.rows),
  };
}

export async function listAuditSheets(formCode?: string) {
  return prisma.auditSheet.findMany({
    where: formCode ? { formCode: formCode.toUpperCase() } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      formCode: true,
      title: true,
      meta: true,
      rows: true,
      updatedAt: true,
      updatedBy: true,
    },
  });
}
