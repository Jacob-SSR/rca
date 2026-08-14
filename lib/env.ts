// lib/env.ts
// ตรวจ env ตั้งแต่ตอน import — ให้พังตั้งแต่ boot ถ้าตั้งค่าไม่ครบ
// (ยืมแนวจาก ppc-hos-10667/lib/db.ts ที่ throw ทันทีเมื่อ env หาย
//  แทนที่จะไปพังกลางทางตอนมี request จริง)

import { z } from "zod";

const envSchema = z.object({
  // MySQL ของแอปนี้เอง — ไม่ใช่ HOSxP (Phase 1 ไม่แตะ HOSxP ตาม Non-goals ข้อ 4)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  AI_PROVIDER: z.enum(["gemini", "anthropic"]).default("gemini"),
  AI_MODEL: z.string().default("gemini-2.5-flash"),

  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(), // Phase 1 ยังไม่ใช้ เก็บไว้เฉยๆ

  // โฟลเดอร์เก็บไฟล์ที่อัปโหลด — mount เป็น docker volume (ไม่เก็บไฟล์ใน DB)
  DOCUMENT_STORAGE_DIR: z.string().default("./data/documents"),

  // ขนาดไฟล์สูงสุดที่รับ (ไบต์) — DOCX ของ OPD ปกติไม่เกินหลักไม่กี่ MB
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("\n  ");
  throw new Error(`Invalid environment configuration:\n  ${detail}`);
}

export const env = parsed.data;

/**
 * API key ของ provider ที่เลือกอยู่ ต้องมีจริงตอนจะเรียก AI
 * ไม่เช็คตอน boot เพราะงานบางส่วน (seed, rule engine test) ไม่ต้องใช้ AI
 */
export function requireAiApiKey(): string {
  if (env.AI_PROVIDER === "gemini") {
    if (!env.GEMINI_API_KEY) {
      throw new Error("AI_PROVIDER=gemini but GEMINI_API_KEY is not set");
    }
    return env.GEMINI_API_KEY;
  }
  throw new Error(
    `AI_PROVIDER=${env.AI_PROVIDER} is not implemented in Phase 1 (gemini only)`,
  );
}
