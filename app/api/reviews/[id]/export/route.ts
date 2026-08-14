// app/api/reviews/[id]/export/route.ts
// GET — ดาวน์โหลด DOCX สรุปผลการตรวจ (สเปกข้อ 10.13)

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getReviewDetail } from "@/lib/review/queries";
import { buildReviewDocx } from "@/lib/docx/export";
import { DOCX_MIME } from "@/lib/docx/parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/reviews/[id]/export">) {
  const { id } = await ctx.params;

  const review = await getReviewDetail(id);
  if (!review) {
    return NextResponse.json({ error: "ไม่พบผลการตรวจ" }, { status: 404 });
  }

  const timeline = await prisma.timelineEvent.findMany({
    where: { caseId: review.caseId },
    orderBy: [{ eventTime: "asc" }, { createdAt: "asc" }],
  });

  const buffer = await buildReviewDocx(review, timeline);

  const fileName = `RCA-${review.case.caseNumber}-${review.id.slice(-6)}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": DOCX_MIME,
      // ชื่อไฟล์เป็นภาษาไทยได้ผ่าน filename* (RFC 5987) — filename= ธรรมดารับ ASCII เท่านั้น
      "Content-Disposition": `attachment; filename="review.docx"; filename*=UTF-8''${encodeURIComponent(
        fileName,
      )}`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
