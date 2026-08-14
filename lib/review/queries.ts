// lib/review/queries.ts
// อ่านผลการตรวจสำหรับหน้าจอ / export — ที่เดียว จะได้ไม่มี query ซ้ำสองเวอร์ชัน

import { prisma } from "@/lib/prisma";

export type ReviewDetail = NonNullable<Awaited<ReturnType<typeof getReviewDetail>>>;

export async function getReviewDetail(reviewId: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: {
      case: true,
      document: true,
      criteriaSet: true,
      items: {
        include: { criterion: { include: { levels: { orderBy: { score: "asc" } } } } },
      },
    },
  });

  if (!review) return null;

  // เรียงตามลำดับเกณฑ์ในเอกสาร สนย. (ไม่ใช่ตามลำดับที่ insert)
  const order = ["SERVICE_DATETIME", "CC", "HISTORY", "PHYSICAL_EXAM", "DIAGNOSIS", "TREATMENT"];
  const rank = (code: string) => {
    const i = order.indexOf(code);
    return i === -1 ? order.length : i;
  };

  return {
    ...review,
    percentage: review.percentage?.toString() ?? null,
    items: [...review.items].sort((a, b) => rank(a.criterion.code) - rank(b.criterion.code)),
  };
}

export async function getCaseDetail(caseId: string) {
  return prisma.case.findUnique({
    where: { id: caseId },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      events: { orderBy: [{ eventTime: "asc" }, { createdAt: "asc" }] },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: { document: { select: { fileName: true } } },
      },
    },
  });
}
