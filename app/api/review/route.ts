// app/api/review/route.ts
// POST /api/review — อัปโหลดเอกสารแล้วรัน pipeline ทั้งเส้น (สเปกข้อ 10.11)
//
// รับไฟล์ได้ทุกชนิด แต่จะตรวจคะแนนได้เฉพาะไฟล์ที่สกัดข้อความออกมาได้
// (.docx / .pdf ที่มีข้อความ / ไฟล์ข้อความ) — ชนิดอื่นตอบ 422 พร้อมบอกเหตุผล
// ว่าต้องแปลงเป็นอะไรก่อน ไม่ใช่ปฏิเสธลอยๆ ว่า "รับเฉพาะ .docx"
//
// multipart/form-data:
//   file          (required) ไฟล์เอกสาร
//   caseId        (optional) ถ้าไม่ส่ง จะสร้างเคสใหม่ให้
//   criteriaSet   (optional) default A1_OPD_2015

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { DocumentParseError, detectKind } from "@/lib/documents/extract";
import { AIProviderError } from "@/lib/ai";
import { RuleEngineError } from "@/lib/review/rule-engine";
import { PipelineError, runReviewPipeline, DEFAULT_CRITERIA_SET_CODE } from "@/lib/review/pipeline";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { canModify, NotOwnerError } from "@/lib/auth/ownership";
import type { Session } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
// pipeline มีการเรียก AI — ต้องรันบน Node runtime (mammoth/prisma ใช้ node built-in)
export const runtime = "nodejs";
export const maxDuration = 120;

async function ensureCase(caseId: string | null, session: Session): Promise<string> {
  if (caseId) {
    const found = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, createdBy: true },
    });
    if (!found) throw new PipelineError(`ไม่พบ Case id=${caseId}`, "case-lookup");

    // อัปไฟล์เข้าเคสของคนอื่นไม่ได้ — เอกสารในเคสเดียวกันคือเรื่องเดียวกัน
    // ถ้าใครก็เติมได้ เจ้าของจะควบคุมเนื้อหาในเคสตัวเองไม่ได้
    if (!canModify(session, found)) throw new NotOwnerError("เคสนี้");
    return found.id;
  }

  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const created = await prisma.case.create({
    data: {
      caseNumber: `RCA-${ymd}-${now.getTime().toString().slice(-6)}`,
      createdBy: session.username,
      createdByName: session.name,
    },
  });
  return created.id;
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "ต้องส่งเป็น multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ไม่พบไฟล์ในฟิลด์ 'file'" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "ไฟล์ว่างเปล่า" }, { status: 400 });
  }

  if (file.size > env.MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `ไฟล์ใหญ่เกิน ${Math.round(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB` },
      { status: 413 },
    );
  }

  const criteriaSetCode = (form.get("criteriaSet") as string | null) || DEFAULT_CRITERIA_SET_CODE;

  try {
    const caseId = await ensureCase((form.get("caseId") as string | null) || null, session);
    const data = Buffer.from(await file.arrayBuffer());

    const result = await runReviewPipeline({
      caseId,
      fileName: file.name,
      // เบราว์เซอร์บางตัวส่ง mime ว่าง — เดาจากนามสกุลแทนที่จะเก็บค่าว่าง
      mimeType: file.type || `application/x-${detectKind(file.name, "")}`,
      data,
      criteriaSetCode,
      actor: { username: session.username, name: session.name },
    });

    return NextResponse.json({ caseId, ...result }, { status: 201 });
  } catch (e) {
    if (e instanceof NotOwnerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof DocumentParseError) {
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
      // "extract" = ไฟล์อ่านข้อความไม่ได้ ไม่ใช่ระบบพัง — 422 ให้ผู้ใช้แก้ที่ไฟล์
      if (e.step === "extract") {
        return NextResponse.json({ error: e.message, step: e.step }, { status: 422 });
      }
      const status = e.step === "case-lookup" || e.step === "criteria-lookup" ? 400 : 500;
      return NextResponse.json({ error: e.message, step: e.step }, { status });
    }

    console.error("POST /api/review failed:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
