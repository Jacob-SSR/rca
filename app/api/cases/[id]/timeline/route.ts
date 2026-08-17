// app/api/cases/[id]/timeline/route.ts
// GET  — timeline ของเคส
// PUT  — บันทึก timeline ที่ผู้ใช้แก้ทั้งชุด (สเปกข้อ 9: "ผู้ใช้แก้ไขได้ในหน้าจอ")
//
// การแก้ในหน้าจอทำให้ event นั้นกลายเป็น source="manual"
// รอบ review ถัดไปจะลบเฉพาะ source="ai" ของเดิม — ที่ผู้ใช้แก้เองจึงไม่หาย

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  eventTime: z.string().trim().nullable().default(null),
  title: z.string().trim().min(1, "title ต้องไม่ว่าง").max(500),
});

const putSchema = z.object({ events: z.array(eventSchema).max(200) });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/cases/[id]/timeline">) {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;

  const events = await prisma.timelineEvent.findMany({
    where: { caseId: id },
    // eventTime null ไปท้ายสุด — MySQL เรียง NULL ก่อนเมื่อ asc จึงต้องเรียงสองชั้น
    orderBy: [{ eventTime: "asc" }, { createdAt: "asc" }],
  });

  const withTime = events.filter((e) => e.eventTime !== null);
  const withoutTime = events.filter((e) => e.eventTime === null);

  return NextResponse.json([...withTime, ...withoutTime]);
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/cases/[id]/timeline">) {
  try {
    await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;

  const caseRow = await prisma.case.findUnique({ where: { id }, select: { id: true } });
  if (!caseRow) {
    return NextResponse.json({ error: "ไม่พบเคส" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body ต้องเป็น JSON" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ถูกต้อง", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const rows = parsed.data.events.map((e) => {
    const t = e.eventTime ? new Date(e.eventTime) : null;
    return {
      caseId: id,
      eventTime: t && !Number.isNaN(t.getTime()) ? t : null,
      title: e.title,
      source: "manual",
    };
  });

  await prisma.$transaction([
    prisma.timelineEvent.deleteMany({ where: { caseId: id } }),
    ...(rows.length > 0 ? [prisma.timelineEvent.createMany({ data: rows })] : []),
  ]);

  return NextResponse.json({ saved: rows.length });
}
