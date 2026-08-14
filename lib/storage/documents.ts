// lib/storage/documents.ts
// เก็บไฟล์ที่อัปโหลดลง volume (สเปกข้อ 3: ./data/documents:/app/data/documents)
// ไม่เก็บ binary ใน DB — DB เก็บแค่ filePath

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";

// turbopackIgnore: path นี้ประกอบตอน runtime จาก env — ไม่ใช่ import ที่ต้อง trace
// ถ้าไม่ปิด Turbopack จะเหมาเอาไฟล์ทั้งโปรเจกต์ (รวม public/) เข้า output
const ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), env.DOCUMENT_STORAGE_DIR);

/**
 * ทำชื่อไฟล์ให้ปลอดภัย — กัน path traversal (../) และอักขระที่ทำ path พัง
 * คงชื่อไทยไว้ได้ เพราะผู้ใช้ต้องอ่านออกตอนโหลดกลับ
 */
export function safeFileName(original: string): string {
  const base = path.basename(original).replace(/[\\/\0]/g, "_");
  const cleaned = base.replace(/[<>:"|?*]/g, "_").trim();
  return cleaned.slice(0, 150) || "document.docx";
}

export type StoredFile = {
  /** path สัมพัทธ์กับ storage root — เก็บลง Document.filePath */
  filePath: string;
  absolutePath: string;
  fileName: string;
  fileSize: number;
};

/** เขียนไฟล์ลง {ROOT}/{caseId}/{uuid}-{ชื่อไฟล์} */
export async function storeDocument(
  caseId: string,
  originalName: string,
  data: Buffer,
): Promise<StoredFile> {
  const fileName = safeFileName(originalName);
  const relativeDir = path.join(caseId);
  const relativePath = path.join(relativeDir, `${randomUUID()}-${fileName}`);
  const absolutePath = path.join(ROOT, relativePath);

  // กันแน่: path ที่ประกอบแล้วต้องยังอยู่ใต้ ROOT
  if (!absolutePath.startsWith(ROOT + path.sep)) {
    throw new Error("Resolved storage path escapes the storage root");
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, data);

  return { filePath: relativePath, absolutePath, fileName, fileSize: data.byteLength };
}

export function absolutePathFor(filePath: string): string {
  const abs = path.resolve(/* turbopackIgnore: true */ ROOT, filePath);
  if (!abs.startsWith(ROOT + path.sep)) {
    throw new Error("filePath escapes the storage root");
  }
  return abs;
}
