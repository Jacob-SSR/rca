// app/api/forms/[id]/route.ts
// GET    — อ่านฟอร์ม
// PATCH  — แก้ฟอร์ม (ส่งมาเฉพาะช่องที่แก้ก็ได้)
// DELETE — ลบฟอร์ม (ต้องมีสิทธิ์ manage)

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordFormSchema } from "@/lib/form/schema";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/forms/[id]">) {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;

  const form = await prisma.recordForm.findUnique({
    where: { id },
    include: {
      case: { select: { id: true, caseNumber: true, title: true } },
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fileName: true,
          version: true,
          createdAt: true,
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, status: true, totalScore: true, maxScore: true, percentage: true },
          },
        },
      },
    },
  });

  if (!form) return NextResponse.json({ error: "ไม่พบฟอร์ม" }, { status: 404 });

  return NextResponse.json({
    ...form,
    documents: form.documents.map((d) => ({
      ...d,
      reviews: d.reviews.map((r) => ({ ...r, percentage: r.percentage?.toString() ?? null })),
    })),
  });
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/forms/[id]">) {
  let session;
  try {
    session = await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;

  const existing = await prisma.recordForm.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "ไม่พบฟอร์ม" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body ต้องเป็น JSON" }, { status: 400 });
  }

  // partial() → ส่งมาเฉพาะช่องที่แก้ได้ ช่องที่ไม่ส่งมาจะไม่ถูกแตะ
  const parsed = recordFormSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ถูกต้อง", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const form = await prisma.recordForm.update({
    where: { id },
    data: { ...parsed.data, updatedBy: session.username },
  });

  // HN เปลี่ยน → อัปเดตที่เคสด้วย จะได้ค้นหาจากเคสได้ตรงกัน
  if (parsed.data.hn !== undefined) {
    await prisma.case.update({
      where: { id: form.caseId },
      data: { hosxpPatientRef: parsed.data.hn ?? null },
    });
  }

  return NextResponse.json(form);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/forms/[id]">) {
  try {
    await requireCapability("manage");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;

  const form = await prisma.recordForm.findUnique({
    where: { id },
    select: { id: true, _count: { select: { documents: true } } },
  });

  if (!form) return NextResponse.json({ error: "ไม่พบฟอร์ม" }, { status: 404 });

  // มีเอกสารที่ generate ไปแล้ว = อาจมีผลตรวจอ้างอยู่ ลบฟอร์มทิ้งจะทำให้
  // audit ย้อนกลับไปหาต้นทางไม่ได้ — ปฏิเสธไว้ก่อน ให้ลบทั้งเคสแทนถ้าตั้งใจจริง
  if (form._count.documents > 0) {
    return NextResponse.json(
      {
        error: `ฟอร์มนี้สร้างเอกสารไปแล้ว ${form._count.documents} ฉบับ ลบไม่ได้ — ถ้าต้องการลบจริงให้ลบทั้งเคส`,
      },
      { status: 409 },
    );
  }

  await prisma.recordForm.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
