// lib/documents/extract.ts
// สกัดข้อความจากไฟล์ที่อัปโหลด — รองรับหลายชนิด ไม่ใช่แค่ .docx
//
// หลักการ: "เก็บได้ทุกไฟล์ แต่บอกให้ชัดว่าตรวจอัตโนมัติได้หรือไม่"
//
// ปฏิเสธไฟล์ไปเลยเพราะอ่านข้อความไม่ได้เป็นเรื่องน่ารำคาญ — คนมีสแกนเวชระเบียน
// เป็นรูปอยู่แล้วก็ควรแนบเก็บไว้ในเคสได้ แต่ถ้าปล่อยให้กดตรวจแล้วได้ 0 คะแนน
// เพราะระบบอ่านไม่ออก จะกลายเป็นคะแนนที่ผิดและไม่มีใครรู้ว่าผิดเพราะอะไร
// → เก็บไฟล์เสมอ, สกัดข้อความได้ก็ตรวจได้, สกัดไม่ได้ก็บอกเหตุผลตรงๆ

import mammoth from "mammoth";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class DocumentParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DocumentParseError";
  }
}

export type ExtractResult = {
  /** ข้อความที่อ่านได้ — "" = ชนิดนี้อ่านอัตโนมัติไม่ได้ */
  text: string;
  /** ตรวจด้วย AI ต่อได้ไหม */
  reviewable: boolean;
  /** ถ้าตรวจไม่ได้ บอกเหตุผลที่เอาไปแสดงให้ผู้ใช้อ่านรู้เรื่อง */
  reason?: string;
  warnings: string[];
  /** ชนิดที่ตรวจพบ ไว้เก็บลงฐานและแสดงในรายการ */
  kind: DocKind;
};

export type DocKind = "docx" | "pdf" | "text" | "image" | "other";

/** ทำความสะอาดข้อความก่อนเก็บ/ส่งเข้า AI — ใช้ร่วมกันทุกชนิดไฟล์ */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    // no-break space ที่ Word ใส่มา ทำให้ regex ของตัวปิดบัง PHI ไม่แมตช์
    .replace(/ /g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** เดาชนิดจากนามสกุล — เชื่อถือได้กว่า mimeType ที่เบราว์เซอร์บางตัวส่งมาว่าง */
export function detectKind(fileName: string, mimeType: string): DocKind {
  const ext = (fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "").toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  if (ext === "docx" || mime === DOCX_MIME) return "docx";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["txt", "md", "csv", "log", "json", "rtf"].includes(ext) || mime.startsWith("text/")) {
    return "text";
  }
  if (["png", "jpg", "jpeg", "gif", "bmp", "tif", "tiff", "webp"].includes(ext)) return "image";
  if (mime.startsWith("image/")) return "image";
  return "other";
}

async function extractDocx(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return { text: normalizeText(result.value), warnings: result.messages.map((m) => m.message) };
  } catch (e) {
    throw new DocumentParseError("อ่านไฟล์ .docx ไม่สำเร็จ — ไฟล์อาจเสียหาย", { cause: e });
  }
}

async function extractPdf(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  try {
    // ⚠️ ต้อง import จาก lib/pdf-parse.js ตรงๆ ห้าม import "pdf-parse" เฉยๆ
    //    index.js ของ pkg นี้มี debug branch ที่เปิดไฟล์ทดสอบ
    //    ./test/data/05-versions-space.pdf เมื่อ module.parent เป็น falsy
    //    ซึ่งเป็นกรณีปกติภายใต้ ESM → พังทันทีด้วย ENOENT ที่อ่านไม่รู้เรื่องเลย
    //    (เจอมาแล้วตอนทดสอบกับ PDF จริง)
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const result = await pdfParse(buffer);
    return { text: normalizeText(result.text ?? ""), warnings: [] };
  } catch (e) {
    throw new DocumentParseError("อ่านไฟล์ PDF ไม่สำเร็จ — ไฟล์อาจเสียหายหรือถูกใส่รหัสผ่าน", {
      cause: e,
    });
  }
}

function extractPlainText(buffer: Buffer): { text: string; warnings: string[] } {
  // ลอง UTF-8 ก่อน ถ้าเจอตัวแทนอักขระเสีย (U+FFFD) แปลว่าน่าจะเป็น TIS-620
  // ซึ่งเป็น encoding ที่ HOSxP กับเอกสารราชการเก่าของไทยใช้กันอยู่
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("�")) return { text: normalizeText(utf8), warnings: [] };

  try {
    const tis620 = new TextDecoder("windows-874").decode(buffer);
    return {
      text: normalizeText(tis620),
      warnings: ["ไฟล์ไม่ใช่ UTF-8 — อ่านเป็น TIS-620 แทน"],
    };
  } catch {
    return { text: normalizeText(utf8), warnings: ["อ่าน encoding ไม่ออก อาจมีตัวอักษรเพี้ยน"] };
  }
}

/** เหตุผลที่ตรวจอัตโนมัติไม่ได้ เขียนให้คนอ่านรู้ว่าต้องทำอะไรต่อ */
const CANNOT_REVIEW: Record<Exclude<DocKind, "docx" | "pdf" | "text">, string> = {
  image:
    "ไฟล์รูปภาพยังอ่านข้อความอัตโนมัติไม่ได้ (ระบบไม่มี OCR) — " +
    "เก็บแนบไว้ในเคสได้ แต่ถ้าจะให้ตรวจคะแนน ต้องพิมพ์เป็น .docx หรือ .pdf ที่มีข้อความ",
  other:
    "ชนิดไฟล์นี้อ่านข้อความอัตโนมัติไม่ได้ — เก็บแนบไว้ในเคสได้ " +
    "แต่ถ้าจะให้ตรวจคะแนน ต้องแปลงเป็น .docx หรือ .pdf ก่อน",
};

/**
 * สกัดข้อความจากไฟล์อะไรก็ได้
 * ⚠️ ไม่ throw เมื่อเป็นชนิดที่อ่านไม่ได้ — คืน reviewable: false พร้อมเหตุผลแทน
 *    throw เฉพาะตอนที่ "ควรอ่านได้แต่ไฟล์เสีย" ซึ่งเป็นคนละเรื่องกัน
 */
export async function extractDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ExtractResult> {
  const kind = detectKind(fileName, mimeType);

  if (kind === "image" || kind === "other") {
    return { text: "", reviewable: false, reason: CANNOT_REVIEW[kind], warnings: [], kind };
  }

  const { text, warnings } =
    kind === "docx"
      ? await extractDocx(buffer)
      : kind === "pdf"
        ? await extractPdf(buffer)
        : extractPlainText(buffer);

  if (text.trim() === "") {
    return {
      text: "",
      reviewable: false,
      reason:
        kind === "pdf"
          ? "PDF นี้ไม่มีข้อความให้อ่าน (น่าจะเป็นไฟล์สแกนเป็นรูป) — " +
            "เก็บแนบไว้ได้ แต่ตรวจคะแนนอัตโนมัติไม่ได้"
          : "ไฟล์นี้ไม่มีข้อความที่อ่านได้",
      warnings,
      kind,
    };
  }

  return { text, reviewable: true, warnings, kind };
}
