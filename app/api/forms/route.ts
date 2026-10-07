// app/api/forms/route.ts
// GET  /api/forms  — รายการฟอร์ม
// POST /api/forms  — สร้างฟอร์มใหม่ (สร้างเคสให้ด้วยถ้าไม่ระบุ caseId)

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRecordFormSchema } from "@/lib/form/schema";
import { caseNumberFor } from "@/lib/form/service";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const caseId = searchParams.get("caseId");
  const hn = searchParams.get("hn");

  const forms = await prisma.recordForm.findMany({
    where: {
      ...(caseId ? { caseId } : {}),
      ...(hn ? { hn } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      caseId: true,
      hn: true,
      patientName: true,
      serviceDate: true,
      serviceTime: true,
      chiefComplaint: true,
      source: true,
      updatedAt: true,
      case: { select: { caseNumber: true, title: true } },
      _count: { select: { documents: true } },
    },
  });

  return NextResponse.json(forms);
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = createRecordFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ถูกต้อง", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const { caseId, caseTitle, caseDepartment, ...fields } = parsed.data;

  // ระบุ caseId มา → ต้องมีจริง ; ไม่ระบุ → สร้างเคสใหม่ให้
  let targetCaseId = caseId;
  if (targetCaseId) {
    const found = await prisma.case.findUnique({
      where: { id: targetCaseId },
      select: { id: true },
    });
    if (!found) {
      return NextResponse.json({ error: "ไม่พบเคสที่ระบุ" }, { status: 404 });
    }
  } else {
    const created = await prisma.case.create({
      data: {
        caseNumber: await caseNumberFor(fields.hn, fields.serviceDate),
        title: caseTitle || null,
        hosxpPatientRef: fields.hn ?? null,
        // เจ้าของเคส = คนที่ล็อกอินอยู่ (ไม่งั้นรายการเคสขึ้น "ไม่ทราบ" และเจ้าของแก้/ลบเคสตัวเองไม่ได้)
        createdBy: session.username,
        createdByName: session.name,
        // แผนกที่สร้าง — ไม่ได้เลือกมา ใช้คลินิกของ visit แทน (ยังดีกว่าว่าง)
        department: caseDepartment || fields.department || null,
      },
    });
    targetCaseId = created.id;
  }

  const form = await prisma.recordForm.create({
    data: {
      ...fields,
      caseId: targetCaseId,
      source: "manual",
      createdBy: session.username,
      updatedBy: session.username,
    },
    include: { case: { select: { caseNumber: true } } },
  });

  return NextResponse.json(form, { status: 201 });
}
