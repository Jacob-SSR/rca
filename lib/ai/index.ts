// lib/ai/index.ts
// เลือก provider จาก env.AI_PROVIDER (สเปกข้อ 6)

import { env } from "@/lib/env";
import { GeminiProvider } from "@/lib/ai/gemini";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { AIQuotaError, type AIProvider } from "@/lib/ai/provider";
import { currentQuotaBlock, quotaMessage } from "@/lib/ai/quota";

export function getAIProvider(): AIProvider {
  switch (env.AI_PROVIDER) {
    case "gemini":
      return new GeminiProvider();
    case "anthropic":
      return new AnthropicProvider();
  }
}

/**
 * ตรวจก่อนเริ่มงานที่ต้องใช้ AI — โควตาหมดอยู่ก็ไม่ต้องเริ่ม
 * (ไม่สร้างเคส/เอกสาร/Review ทิ้งไว้ครึ่งทาง และผู้ใช้รู้ทันทีว่าต้องรอเท่าไร)
 */
export function assertAiAvailable(): void {
  const b = currentQuotaBlock();
  if (b) throw new AIQuotaError(quotaMessage(b), env.AI_PROVIDER, b.scope, b.resetAt);
}

/** body + header ของคำตอบ 429 — ทุก route ที่เรียก AI ใช้รูปแบบเดียวกัน หน้าเว็บจะได้อ่านเหมือนกัน */
export function quotaErrorBody(e: AIQuotaError) {
  const retryAfter = Math.max(1, Math.ceil((new Date(e.resetAt).getTime() - Date.now()) / 1000));
  return {
    body: { error: e.message, code: "AI_QUOTA" as const, scope: e.scope, resetAt: e.resetAt },
    init: { status: 429, headers: { "Retry-After": String(retryAfter) } },
  };
}

export type { AIProvider };
export { AIProviderError, AIQuotaError } from "@/lib/ai/provider";
