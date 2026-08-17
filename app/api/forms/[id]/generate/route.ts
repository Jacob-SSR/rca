// app/api/forms/[id]/generate/route.ts
// POST — generate DOCX จากฟอร์ม (ยังไม่ตรวจ)
// GET  — ดาวน์โหลด DOCX เวอร์ชันล่าสุดของฟอร์มนี้

import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { generateDocumentFromForm, isFormEmpty } from "@/lib/form/service";
import { absolutePathFor } from "@/lib/storage/documents";
import { DOCX_MIME } from "@/lib/docx/parse";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import type { RecordFormInput } from "@/lib/form/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/forms/[id]/generate">) {
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
      { error: "ฟอร์มยังว่างเปล่า กรุณากรอกข้อมูลก่อนสร้างเอกสาร" },
      { status: 400 },
    );
  }

  try {
    const result = await generateDocumentFromForm(id);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    console.error("generate document failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "สร้างเอกสารไม่สำเร็จ" },
      { status: 500 },
    );
  }
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/forms/[id]/generate">) {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;

  const document = await prisma.document.findFirst({
    where: { recordFormId: id },
    orderBy: { createdAt: "desc" },
  });

  if (!document) {
    return NextResponse.json(
      { error: "ฟอร์มนี้ยังไม่ได้สร้างเอกสาร" },
      { status: 404 },
    );
  }

  const buffer = await readFile(absolutePathFor(document.filePath));

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": DOCX_MIME,
      // ชื่อไฟล์ภาษาไทยต้องผ่าน filename* (RFC 5987) — filename= ธรรมดารับ ASCII เท่านั้น
      "Content-Disposition": `attachment; filename="record.docx"; filename*=UTF-8''${encodeURIComponent(
        document.fileName,
      )}`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
