// lib/form/service.ts
// งานที่ route handler ของฟอร์มใช้ร่วมกัน — สร้างเคส, generate DOCX, เก็บลง volume
//
// แยกออกจาก route เพราะ "generate เอกสาร" ถูกเรียกจากสองที่
// (POST /generate และ POST /review) ไม่ควรมีสองสำเนาที่ค่อยๆ เพี้ยนกัน

import { prisma } from "@/lib/prisma";
import { storeDocument } from "@/lib/storage/documents";
import { buildRecordDocx, recordDocxFileName, type HospitalInfo } from "@/lib/form/to-docx";
import { DOCX_MIME } from "@/lib/docx/parse";
import { parseDocx } from "@/lib/docx/parse";
import type { RecordFormInput } from "@/lib/form/schema";

export function hospitalInfo(): HospitalInfo {
  return {
    name: process.env.HOSPITAL_NAME || "โรงพยาบาลพลับพลาชัย",
    code: process.env.HOSPITAL_CODE || undefined,
  };
}

/** RCA-YYYYMMDD-NNN โดย NNN นับเฉพาะเคสของวันนั้น */
export async function nextCaseNumber(): Promise<string> {
  const now = new Date();
  const ymd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const prefix = `RCA-${ymd}-`;

  const latest = await prisma.case.findFirst({
    where: { caseNumber: { startsWith: prefix } },
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true },
  });

  const seq = latest ? Number(latest.caseNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export type GeneratedDocument = {
  documentId: string;
  fileName: string;
  version: number;
  textLength: number;
};

/**
 * generate DOCX จากฟอร์ม → เก็บลง volume → สร้างแถว Document
 *
 * ทุกครั้งที่เรียกจะได้ Document ใหม่ (version +1) ไม่ทับของเดิม
 * → Review เก่ายังชี้เอกสารเวอร์ชันที่ใช้ตอนให้คะแนน จึง audit ย้อนหลังได้
 */
export async function generateDocumentFromForm(formId: string): Promise<GeneratedDocument> {
  const form = await prisma.recordForm.findUnique({
    where: { id: formId },
    include: { case: { select: { id: true, caseNumber: true } } },
  });

  if (!form) throw new Error(`ไม่พบฟอร์ม id=${formId}`);

  const input = form as unknown as RecordFormInput;

  const buffer = await buildRecordDocx(input, hospitalInfo());
  const fileName = recordDocxFileName(input, form.case.caseNumber);

  const stored = await storeDocument(form.caseId, fileName, buffer);

  // parse กลับทันที — เก็บ extractedText ไว้ และเป็นการยืนยันว่าเอกสารที่สร้าง
  // อ่านกลับได้จริง ถ้า generate ออกมาเสียจะรู้ตั้งแต่ตรงนี้ ไม่ใช่ไปพังตอน AI
  const parsed = await parseDocx(buffer);

  const version = (await prisma.document.count({ where: { caseId: form.caseId } })) + 1;

  const document = await prisma.document.create({
    data: {
      caseId: form.caseId,
      recordFormId: form.id,
      fileName: stored.fileName,
      filePath: stored.filePath,
      mimeType: DOCX_MIME,
      fileSize: stored.fileSize,
      extractedText: parsed.text,
      version,
    },
  });

  return {
    documentId: document.id,
    fileName: document.fileName,
    version,
    textLength: parsed.text.length,
  };
}

/** ฟอร์มนี้ยังว่างเปล่าอยู่ไหม — ใช้เตือนก่อน generate เอกสารเปล่า */
export function isFormEmpty(form: RecordFormInput): boolean {
  return Object.values(form).every((v) => typeof v !== "string" || v.trim().length === 0);
}
