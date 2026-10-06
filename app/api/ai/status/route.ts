// app/api/ai/status/route.ts
// GET — สถานะ AI: ตั้งค่าครบไหม, โควตาหมดอยู่ไหม และจะรีเซ็ตเมื่อไร
// แถบแจ้งเตือนบนทุกหน้าเรียกตัวนี้ จึงต้องเบา (ไม่เรียก AI จริง)

import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { env } from "@/lib/env";
import { currentQuotaBlock, quotaMessage } from "@/lib/ai/quota";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const block = currentQuotaBlock();
  const configured = env.AI_PROVIDER === "gemini" ? !!env.GEMINI_API_KEY : false;

  return NextResponse.json({
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    configured,
    now: new Date().toISOString(),
    quota: block
      ? { blocked: true, scope: block.scope, resetAt: block.resetAt, since: block.since, message: quotaMessage(block) }
      : { blocked: false },
  });
}
