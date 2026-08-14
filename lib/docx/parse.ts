// lib/docx/parse.ts
// อ่าน DOCX → plain text ด้วย mammoth (สเปกข้อ 3 / 9)

import mammoth from "mammoth";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class DocxParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DocxParseError";
  }
}

export type ParsedDocx = {
  text: string;
  /** ข้อความเตือนจาก mammoth (เช่น style ที่แปลงไม่ได้) — เก็บไว้ debug */
  warnings: string[];
};

/**
 * แปลง DOCX buffer เป็น plain text
 * - normalize CRLF → LF และตัดบรรทัดว่างซ้อนเกิน 2 บรรทัด (กัน token บวมโดยเปล่าประโยชน์)
 * - ไม่ตัดช่องว่างต้นบรรทัด เพราะการเยื้องมีความหมายกับฟอร์มบันทึกผู้ป่วย
 */
export async function parseDocx(buffer: Buffer): Promise<ParsedDocx> {
  let result: Awaited<ReturnType<typeof mammoth.extractRawText>>;
  try {
    result = await mammoth.extractRawText({ buffer });
  } catch (e) {
    throw new DocxParseError("อ่านไฟล์ DOCX ไม่สำเร็จ — ไฟล์อาจเสียหายหรือไม่ใช่ .docx", {
      cause: e,
    });
  }

  const text = result.value
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) {
    throw new DocxParseError("ไฟล์ DOCX ไม่มีข้อความที่อ่านได้");
  }

  return { text, warnings: result.messages.map((m) => m.message) };
}
