// lib/docx/parse.ts
// ตัวห่อบางๆ ของ lib/documents/extract.ts สำหรับเส้นทางที่รับ .docx เท่านั้น
// (เอกสารที่ระบบ generate เองจากฟอร์ม + สคริปต์ตรวจ)
//
// ตัวสกัดจริงย้ายไป lib/documents/extract.ts แล้ว เพราะตอนนี้อัปได้ทุกชนิดไฟล์
// ไฟล์นี้คงไว้เพื่อไม่ต้องไล่แก้ทุกจุดที่เรียก และเพื่อให้เส้นทางที่ "ต้องเป็น
// .docx เท่านั้น" ยังบังคับได้เหมือนเดิม (ไฟล์เสีย = throw ไม่ใช่คืนค่าว่าง)

import { DocumentParseError, extractDocument } from "@/lib/documents/extract";

export { DOCX_MIME } from "@/lib/documents/extract";

/** ชื่อเดิม — ยังมีที่เรียกอยู่หลายจุด */
export const DocxParseError = DocumentParseError;
export type DocxParseError = DocumentParseError;

export type ParsedDocx = {
  text: string;
  /** ข้อความเตือนจาก mammoth (เช่น style ที่แปลงไม่ได้) — เก็บไว้ debug */
  warnings: string[];
};

export async function parseDocx(buffer: Buffer): Promise<ParsedDocx> {
  const result = await extractDocument(buffer, "document.docx", "");

  if (result.text.trim() === "") {
    throw new DocumentParseError("ไฟล์ DOCX ไม่มีข้อความที่อ่านได้");
  }

  return { text: result.text, warnings: result.warnings };
}
