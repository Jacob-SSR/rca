// lib/report/form-a1-query.ts
// ดึงผลการตรวจจากฐานข้อมูลมาเป็นแถวของ Form A1
// แยกจาก lib/report/form-a1.ts เพื่อให้ส่วนคำนวณ/จัดรูปแบบเทสต์ได้โดยไม่ต้องมีฐานข้อมูล

import { prisma } from "@/lib/prisma";
import {
  A1_SCORE_COLUMNS,
  a1Date,
  a1Note,
  a1Time,
  type A1Report,
  type A1Row,
} from "@/lib/report/form-a1";

/**
 * ดึงผลการตรวจในช่วงวันที่มาประกอบเป็นแถวของ Form A1
 *
 * นับเฉพาะ review ที่ตรวจเสร็จแล้ว — ที่ยัง PENDING/FAILED ไม่มีคะแนน
 * ถ้าเอามาใส่จะทำให้ "คะแนนเต็ม" ท้ายฟอร์มเพี้ยน
 */
export async function buildFormA1(opts: {
  from?: Date | null;
  to?: Date | null;
  limit?: number;
}): Promise<A1Report> {
  const { from = null, to = null, limit = 500 } = opts;

  const reviews = await prisma.review.findMany({
    where: {
      status: "DONE",
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      case: { select: { hosxpPatientRef: true, caseNumber: true } },
      document: {
        select: {
          recordForm: { select: { hn: true, serviceDate: true, serviceTime: true } },
        },
      },
      items: { include: { criterion: { select: { code: true, maxScore: true } } } },
    },
  });

  const rows: A1Row[] = reviews.map((r) => {
    const form = r.document.recordForm;
    const byCode = new Map(r.items.map((i) => [i.criterion.code, i]));

    return {
      reviewId: r.id,
      // ฟอร์มมาก่อนเสมอ — เป็นค่าที่คนกรอกยืนยันเอง
      // ไม่มีค่อยตกไปใช้ HN ที่ผูกกับเคสไว้ตอนดึงจาก HOSxP
      hn: (form?.hn ?? r.case.hosxpPatientRef ?? "").trim(),
      date: a1Date(form?.serviceDate),
      time: a1Time(form?.serviceTime),
      scores: A1_SCORE_COLUMNS.map(({ code }) => {
        const item = byCode.get(code);
        if (!item) return null;
        return item.isNA ? "na" : (item.score ?? 0);
      }),
      maxScore: r.maxScore,
      totalScore: r.totalScore,
      note: a1Note(r.items),
    };
  });

  const sumTotal = rows.reduce((s, r) => s + (r.totalScore ?? 0), 0);
  const sumMax = rows.reduce((s, r) => s + (r.maxScore ?? 0), 0);

  return {
    rows,
    from,
    to,
    sumTotal,
    sumMax,
    percentage: sumMax > 0 ? Math.round((sumTotal / sumMax) * 10000) / 100 : null,
  };
}
