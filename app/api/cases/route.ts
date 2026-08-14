// app/api/cases/route.ts
// GET  /api/cases  — รายการเคส
// POST /api/cases  — สร้างเคสใหม่

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createCaseSchema = z.object({
  caseNumber: z.string().trim().min(1).max(50).optional(),
  title: z.string().trim().max(200).optional(),
});

/** RCA-YYYYMMDD-NNN โดย NNN นับเฉพาะเคสของวันนั้น */
async function nextCaseNumber(): Promise<string> {
  const now = new Date();
  const ymd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const prefix = `RCA-${ymd}-`;

  const latest = await prisma.case.findFirst({
    where: { caseNumber: { startsWith: prefix } },
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true },
  });

  const seq = latest ? Number(latest.caseNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

export async function GET() {
  const cases = await prisma.case.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      _count: { select: { documents: true, reviews: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, totalScore: true, maxScore: true, percentage: true },
      },
    },
  });

  return NextResponse.json(
    cases.map((c) => ({
      id: c.id,
      caseNumber: c.caseNumber,
      title: c.title,
      status: c.status,
      createdAt: c.createdAt,
      documentCount: c._count.documents,
      reviewCount: c._count.reviews,
      latestReview: c.reviews[0]
        ? { ...c.reviews[0], percentage: c.reviews[0].percentage?.toString() ?? null }
        : null,
    })),
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = createCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ข้อมูลไม่ถูกต้อง", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const caseNumber = parsed.data.caseNumber ?? (await nextCaseNumber());

  const existing = await prisma.case.findUnique({ where: { caseNumber } });
  if (existing) {
    return NextResponse.json({ error: `caseNumber ${caseNumber} ถูกใช้แล้ว` }, { status: 409 });
  }

  const created = await prisma.case.create({
    data: { caseNumber, title: parsed.data.title || null },
  });

  return NextResponse.json(created, { status: 201 });
}
