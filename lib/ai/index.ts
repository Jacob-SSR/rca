// lib/ai/index.ts
// เลือก provider จาก env.AI_PROVIDER (สเปกข้อ 6)

import { env } from "@/lib/env";
import { GeminiProvider } from "@/lib/ai/gemini";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import type { AIProvider } from "@/lib/ai/provider";

export function getAIProvider(): AIProvider {
  switch (env.AI_PROVIDER) {
    case "gemini":
      return new GeminiProvider();
    case "anthropic":
      return new AnthropicProvider();
  }
}

export type { AIProvider };
export { AIProviderError } from "@/lib/ai/provider";
