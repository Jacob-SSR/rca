// lib/ai/gemini.ts
// Gemini provider — Phase 1 ใช้ตัวนี้ตัวเดียว
//
// เรียก generateContent ครั้งเดียวต่อเอกสาร (สเปกข้อ 2.5) — free tier มี quota จำกัด
// ห้ามวนเรียกทีละเกณฑ์

import { GoogleGenAI } from "@google/genai";
import { env, requireAiApiKey } from "@/lib/env";
import { parseExtractedFacts } from "@/lib/ai/facts.schema";
import {
  AIProviderError,
  EXTRACT_FACTS_INSTRUCTION,
  EXTRACT_FACTS_JSON_SCHEMA,
  type AIProvider,
} from "@/lib/ai/provider";
import type { ExtractedFacts } from "@/lib/review/types";

/** ตัดข้อความยาวเกินไปกัน token บวม — OPD 1 visit ปกติสั้นกว่านี้มาก */
const MAX_INPUT_CHARS = 60_000;

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(model: string = env.AI_MODEL) {
    this.model = model;
    this.client = new GoogleGenAI({ apiKey: requireAiApiKey() });
  }

  async extractFacts(sanitizedText: string): Promise<ExtractedFacts> {
    const text = sanitizedText.slice(0, MAX_INPUT_CHARS);

    let raw: string | undefined;
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts: [{ text: `<เอกสาร>\n${text}\n</เอกสาร>` }] }],
        config: {
          systemInstruction: EXTRACT_FACTS_INSTRUCTION,
          responseMimeType: "application/json",
          responseJsonSchema: EXTRACT_FACTS_JSON_SCHEMA,
          // temperature 0 → facts เดิมจากเอกสารเดิมให้มากที่สุด (ต้อง audit ย้อนหลังได้)
          temperature: 0,
        },
      });
      raw = response.text;
    } catch (e) {
      throw new AIProviderError(
        `เรียก Gemini ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`,
        this.name,
        { cause: e },
      );
    }

    if (!raw?.trim()) {
      throw new AIProviderError("Gemini ตอบกลับเป็นค่าว่าง", this.name);
    }

    let json: unknown;
    try {
      json = JSON.parse(stripCodeFence(raw));
    } catch (e) {
      throw new AIProviderError(`Gemini ตอบกลับไม่ใช่ JSON ที่ parse ได้: ${raw.slice(0, 300)}`, this.name, {
        cause: e,
      });
    }

    try {
      return parseExtractedFacts(json);
    } catch (e) {
      throw new AIProviderError(
        `ผลลัพธ์จาก Gemini ไม่ตรง schema ของ ExtractedFacts: ${
          e instanceof Error ? e.message : String(e)
        }`,
        this.name,
        { cause: e },
      );
    }
  }
}

/** เผื่อ model ห่อ JSON ด้วย ```json แม้จะสั่ง responseMimeType ไว้แล้ว */
function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
}
