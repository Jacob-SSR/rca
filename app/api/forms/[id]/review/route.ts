// app/api/forms/[id]/review/route.ts
// POST — สร้างเอกสารจากฟอร์มแล้วสั่งตรวจในคราวเดียว (ปุ่มหลักของหน้าฟอร์ม)
//
// generate ใหม่ทุกครั้งโดยตั้งใจ — ผู้ใช้กดตรวจหลังแก้ฟอร์ม ต้องได้ผลของฉบับล่าสุด
// ไม่ใช่ของเอกสารเวอร์ชันเก่าที่ generate ไว้ก่อนหน้า

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDocumentFromForm, isFormEmpty } from "@/lib/form/service";
import { PipelineError, reviewExistingDocument } from "@/lib/review/pipeline";
import { RuleEngineError } from "@/lib/review/rule-engine";
import { AIProviderError } from "@/lib/ai";
import { DocxParseError } from "@/lib/docx/parse";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import type { RecordFormInput } from "@/lib/form/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/forms/[id]/review">) {
  try {
    await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;

  const form = await prisma.recordForm.findUnique({ where: { id } });
  if (!form) return NextResponse.json({ error: "ไม่พบฟอร์ม" }, { status: 404 });

  if (isFormEmpty(form as unknown as RecordFormInput)) {
    return NextResponse.json(
      { error: "ฟอร์มยังว่างเปล่า กรุณากรอกข้อมูลก่อนสั่งตรวจ" },
      { status: 400 },
    );
  }

  try {
    const generated = await generateDocumentFromForm(id);
    const result = await reviewExistingDocument(generated.documentId);

    return NextResponse.json(
      { caseId: form.caseId, documentVersion: generated.version, ...result },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof DocxParseError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    if (e instanceof AIProviderError) {
      // 502 = ต้นทางฝั่ง AI มีปัญหา ไม่ใช่ผู้ใช้ส่งข้อมูลผิด
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    if (e instanceof RuleEngineError) {
      return NextResponse.json({ error: `Rule Engine: ${e.message}` }, { status: 500 });
    }
    if (e instanceof PipelineError) {
      const status = e.step === "criteria-lookup" ? 400 : 500;
      return NextResponse.json({ error: e.message, step: e.step }, { status });
    }

    console.error("POST /api/forms/[id]/review failed:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
