// app/api/cases/[id]/route.ts
// GET    — รายละเอียดเคส
// PATCH  — แก้ชื่อเรื่อง/สถานะ (เจ้าของหรือผู้ดูแลระบบเท่านั้น)
// DELETE — ลบเคสทั้งใบพร้อมเอกสารและผลตรวจ (เจ้าของหรือผู้ดูแลระบบเท่านั้น)

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCapability, requireSession } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { NotOwnerError, requireOwner } from "@/lib/auth/ownership";
import { deleteStoredDocument } from "@/lib/storage/documents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().trim().max(200).nullish(),
  status: z.enum(["DRAFT", "IN_REVIEW", "DONE"]).optional(),
});

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/cases/[id]">) {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;
  const found = await prisma.case.findUnique({
    where: { id },
    include: { documents: true, reviews: true },
  });

  if (!found) return NextResponse.json({ error: "ไม่พบเคสนี้" }, { status: 404 });
  return NextResponse.json({ case: found });
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/cases/[id]">) {
  let session;
  try {
    session = await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;
  const found = await prisma.case.findUnique({ where: { id }, select: { createdBy: true } });
  if (!found) return NextResponse.json({ error: "ไม่พบเคสนี้" }, { status: 404 });

  try {
    requireOwner(session, found, "เคสนี้");
  } catch (e) {
    if (e instanceof NotOwnerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 422 });
  }

  const updated = await prisma.case.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title || null } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
  });

  return NextResponse.json({ case: updated });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/cases/[id]">) {
  let session;
  try {
    session = await requireSession();
    await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;
  const found = await prisma.case.findUnique({
    where: { id },
    select: { createdBy: true, documents: { select: { filePath: true } } },
  });
  if (!found) return NextResponse.json({ error: "ไม่พบเคสนี้" }, { status: 404 });

  try {
    requireOwner(session, found, "เคสนี้");
  } catch (e) {
    if (e instanceof NotOwnerError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  // ลบแถวในฐานก่อน — ถ้าลบไฟล์ก่อนแล้วลบฐานพัง จะเหลือแถวที่ชี้ไปไฟล์ที่หายไป
  // (ReviewItem/Review/TimelineEvent ผูก cascade ไว้แล้วใน schema)
  await prisma.$transaction([
    prisma.reviewItem.deleteMany({ where: { review: { caseId: id } } }),
    prisma.review.deleteMany({ where: { caseId: id } }),
    prisma.timelineEvent.deleteMany({ where: { caseId: id } }),
    prisma.recordForm.deleteMany({ where: { caseId: id } }),
    prisma.document.deleteMany({ where: { caseId: id } }),
    prisma.case.delete({ where: { id } }),
  ]);

  // ไฟล์บน volume ลบทีหลังแบบ best-effort — ลบไม่ได้ก็แค่เหลือไฟล์กำพร้า
  // ไม่ควรทำให้คำขอล้มเพราะข้อมูลในฐานถูกลบไปแล้ว
  for (const d of found.documents) {
    await deleteStoredDocument(d.filePath).catch((e) =>
      console.error("ลบไฟล์เอกสารไม่สำเร็จ:", d.filePath, e),
    );
  }

  return NextResponse.json({ ok: true });
}
