// app/api/admin/ai/route.ts
// POST { action: "probe" } — ทดสอบว่า API key / model ใช้ได้ (ไม่กินโควตา)
// POST { action: "clear" } — ล้างสถานะ "โควตาหมด" เอง เช่น หลังเปลี่ยน key หรืออัปเกรดแพ็กเกจ

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { env } from "@/lib/env";
import { probeGemini } from "@/lib/ai/gemini";
import { clearQuotaBlock } from "@/lib/ai/quota";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireCapability("manage");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: unknown };

  if (body.action === "clear") {
    clearQuotaBlock();
    return NextResponse.json({ ok: true });
  }

  if (body.action === "probe") {
    if (env.AI_PROVIDER !== "gemini") {
      return NextResponse.json({ ok: false, error: `AI_PROVIDER=${env.AI_PROVIDER} ยังไม่รองรับ` });
    }
    if (!env.GEMINI_API_KEY) {
      return NextResponse.json({ ok: false, error: "ยังไม่ได้ตั้ง GEMINI_API_KEY" });
    }
    return NextResponse.json(await probeGemini());
  }

  return NextResponse.json({ error: "action ต้องเป็น probe หรือ clear" }, { status: 400 });
}
