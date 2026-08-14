// lib/ai/anthropic.ts
// โครงไว้เฉยๆ — Phase 1 ห้าม implement (สเปกข้อ 4 Non-goals)
//
// จุดประสงค์ของไฟล์นี้คือพิสูจน์ว่า abstraction ใน provider.ts ใช้ได้จริงกับ provider ที่สอง
// ตอน implement จริง: ต้องใช้ EXTRACT_FACTS_INSTRUCTION ตัวเดียวกับ gemini.ts
// และคืน ExtractedFacts ที่ผ่าน parseExtractedFacts() เหมือนกัน คะแนนจะได้ไม่เปลี่ยนตาม model

import { env } from "@/lib/env";
import { AIProviderError, type AIProvider } from "@/lib/ai/provider";
import type { ExtractedFacts } from "@/lib/review/types";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  readonly model: string;

  constructor(model: string = env.AI_MODEL) {
    this.model = model;
  }

  async extractFacts(_sanitizedText: string): Promise<ExtractedFacts> {
    void _sanitizedText;
    throw new AIProviderError(
      "Anthropic provider ยังไม่ implement ใน Phase 1 — ตั้ง AI_PROVIDER=gemini",
      this.name,
    );
  }
}
